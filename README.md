# AidLink — Crisis Response Coordination Platform

AidLink is a real-time crisis coordination platform that monitors X (Twitter) for structural collapse reports in active conflict zones, verifies them using a multi-agent AI pipeline, and surfaces actionable incident data to local response coordinators. Built at ProduHacks 2026.

## How It Works

1. **Scraper** — Playwright scrapes X every hour using Gemini-generated search queries in Arabic, Ukrainian, Farsi, and English. Gemini filters noise, clusters tweets into discrete incidents, and extracts location, casualty estimates, and criticality.

2. **Upload** — Fresh incidents are upserted to Supabase (PostgreSQL), preserving full timestamped history.

3. **Fetch.ai Agent Pipeline** — Three uAgents registered on Agentverse run automatically after each scrape:
   - **Analyst Agent** — fetches post content and scores each incident for reliability using ASI:One
   - **Critic Agent** — independently challenges the analyst's verdict; produces a `confirmed`, `disputed`, or `unreliable` final verdict
   - **Coordinator Agent** — synthesises all verdicts into a per-region resource allocation brief

4. **Frontend** — Coordinators see a live map of verified incidents with criticality tiers, casualty estimates, manpower needs, and AI-generated deployment recommendations.

## Features

- **Live crisis map** — Leaflet map with Gaza and Ukraine views, incident markers color-coded by criticality, and an open incidents panel
- **Incident drawer** — Full incident detail: reliability verdict, analyst/critic scores, casualty and manpower estimates, source posts, and media
- **Organizer dashboard** — Verify incidents, assign volunteers, advance assignment statuses, check-in modal, and resolve incidents
- **AI reliability scoring** — Every incident gets an independent analyst + critic score; disputed or unreliable incidents are flagged, not hidden
- **Regional allocation briefs** — Coordinator agent produces a per-region summary: overall state, priority incident ordering, concrete resource recommendations, and external support needs
- **Hourly automation** — Scheduler runs scrape → upload → analysis pipeline automatically

## Tech Stack

**Frontend**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui components
- React Hook Form + Zod
- Leaflet / react-leaflet
- Zustand
- Prisma + SQLite

**Backend**
- Python
- Playwright (X scraping)
- Google Gemini 2.5 Flash (query generation, tweet clustering, incident extraction)
- Fetch.ai uAgents + Agentverse (multi-agent reliability pipeline)
- ASI:One / asi1-mini (analyst and critic LLM)
- Supabase (PostgreSQL — incidents, analyses, region reports)

## Setup

### Frontend

```bash
npm install

# Configure database
# Ensure .env contains: DATABASE_URL="file:./dev.db"

npx prisma generate
npx prisma db push
npm run db:seed   # seeds Gaza-area incidents, volunteers, sample reports

npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Backend

```bash
pip install playwright uagents uagents-core openai supabase google-genai python-dotenv httpx
playwright install chromium
```

Create a `.env` file:

```
# Gemini
GEMINI_API_KEY=...

# ASI:One — https://asi1.ai/dashboard/api-keys
ASI_ONE_API_KEY=...

# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Agent seeds (set once, never change)
ANALYST_SEED=...
CRITIC_SEED=...
COORDINATOR_SEED=...

# Agent addresses (fill after first run)
ANALYST_ADDRESS=agent1q...
CRITIC_ADDRESS=agent1q...
COORDINATOR_ADDRESS=agent1q...

# Scheduler interval (default 60)
INTERVAL_MINUTES=60
```

Run the Supabase schema files in order via the SQL editor:
1. `supabase_schema.sql`
2. `supabase_agents_schema.sql`

### Running the Pipeline

Start the two persistent agents:

```bash
# Terminal 1
python critic.py

# Terminal 2
python coordinator.py
```

Start the scheduler (manages the analyst automatically):

```bash
# Terminal 3
python scheduler.py
```

The scheduler runs `main.py` (scrape) → `upload_to_supabase.py` (sync) → restarts `analyst.py` (analysis pipeline) every hour.

### First-Time Agent Setup

On first run, each agent prints its address:
```
INFO: Analyst agent address: agent1q...
```

Copy each address into `.env`, then click the inspector link printed in each terminal → Connect → Mailbox to register on Agentverse. Restart all agents once addresses are set.

## Demo Flow

1. **Landing** → **View Crisis Map** or **Organizer Dashboard**
2. **Public map** → Switch between Gaza and Ukraine views → Click a marker → Read reliability verdict, casualty estimates, source posts
3. **Organizer** → Log in as Organizer (demo) → Select incident → Verify, edit, assign volunteers, check in, or resolve
4. **Incident detail** → `/map/incident/[id]` → Time urgency tier, situation summary, inbound reports

## Project Structure

```
app/
  page.tsx                        # Landing
  map/page.tsx                    # Public crisis map
  map/incident/[id]/page.tsx      # Incident detail
  dashboard/page.tsx              # Organizer map
  api/                            # REST handlers
components/
  GazaCrisisMap.tsx
  OrganizerMap.tsx
  MapIncidentDrawer.tsx
  OrganizerIncidentDrawer.tsx
  ...
data/
  incidents.json                  # Optional JSON override for map
backend/
  main.py                         # Scraper (Gemini + Playwright)
  upload_to_supabase.py           # Supabase sync
  analyst.py                      # Fetch.ai analyst agent
  critic.py                       # Fetch.ai critic agent
  coordinator.py                  # Fetch.ai coordinator agent
  scheduler.py                    # Hourly automation
  supabase_schema.sql
  supabase_agents_schema.sql
prisma/
  schema.prisma
  seed.ts
```

## Safety Notice

Assignments should be reviewed by qualified coordinators. Do not enter unsafe zones without authorization or proper training.

## Team

Built by Jasper He, Leo Wu, Ethan Hoang, Daniel Zou — ProduHacks 2026
