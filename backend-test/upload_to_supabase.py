"""
upload_to_supabase.py
─────────────────────
Uploads all incident JSON files from incidents/gaza, incidents/iran,
and incidents/ukraine into Supabase, each into their own tables:

  incidents_gaza / incident_snapshots_gaza
  incidents_iran / incident_snapshots_iran
  incidents_ukraine / incident_snapshots_ukraine

- incidents_<region>  → upserted (latest state wins per incident_id)
- incident_snapshots_<region> → append-only history (every file = one row per incident)

Usage:
    pip install supabase python-dotenv
    python upload_to_supabase.py

Env vars required (.env):
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY=eyJ...   ← use the service_role key, NOT anon
"""

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

INCIDENT_DIRS = [
    ("gaza",    "incidents/gaza"),
    ("iran",    "incidents/iran"),
    ("ukraine", "incidents/ukraine"),
]


# ── helpers ──────────────────────────────────────────────────────────────────

def parse_snapshot_ts(filename: str) -> str | None:
    """Extract ISO timestamp from filenames like incidents_20250322_143000.json"""
    m = re.search(r"(\d{8})_(\d{6})", filename)
    if not m:
        return None
    try:
        dt = datetime.strptime(f"{m.group(1)}_{m.group(2)}", "%Y%m%d_%H%M%S")
        return dt.replace(tzinfo=timezone.utc).isoformat()
    except ValueError:
        return None


def flatten_incident(inc: dict, region: str) -> dict:
    """Convert incident dict to flat Supabase row."""
    loc = inc.get("location_centre") or {}
    return {
        "incident_id":              inc["incident_id"],
        "region":                   inc.get("region", region),
        "summary":                  inc.get("summary"),
        "time_of_incident":         inc.get("time_of_incident"),
        "time_since_incident":      inc.get("time_since_incident"),
        "time_source":              inc.get("time_source"),
        "location_lat":             loc.get("lat"),
        "location_lon":             loc.get("lon"),
        "location_radius_km":       inc.get("location_radius_km"),
        "location_source":          inc.get("location_source"),
        "casualties_estimate":      inc.get("casualties_estimate"),
        "casualties":               inc.get("casualties"),
        "casualties_source":        inc.get("casualties_source"),
        "manpower_needed_estimate": inc.get("manpower_needed_estimate"),
        "manpower_needed":          inc.get("manpower_needed"),
        "manpower_source":          inc.get("manpower_source"),
        "criticality":              inc.get("criticality"),
        "criticality_reason":       inc.get("criticality_reason"),
        "confidence":               inc.get("confidence"),
        "confidence_score":         inc.get("confidence_score"),
        "confidence_reason":        inc.get("confidence_reason"),
        "verification":             inc.get("verification"),
        "posts":                    json.dumps(inc.get("posts", [])),
        "media":                    json.dumps(inc.get("media", [])),
        "last_updated":             inc.get("last_updated"),
    }


# ── main upload ───────────────────────────────────────────────────────────────

def upload(supabase: Client):
    total_incidents = 0
    total_snapshots = 0
    skipped_files   = 0

    for region, dir_path in INCIDENT_DIRS:
        incidents_table  = f"incidents_{region}"
        snapshots_table  = f"incident_snapshots_{region}"

        folder = Path(dir_path)
        if not folder.exists():
            print(f"⚠️  Directory not found, skipping: {dir_path}")
            continue

        json_files = sorted(folder.glob("*.json"))
        print(f"\n{'─' * 55}")
        print(f"📂 [{region.upper()}] {len(json_files)} files → {incidents_table}")

        for json_file in json_files:
            print(f"\n  📄 {json_file.name}")
            try:
                with open(json_file, encoding="utf-8") as f:
                    incidents: list[dict] = json.load(f)
            except Exception as e:
                print(f"     ❌ Failed to read: {e}")
                skipped_files += 1
                continue

            if not incidents:
                print(f"     ⚠️  Empty file, skipping")
                continue

            snapshot_ts = parse_snapshot_ts(json_file.name)

            # ── 1. Upsert into incidents_<region> ──────────────────────────
            rows = [flatten_incident(inc, region) for inc in incidents]
            try:
                result = (
                    supabase.table(incidents_table)
                    .upsert(rows, on_conflict="incident_id")
                    .execute()
                )
                upserted = len(result.data) if result.data else len(rows)
                print(f"     ✅ {incidents_table}: {upserted} upserted")
                total_incidents += upserted
            except Exception as e:
                print(f"     ❌ {incidents_table} upsert failed: {e}")
                skipped_files += 1
                continue

            # ── 2. Append to incident_snapshots_<region> ───────────────────
            snapshot_rows = [
                {
                    "incident_id":   inc["incident_id"],
                    "region":        inc.get("region", region),
                    "snapshot_file": json_file.name,
                    "snapshot_ts":   snapshot_ts,
                    "raw":           json.dumps(inc),
                }
                for inc in incidents
            ]
            try:
                result = (
                    supabase.table(snapshots_table)
                    .insert(snapshot_rows)
                    .execute()
                )
                inserted = len(result.data) if result.data else len(snapshot_rows)
                print(f"     📸 {snapshots_table}: {inserted} inserted")
                total_snapshots += inserted
            except Exception as e:
                print(f"     ❌ {snapshots_table} insert failed: {e}")

    print(f"\n{'═' * 55}")
    print(f"✅ Upload complete")
    print(f"   incidents rows upserted : {total_incidents}")
    print(f"   snapshot rows inserted  : {total_snapshots}")
    if skipped_files:
        print(f"   ⚠️  files skipped        : {skipped_files}")
    print(f"{'═' * 55}")


if __name__ == "__main__":
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
        exit(1)

    print("🔗 Connecting to Supabase...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"   URL: {SUPABASE_URL}")
    upload(supabase)