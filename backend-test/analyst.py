"""
analyst_agent.py — Layer 1
Reads each incident + fetches post content, scores reliability via ASI:One.
Run with: python analyst_agent.py
"""

import json
import os
import re
import time
import httpx
from datetime import datetime
from uuid import uuid4

from dotenv import load_dotenv
from openai import OpenAI
from supabase import create_client
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

load_dotenv()

# ── clients ───────────────────────────────────────────────────────────────────

asi = OpenAI(
    api_key=os.getenv("ASI_ONE_API_KEY"),
    base_url="https://api.asi1.ai/v1",
)

supa = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY"),
)

# Addresses of downstream agents — paste printed addresses after first run
CRITIC_ADDRESS     = os.getenv("CRITIC_ADDRESS", "")
COORDINATOR_ADDRESS = os.getenv("COORDINATOR_ADDRESS", "")

# ── agent ─────────────────────────────────────────────────────────────────────

agent = Agent(
    name="crisis_incident_analyst",
    seed=os.getenv("ANALYST_SEED", "analyst_seed_please_change_me"),
    port=8001,
    mailbox=True,
    network="testnet",
    publish_agent_details=True,
)

protocol = Protocol(spec=chat_protocol_spec)

# ── helpers ───────────────────────────────────────────────────────────────────

async def fetch_post_content(post_urls: list[str], max_posts: int = 5) -> str:
    snippets = []
    
    # filter to only real URLs
    valid_urls = [u for u in (post_urls or []) if isinstance(u, str) and u.startswith("http")]
    
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        for url in valid_urls[:max_posts]:
            try:
                encoded = httpx.URL(url)  # validates the URL
                oembed = f"https://publish.twitter.com/oembed?url={url}&omit_script=true"
                r = await client.get(oembed)
                if r.status_code == 200:
                    html = r.json().get("html", "")
                    text = re.sub(r"<[^>]+>", " ", html)
                    text = re.sub(r"\s+", " ", text).strip()
                    if text:
                        snippets.append(f"[{url}]\n{text[:400]}")
                        continue
            except Exception:
                pass
            snippets.append(f"[{url}]\n(content unavailable — URL as context only)")
    
    return "\n\n".join(snippets) if snippets else "No post content could be fetched."


def call_asi(system: str, user: str) -> str:
    for attempt in range(3):
        try:
            r = asi.chat.completions.create(
                model="asi1-mini",
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user},
                ],
                max_tokens=1500,
                temperature=0.2,
            )
            return r.choices[0].message.content.strip()
        except Exception as e:
            if "429" in str(e):
                wait = 60 * (attempt + 1)
                print(f"⏳ Rate limited, waiting {wait}s...")
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("ASI:One failed after 3 retries")


# ── protocol handlers ─────────────────────────────────────────────────────────

@protocol.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
    # acknowledge receipt
    await ctx.send(sender, ChatAcknowledgement(
        timestamp=datetime.now(),
        acknowledged_msg_id=msg.msg_id,
    ))

    text = "".join(i.text for i in msg.content if isinstance(i, TextContent))

    # startup trigger: analyse all incidents
    if text == "run_pipeline":
        await run_pipeline(ctx)
        return

    # otherwise treat as a single incident payload from another agent
    try:
        payload = json.loads(text)
        inc     = payload["incident"]
        region  = payload["region"]
        await analyse_incident(ctx, inc, region, sender)
    except Exception as e:
        ctx.logger.error(f"Failed to parse message: {e}")


@protocol.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass  # no-op — we don't track acks here


async def run_pipeline(ctx: Context):
    """Load all incidents from Supabase and analyse each one."""
    for region in ["gaza", "iran", "ukraine"]:
        try:
            result = supa.table(f"incidents_{region}").select("*").execute()
            incidents = result.data or []
        except Exception as e:
            ctx.logger.error(f"Failed to load {region}: {e}")
            continue

        ctx.logger.info(f"[{region.upper()}] Loaded {len(incidents)} incidents")
        for inc in incidents:
            await analyse_incident(ctx, inc, region, ctx.agent.address)
            # small delay to avoid rate limiting
            import asyncio
            await asyncio.sleep(2)


async def analyse_incident(ctx: Context, inc: dict, region: str, reply_to: str):
    inc_id = inc["incident_id"]
    ctx.logger.info(f"🔬 Analysing {inc_id[:8]}... ({region.upper()})")

    posts = inc.get("posts", [])
    if isinstance(posts, str):
        try:
            posts = json.loads(posts)
        except Exception:
            posts = []
    # handle case where it's a list but contains a single JSON string
    if isinstance(posts, list) and len(posts) == 1 and isinstance(posts[0], str):
        if posts[0].startswith("["):
            try:
                posts = json.loads(posts[0])
            except Exception:
                pass
    # final safety — keep only real URLs
    posts = [p for p in posts if isinstance(p, str) and p.startswith("http")]
    ctx.logger.info(f"DEBUG valid urls: {posts}")
    post_content = await fetch_post_content(posts)

    system = (
        "You are a humanitarian crisis data analyst specialising in structural collapses. "
        "Assess incident reports extracted from social media for accuracy and reliability. "
        "Return ONLY valid JSON — no markdown, no explanation."
    )
    user = f"""
INCIDENT RECORD (AI-extracted from social media):
{json.dumps(inc, ensure_ascii=False, indent=2)}

RAW POST CONTENT:
{post_content}

Evaluate:
1. Do the posts actually describe a structural collapse at a specific location?
2. Is the location plausible for {region}?
3. Are casualty/manpower estimates grounded in what the posts say?
4. Signs of misclassification (political commentary, metaphor, aggregate stats)?
5. How many independent sources corroborate this?
6. Is time_of_incident plausible given post timestamps?
7. Red flags: single source, vague location, emotional language only, no rescue detail?

Return ONLY this JSON:
{{
  "reliability_score": <float 0.0-1.0>,
  "reliability_label": "<low|medium|high>",
  "reliability_notes": "<2-3 sentences>",
  "analyst_summary":   "<one sentence: what actually happened based on the posts>"
}}
"""
    try:
        raw    = call_asi(system, user)
        parsed = json.loads(raw.replace("```json", "").replace("```", "").strip())
    except Exception as e:
        ctx.logger.error(f"ASI:One error for {inc_id[:8]}: {e}")
        return

    ctx.logger.info(
        f"✅ {inc_id[:8]} → {parsed['reliability_label']} ({parsed['reliability_score']:.2f})"
    )

    # forward result to critic agent
    if CRITIC_ADDRESS:
        critic_payload = json.dumps({
            "incident_id":  inc_id,
            "region":       region,
            "analyst": {
                "reliability_score": parsed["reliability_score"],
                "reliability_label": parsed["reliability_label"],
                "reliability_notes": parsed["reliability_notes"],
                "analyst_summary":   parsed["analyst_summary"],
                "post_content":      post_content[:1000],
            },
        }, ensure_ascii=False)

        await ctx.send(CRITIC_ADDRESS, ChatMessage(
            timestamp = datetime.now(),
            msg_id    = uuid4(),
            content   = [TextContent(type="text", text=critic_payload)],
        ))
    else:
        ctx.logger.warning("CRITIC_ADDRESS not set — set it in .env after first run")


# ── startup: print address ────────────────────────────────────────────────────

@agent.on_event("startup")
async def startup(ctx: Context):
    import asyncio
    ctx.logger.info(f"Analyst agent address: {ctx.agent.address}")
    ctx.logger.info("Auto-starting pipeline in 10s...")
    await asyncio.sleep(10)
    await run_pipeline(ctx)


agent.include(protocol, publish_manifest=True)

if __name__ == "__main__":
    agent.run()