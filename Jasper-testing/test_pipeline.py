import asyncio
import json
import os
import time
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
from playwright.async_api import async_playwright
from google import genai
import shutil

INCIDENTS_DIR = "incidents"
INCIDENTS_FILE = "incidents/latest.json"


load_dotenv()
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# ── Configurable thresholds ──────────────────────────────────────────────────
CRITICALITY_THRESHOLDS = {
    "critical":       24,      # hours — incidents within this window
    "needs_support":  72,      # hours — incidents within this window
    # anything beyond needs_support = "cleanup"
}

CASUALTIES = {
    "few":  10,    # < 10
    "some": 50,    # 10–50
    # > 50 = "many"
}

MANPOWER = {
    "small":    5,    # < 5 responders needed
    "moderate": 20,   # 5–20
    # > 20 = "large"
}

VERIFICATION = {
    "initial":   3,   # 1–3 posts
    "confident": 8,   # 4–8 posts
    # 9+ = "verified"
}

# Gaza bounding box — strictly filter to this area
GAZA_BOUNDS = {
    "lat_min": 31.2167,
    "lat_max": 31.5985,
    "lon_min": 34.2167,
    "lon_max": 34.5765,
    "center":  {"lat": 31.4, "lon": 34.35},
    "description": "Gaza Strip, Palestine"
}

# ── Helpers ──────────────────────────────────────────────────────────────────
def hours_since(iso_timestamp: str) -> float:
    try:
        dt = datetime.fromisoformat(iso_timestamp.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600
    except:
        return 0

def get_criticality(hours: float) -> str:
    if hours <= CRITICALITY_THRESHOLDS["critical"]:
        return "critical"
    elif hours <= CRITICALITY_THRESHOLDS["needs_support"]:
        return "needs_support"
    return "cleanup"

def get_casualties_category(count: int) -> str:
    if count < CASUALTIES["few"]:
        return "few"
    elif count < CASUALTIES["some"]:
        return "some"
    return "many"

def get_manpower_category(count: int) -> str:
    if count < MANPOWER["small"]:
        return "small"
    elif count < MANPOWER["moderate"]:
        return "moderate"
    return "large"

def get_verification(post_count: int) -> str:
    if post_count <= VERIFICATION["initial"]:
        return "initial_reports"
    elif post_count <= VERIFICATION["confident"]:
        return "confident"
    return "verified"

def load_incidents() -> list[dict]:
    if os.path.exists(INCIDENTS_FILE):  # INCIDENTS_FILE = "incidents/latest.json"
        with open(INCIDENTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def save_incidents(incidents: list[dict]):
    os.makedirs(INCIDENTS_DIR, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    timestamped = f"{INCIDENTS_DIR}/incidents_{timestamp}.json"
    
    # Save timestamped copy
    with open(timestamped, "w", encoding="utf-8") as f:
        json.dump(incidents, f, ensure_ascii=False, indent=2)
    
    # Overwrite latest
    with open(INCIDENTS_FILE, "w", encoding="utf-8") as f:
        json.dump(incidents, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 Saved {len(incidents)} incidents")
    print(f"   📄 Timestamped: {timestamped}")
    print(f"   📄 Latest:      {INCIDENTS_FILE}")

def is_in_gaza(lat: float, lon: float) -> bool:
    return (
        GAZA_BOUNDS["lat_min"] <= lat <= GAZA_BOUNDS["lat_max"] and
        GAZA_BOUNDS["lon_min"] <= lon <= GAZA_BOUNDS["lon_max"]
    )

# ── Gemini ───────────────────────────────────────────────────────────────────
def call_gemini(prompt: str) -> str:
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            return response.text.strip()
        except Exception as e:
            if "429" in str(e):
                wait = 60 * (attempt + 1)
                print(f"  ⏳ Rate limited. Waiting {wait}s... (attempt {attempt+1}/3)")
                time.sleep(wait)
            else:
                raise e
    raise Exception("Gemini failed after 3 retries")

# ── STEP 1: Generate queries ─────────────────────────────────────────────────
def generate_queries() -> list[str]:
    prompt = """
    You are helping a humanitarian crisis response tool find reports of building collapses
    and people trapped in rubble in Gaza.

    Generate 6 Twitter/X search queries ONLY for:
    - Building collapses in Gaza
    - People trapped under rubble in Gaza
    - Rescue operations at collapse sites in Gaza
    - Reports of structures falling on people in Gaza

    STRICT RULES:
    - Gaza only — include "Gaza" or Arabic equivalent "غزة" in every query
    - Focus on COLLAPSE and TRAPPED IN RUBBLE only
    - Exclude: donations, GoFundMe, illness, sickness, hospital appeals
    - Include Arabic terms: انهيار (collapse), مبنى (building), تحت الأنقاض (under rubble),
      عالقون (trapped), إنقاذ (rescue), ضحايا (casualties)
    - Use -is:retweet to avoid duplicates
    - Use -GoFundMe -donate -donation -sick -hospital to filter noise
    - Keep each query under 500 characters
    - Return ONLY a JSON array of query strings, nothing else

    Example format: ["query1", "query2"]
    """
    text = call_gemini(prompt).replace("```json", "").replace("```", "").strip()
    queries = json.loads(text)
    print(f"\n✅ Gemini generated {len(queries)} queries:")
    for q in queries:
        print(f"   • {q}")
    return queries

# ── STEP 2: Scrape X ─────────────────────────────────────────────────────────
async def scrape_twitter(queries: list[str], max_per_query: int = 15) -> list[dict]:
    all_tweets = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )

        with open("x_cookies.json") as f:
            cookies = json.load(f)
        await context.add_cookies(cookies)

        page = await context.new_page()
        print("\n⏳ Loading X...")
        await page.goto("https://x.com/home")
        await page.wait_for_timeout(3000)

        if "login" in page.url:
            print("❌ Cookies expired — re-run get_cookies.py")
            await browser.close()
            return []

        print("✅ Logged in!")

        for query in queries:
            print(f"\n🔍 Scraping: {query[:70]}...")
            encoded = query.replace(" ", "%20").replace("#", "%23").replace(":", "%3A")
            url = f"https://x.com/search?q={encoded}&src=typed_query&f=live"

            await page.goto(url)
            await page.wait_for_timeout(3000)

            tweets_found = 0
            last_height = 0

            while tweets_found < max_per_query:
                elements = await page.query_selector_all('article[data-testid="tweet"]')

                for el in elements:
                    if tweets_found >= max_per_query:
                        break
                    try:
                        text_el  = await el.query_selector('[data-testid="tweetText"]')
                        time_el  = await el.query_selector("time")
                        link_el  = await el.query_selector('a[href*="/status/"]')

                        if not text_el:
                            continue

                        text      = await text_el.inner_text()
                        timestamp = await time_el.get_attribute("datetime") if time_el else None
                        link      = await link_el.get_attribute("href") if link_el else None
                        post_url  = f"https://x.com{link}" if link else None

                        # Collect media URLs
                        media = []
                        img_els   = await el.query_selector_all('img[src*="pbs.twimg.com/media"]')
                        video_els = await el.query_selector_all('video')
                        for img in img_els:
                            src = await img.get_attribute("src")
                            if src:
                                media.append({"type": "image", "url": src})
                        for vid in video_els:
                            src = await vid.get_attribute("src")
                            if src:
                                media.append({"type": "video", "url": src})

                        if not any(t["post_url"] == post_url for t in all_tweets):
                            all_tweets.append({
                                "text":       text,
                                "timestamp":  timestamp,
                                "post_url":   post_url,
                                "media":      media,
                                "query_used": query,
                                "scraped_at": datetime.utcnow().isoformat(),
                            })
                            tweets_found += 1
                            print(f"   [{tweets_found}] {text[:80]}...")
                    except:
                        continue

                current_height = await page.evaluate("document.body.scrollHeight")
                if current_height == last_height:
                    break
                last_height = current_height
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(2000)

        await browser.close()

    print(f"\n📦 Total tweets scraped: {len(all_tweets)}")
    return all_tweets

# ── STEP 3: Gemini clusters tweets into incidents ────────────────────────────
def cluster_into_incidents(tweets: list[dict], existing_incidents: list[dict]) -> list[dict]:
    if not tweets:
        return existing_incidents

    tweets_text = json.dumps([{
        "text":      t["text"],
        "timestamp": t["timestamp"],
        "post_url":  t["post_url"],
        "media":     t["media"],
    } for t in tweets], ensure_ascii=False)

    existing_text = json.dumps([{
        "incident_id": i["incident_id"],
        "summary":     i.get("summary", ""),
        "location":    i.get("location_centre", {}),
        "first_seen":  i.get("time_of_incident", ""),
    } for i in existing_incidents], ensure_ascii=False)

    prompt = f"""
    You are a humanitarian crisis analyst for Gaza. Your job is to cluster tweets about
    building collapses and people trapped in rubble into discrete incidents.

    Gaza bounding box: lat {GAZA_BOUNDS['lat_min']}–{GAZA_BOUNDS['lat_max']}, lon {GAZA_BOUNDS['lon_min']}–{GAZA_BOUNDS['lon_max']}

    EXISTING INCIDENTS (do not duplicate these):
    {existing_text}

    NEW TWEETS TO PROCESS:
    {tweets_text}

    RULES:
    1. Only include tweets about building collapses or people trapped in rubble in Gaza
    2. Ignore: donations, GoFundMe, illness, sickness, general war commentary
    3. Group tweets referring to the same incident together
    4. Match to existing incidents where possible (same location + time window)
    5. For each NEW incident or UPDATE to existing, return a JSON object
    6. All coordinates MUST be within Gaza bounds above
    7. For location_centre: triangulate from place names mentioned. Use your knowledge
       of Gaza neighborhoods. If uncertain, use Gaza center {GAZA_BOUNDS['center']}
    8. For location_radius_km: estimate based on how many distinct locations mentioned
       and uncertainty level (0.1 = single building, 0.5 = neighborhood, 2.0 = district)
    9. For casualties_estimate: use numbers mentioned in tweets, or estimate based on
       building type, time of day, neighborhood density
    10. For manpower_needed_estimate: estimate responders based on casualties and radius
    11. time_of_incident: earliest timestamp from matching tweets (ISO format)
    12. For existing incident updates: include the existing incident_id

    Return a JSON array. Each object must have:
    {{
      "incident_id": "existing ID if update, else null",
      "is_update": true/false,
      "summary": "one sentence describing the incident",
      "location_centre": {{"lat": float, "lon": float}},
      "location_radius_km": float,
      "casualties_estimate": integer,
      "manpower_needed_estimate": integer,
      "time_of_incident": "ISO timestamp of earliest report",
      "post_urls": ["url1", "url2"],
      "media_urls": [{{"type": "image|video", "url": "..."}}],
      "location_source": "gemini",
      "casualties_source": "gemini",
      "manpower_source": "gemini"
    }}

    Return ONLY valid JSON array, no markdown, no explanation.
    """

    text = call_gemini(prompt).replace("```json", "").replace("```", "").strip()
    clustered = json.loads(text)
    print(f"\n🤖 Gemini identified {len(clustered)} incident clusters")
    return clustered

# ── STEP 4: Merge into incidents list ───────────────────────────────────────
def merge_incidents(clustered: list[dict], existing: list[dict]) -> list[dict]:
    incidents = {i["incident_id"]: i for i in existing}

    for c in clustered:
        # Validate coordinates are within Gaza
        loc = c.get("location_centre", {})
        lat = loc.get("lat", 0)
        lon = loc.get("lon", 0)
        if not is_in_gaza(lat, lon):
            print(f"  ⚠️  Skipping incident outside Gaza bounds: {lat}, {lon}")
            continue

        existing_id = c.get("incident_id")
        is_update   = c.get("is_update", False)

        if is_update and existing_id and existing_id in incidents:
            inc = incidents[existing_id]
            print(f"  🔄 Updating incident {existing_id[:8]}...")

            # Merge post URLs
            existing_urls = set(inc.get("posts", []))
            new_urls      = set(c.get("post_urls", []))
            inc["posts"]  = list(existing_urls | new_urls)

            # Merge media
            existing_media = {m["url"]: m for m in inc.get("media", [])}
            for m in c.get("media_urls", []):
                existing_media[m["url"]] = m
            inc["media"] = list(existing_media.values())

            # Only update non-human-verified fields
            for field, source_field in [
                ("location_centre",    "location_source"),
                ("location_radius_km", "location_source"),
                ("casualties_estimate","casualties_source"),
                ("manpower_needed_estimate", "manpower_source"),
            ]:
                if inc.get(source_field) != "human_verified":
                    inc[field]        = c.get(field, inc.get(field))
                    inc[source_field] = "gemini"

            # Recalculate derived fields
            post_count      = len(inc["posts"])
            hours           = hours_since(inc["time_of_incident"])
            inc["criticality"]          = get_criticality(hours)
            inc["time_since_incident"]  = f"{hours:.1f}h"
            inc["verification"]         = get_verification(post_count)
            inc["casualties"]           = get_casualties_category(inc.get("casualties_estimate", 0))
            inc["manpower_needed"]      = get_manpower_category(inc.get("manpower_needed_estimate", 0))
            inc["last_updated"]         = datetime.utcnow().isoformat()

        else:
            # New incident
            new_id  = str(uuid.uuid4())
            hours   = hours_since(c.get("time_of_incident", datetime.utcnow().isoformat()))
            posts   = c.get("post_urls", [])

            inc = {
                "incident_id":              new_id,
                "summary":                  c.get("summary", ""),
                "time_of_incident":         c.get("time_of_incident", datetime.utcnow().isoformat()),
                "time_since_incident":      f"{hours:.1f}h",
                "criticality":              get_criticality(hours),
                "location_centre":          c.get("location_centre", GAZA_BOUNDS["center"]),
                "location_radius_km":       c.get("location_radius_km", 0.5),
                "location_source":          "gemini",
                "casualties_estimate":      c.get("casualties_estimate", 0),
                "casualties":               get_casualties_category(c.get("casualties_estimate", 0)),
                "casualties_source":        "gemini",
                "manpower_needed_estimate": c.get("manpower_needed_estimate", 0),
                "manpower_needed":          get_manpower_category(c.get("manpower_needed_estimate", 0)),
                "manpower_source":          "gemini",
                "verification":             get_verification(len(posts)),
                "posts":                    posts,
                "media":                    c.get("media_urls", []),
                "last_updated":             datetime.utcnow().isoformat(),
            }
            incidents[new_id] = inc
            print(f"  ✅ New incident: {inc['summary'][:60]}...")

    return list(incidents.values())

# ── STEP 5: Recalculate time-based fields on every run ───────────────────────
def refresh_time_fields(incidents: list[dict]) -> list[dict]:
    for inc in incidents:
        hours = hours_since(inc["time_of_incident"])
        inc["time_since_incident"] = f"{hours:.1f}h"
        inc["criticality"]         = get_criticality(hours)
    return incidents

# ── Main ─────────────────────────────────────────────────────────────────────
async def main():
    print("=" * 60)
    print("🚨 Gaza Crisis Incident Tracker")
    print("=" * 60)

    # Load existing incidents
    existing = load_incidents()
    print(f"📂 Loaded {len(existing)} existing incidents")

    # Step 1: Generate queries
    queries = generate_queries()

    # Step 2: Scrape X
    tweets = await scrape_twitter(queries, max_per_query=15)

    if not tweets:
        print("❌ No tweets scraped")
        # Still refresh time fields on existing incidents
        existing = refresh_time_fields(existing)
        save_incidents(existing)
        return

    # Step 3: Cluster into incidents
    clustered = cluster_into_incidents(tweets, existing)

    # Step 4: Merge
    updated = merge_incidents(clustered, existing)

    # Step 5: Refresh time-based fields
    updated = refresh_time_fields(updated)

    # Save
    save_incidents(updated)

    # Summary
    print("\n📊 Summary:")
    for inc in sorted(updated, key=lambda x: x["time_of_incident"], reverse=True):
        print(f"  [{inc['criticality'].upper()}] {inc['summary'][:55]}...")
        print(f"    📍 {inc['location_centre']} ±{inc['location_radius_km']}km")
        print(f"    👥 Casualties: {inc['casualties']} | 🔧 Manpower: {inc['manpower_needed']}")
        print(f"    🕐 {inc['time_since_incident']} ago | ✅ {inc['verification']} ({len(inc['posts'])} posts)")

if __name__ == "__main__":
    asyncio.run(main())