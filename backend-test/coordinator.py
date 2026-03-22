"""
coordinator_agent.py — Layer 3
Synthesises all analyst+critic verdicts for a region into a resource allocation brief.
Uses asi1-mini (same OpenAI-compatible endpoint, more reliable for structured output).
Run with: python coordinator_agent.py
"""

import json
import os
import time
from datetime import datetime, timezone
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

# ── agent ─────────────────────────────────────────────────────────────────────

agent = Agent(
    name="crisis_regional_coordinator",
    seed=os.getenv("COORDINATOR_SEED", "aidlink-coordinator-v1-b8h4s2y9"),
    port=8003,
    mailbox=True,
    network="testnet",
    publish_agent_details=True,
)

protocol = Protocol(spec=chat_protocol_spec)

# ── helpers ───────────────────────────────────────────────────────────────────

def call_asi(user: str) -> str:
    for attempt in range(3):
        try:
            r = asi.chat.completions.create(
                model="asi1-mini",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a senior humanitarian logistics coordinator. "
                            "You synthesise verified field incident reports into strategic "
                            "resource allocation briefs. Return ONLY valid JSON — "
                            "no markdown, no explanation."
                        ),
                    },
                    {"role": "user", "content": user},
                ],
                max_tokens=2000,
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


def load_incidents_with_analysis(region: str) -> list[dict]:
    """Join incidents with their analysis verdicts."""
    try:
        incidents = supa.table(f"incidents_{region}").select("*").execute().data or []
        analyses  = {
            r["incident_id"]: r
            for r in (supa.table("incident_analyses")
                         .select("*")
                         .eq("region", region)
                         .execute().data or [])
        }
        for inc in incidents:
            analysis = analyses.get(inc["incident_id"], {})
            inc["final_verdict"]    = analysis.get("final_verdict", "unanalysed")
            inc["final_score"]      = analysis.get("final_score", 0.0)
            inc["analyst_summary"]  = analysis.get("analyst_summary", "")
            inc["critic_notes"]     = analysis.get("critic_notes", "")
        return incidents
    except Exception as e:
        print(f"❌ Failed to load {region} data: {e}")
        return []


def save_region_report(row: dict):
    supa.table("region_reports") \
        .upsert(row, on_conflict="region") \
        .execute()


# ── protocol handlers ─────────────────────────────────────────────────────────

@protocol.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(
        timestamp=datetime.now(),
        acknowledged_msg_id=msg.msg_id,
    ))

    text = "".join(i.text for i in msg.content if isinstance(i, TextContent))

    try:
        payload = json.loads(text)
        region  = payload["region"]
    except Exception as e:
        ctx.logger.error(f"Failed to parse message: {e}")
        return

    ctx.logger.info(f"🌍 Synthesising {region.upper()}...")

    incidents = load_incidents_with_analysis(region)
    if not incidents:
        ctx.logger.warning(f"No incidents found for {region}")
        return

    # build concise summary for prompt
    summaries = [{
        "incident_id":          inc["incident_id"],
        "summary":              inc.get("summary"),
        "criticality":          inc.get("criticality"),
        "criticality_reason":   inc.get("criticality_reason"),
        "casualties_estimate":  inc.get("casualties_estimate"),
        "casualties":           inc.get("casualties"),
        "manpower_estimate":    inc.get("manpower_needed_estimate"),
        "manpower_needed":      inc.get("manpower_needed"),
        "time_since":           inc.get("time_since_incident"),
        "time_of_incident":     inc.get("time_of_incident"),
        "time_source":          inc.get("time_source"),
        "location":             inc.get("location_centre"),
        "location_radius_km":   inc.get("location_radius_km"),
        "verification":         inc.get("verification"),
        "post_count":           len(inc.get("posts") or []),
        # analyst/critic verdicts
        "final_verdict":        inc["final_verdict"],
        "final_score":          inc["final_score"],
        "analyst_summary":      inc["analyst_summary"],
        "critic_notes":         inc["critic_notes"],
    } for inc in incidents]

    user = f"""
REGION: {region.upper()}
ALL INCIDENT DATA (include every incident in your response — verdict determines priority, not inclusion):
{json.dumps(summaries, ensure_ascii=False, indent=2)}

Produce a strategic resource allocation brief. Rules:

PRIORITY ORDER for incidents (use this for priority_incidents list):
1. "confirmed" verdict + "critical" criticality
2. "disputed" verdict + "critical" criticality  
3. "confirmed" verdict + "needs_support" criticality
4. "disputed" verdict + "needs_support" criticality
5. Any verdict + "critical" criticality (high casualties or active rescue)
6. Remaining incidents ordered by final_score desc, then casualties_estimate desc

INCLUDE ALL incidents in priority_incidents — even "unreliable" ones go at the bottom.

For each incident consider:
- final_verdict and final_score (reliability of the claim)
- criticality and criticality_reason (urgency)
- casualties_estimate and casualties (scale of need)
- manpower_needed_estimate (resources required)
- time_since (how long ago — older = less urgent unless still active)
- location (geographic clustering — nearby incidents can share resources)
- verification (how many posts corroborate)

ALLOCATION RULES:
- "confirmed" or "disputed" → allocate resources, cite incident_id explicitly
- "unreliable" → flag as unverified, recommend monitoring only, do NOT deploy resources
- Geographic clusters → recommend shared resource deployment
- Acknowledge data gaps honestly

Return ONLY this JSON:
{{
  "overall_state":       "<2-3 sentence situation summary for {region}>",
  "priority_incidents":  ["<incident_id>", ...],
  "resource_allocation": "<concrete paragraph per actionable incident: what resources, where, why — cite incident_ids>",
  "manpower_summary":    "<total manpower needed across confirmed/disputed incidents, gaps, and what unreliable incidents would need if verified>",
  "additional_support":  "<what external support is needed and why>",
  "confidence_in_data":  "<low|medium|high>"
}}
"""

    try:
        raw    = call_asi(user)
        parsed = json.loads(raw.replace("```json", "").replace("```", "").strip())
    except Exception as e:
        ctx.logger.error(f"ASI:One error for {region}: {e}")
        return

    save_region_report({
        "region":              region,
        "overall_state":       parsed["overall_state"],
        "priority_incidents":  json.dumps(parsed["priority_incidents"]),
        "resource_allocation": parsed["resource_allocation"],
        "manpower_summary":    parsed["manpower_summary"],
        "additional_support":  parsed["additional_support"],
        "confidence_in_data":  parsed["confidence_in_data"],
        "generated_at":        datetime.now(timezone.utc).isoformat(),
    })

    ctx.logger.info(f"✅ [{region.upper()}] Report saved")
    ctx.logger.info(f"   State: {parsed['overall_state'][:100]}...")
    ctx.logger.info(f"   Confidence: {parsed['confidence_in_data']}")

    # signal end of this session
    await ctx.send(sender, ChatMessage(
        timestamp = datetime.now(),
        msg_id    = uuid4(),
        content   = [EndSessionContent(type="end-session")],
    ))


@protocol.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


@agent.on_event("startup")
async def startup(ctx: Context):
    ctx.logger.info(f"Coordinator agent address: {ctx.agent.address}")


agent.include(protocol, publish_manifest=True)

if __name__ == "__main__":
    agent.run()