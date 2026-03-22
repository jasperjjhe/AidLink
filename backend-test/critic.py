"""
critic_agent.py — Layer 2
Independently challenges analyst verdicts via ASI:One, computes final score.
Run with: python critic_agent.py
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

COORDINATOR_ADDRESS = os.getenv("COORDINATOR_ADDRESS", "")

# ── agent ─────────────────────────────────────────────────────────────────────

agent = Agent(
    name="crisis_incident_critic",
    seed=os.getenv("CRITIC_SEED", "aidlink-critic-v1-n3j6w1r5t0"),
    port=8002,
    mailbox=True,
    network="testnet",
    publish_agent_details=True,
)

protocol = Protocol(spec=chat_protocol_spec)

# track per-region completion
region_pending: dict[str, set] = {"gaza": set(), "iran": set(), "ukraine": set()}
region_loaded:  dict[str, bool] = {"gaza": False, "iran": False, "ukraine": False}

# ── helpers ───────────────────────────────────────────────────────────────────

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


def save_analysis(row: dict):
    supa.table("incident_analyses") \
        .upsert(row, on_conflict="incident_id") \
        .execute()


def load_region_if_needed(region: str):
    """Cache the set of incident IDs for a region so we know when all are done."""
    if not region_loaded[region]:
        try:
            result = supa.table(f"incidents_{region}").select("incident_id").execute()
            region_pending[region] = {r["incident_id"] for r in (result.data or [])}
            region_loaded[region]  = True
        except Exception as e:
            print(f"❌ Failed to load incident IDs for {region}: {e}")


# ── protocol handlers ─────────────────────────────────────────────────────────

@protocol.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(
        timestamp=datetime.now(),
        acknowledged_msg_id=msg.msg_id,
    ))

    text = "".join(i.text for i in msg.content if isinstance(i, TextContent))

    try:
        payload    = json.loads(text)
        inc_id     = payload["incident_id"]
        region     = payload["region"]
        analyst    = payload["analyst"]
    except Exception as e:
        ctx.logger.error(f"Failed to parse message: {e}")
        return

    load_region_if_needed(region)

    ctx.logger.info(f"🧐 Critiquing {inc_id[:8]}... ({region.upper()})")

    system = (
        "You are a sceptical second analyst reviewing a colleague's reliability "
        "assessment of a crisis incident extracted from social media. "
        "Challenge the verdict independently. "
        "Return ONLY valid JSON — no markdown, no explanation."
    )
    user = f"""
ANALYST VERDICT:
- Score: {analyst['reliability_score']}
- Label: {analyst['reliability_label']}
- Notes: {analyst['reliability_notes']}
- Summary: {analyst['analyst_summary']}

POST CONTENT THE ANALYST USED:
{analyst['post_content']}

Challenge the analyst independently. Consider:
1. Did analyst overlook red flags?
2. Was evidence over- or under-weighted?
3. Is the score too generous or too harsh?
4. Any signs of duplicate, misclassification, or fabricated report?

final_verdict rules (apply strictly):
- "confirmed"   → both scores within 0.2 AND both >= 0.5
- "disputed"    → scores differ by > 0.2 OR one is below 0.4
- "unreliable"  → both scores < 0.4

Return ONLY this JSON:
{{
  "agrees_with_analyst": <true|false>,
  "critic_score":        <float 0.0-1.0>,
  "critic_label":        "<low|medium|high>",
  "critic_notes":        "<2-3 sentences>",
  "final_verdict":       "<confirmed|disputed|unreliable>"
}}
"""
    try:
        raw    = call_asi(system, user)
        parsed = json.loads(raw.replace("```json", "").replace("```", "").strip())
    except Exception as e:
        ctx.logger.error(f"ASI:One error for {inc_id[:8]}: {e}")
        return

    final_score = round((analyst["reliability_score"] + parsed["critic_score"]) / 2, 3)

    ctx.logger.info(
        f"✅ {inc_id[:8]} → verdict={parsed['final_verdict']} score={final_score:.2f}"
    )

    # save combined analysis to Supabase
    save_analysis({
        "incident_id":       inc_id,
        "region":            region,
        "analyst_score":     analyst["reliability_score"],
        "analyst_label":     analyst["reliability_label"],
        "analyst_notes":     analyst["reliability_notes"],
        "analyst_summary":   analyst["analyst_summary"],
        "critic_agrees":     parsed["agrees_with_analyst"],
        "critic_score":      parsed["critic_score"],
        "critic_label":      parsed["critic_label"],
        "critic_notes":      parsed["critic_notes"],
        "final_verdict":     parsed["final_verdict"],
        "final_score":       final_score,
        "post_content_used": analyst["post_content"],
        "analysed_at":       datetime.now(timezone.utc).isoformat(),
    })

    # mark done; trigger coordinator when region is complete
    region_pending[region].discard(inc_id)
    remaining = len(region_pending[region])
    ctx.logger.info(f"[{region.upper()}] {remaining} incidents still pending")

    if remaining == 0 and COORDINATOR_ADDRESS:
        ctx.logger.info(f"🏁 [{region.upper()}] All done — triggering coordinator")
        await ctx.send(COORDINATOR_ADDRESS, ChatMessage(
            timestamp = datetime.now(),
            msg_id    = uuid4(),
            content   = [TextContent(type="text", text=json.dumps({"region": region}))],
        ))
    elif remaining == 0 and not COORDINATOR_ADDRESS:
        ctx.logger.warning("COORDINATOR_ADDRESS not set — set it in .env after first run")


@protocol.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


@agent.on_event("startup")
async def startup(ctx: Context):
    ctx.logger.info(f"Critic agent address: {ctx.agent.address}")


agent.include(protocol, publish_manifest=True)

if __name__ == "__main__":
    agent.run()