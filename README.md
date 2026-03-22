# AidLink — Crisis Response Coordination Platform

A hackathon MVP for coordinating relief during emergencies. It helps local organizers triage reports, verify incidents, and assign volunteers—focused on a **Gaza-area crisis map** with optional JSON-backed incident data and a SQLite database for organizer workflows.

## Features

- **Landing page** — Hero, mission, CTAs (Crisis Map + Organizer Map), safety disclaimer
- **Public crisis map** — Leaflet map with **Gaza view** / **World map**, Gaza strip outline, zone summaries, and an open-incidents panel. Incidents load from `data/incidents.json` when present, otherwise from the API (Prisma), and are **scoped to the Gaza fly bounds** for display.
- **Incident drawer (public)** — Rich incident summary from JSON (criticality, casualty/manpower estimates, media, source posts) and a **phone contact** for offering help (no in-app volunteer signup on this path).
- **Incident report page** — `/map/incident/[id]` shows database-backed detail: verification, severity, **time-urgency** tier, injuries estimate, situation summary, and inbound **report** feed when seeded.
- **Organizer map** (`/dashboard`) — Map-first organizer workspace (not a separate metrics “command center”):
  - Demo **Log in as Organizer** (client-side Zustand persist; no real auth server)
  - Same map UX as the public view plus **organizer incident drawer**: verify, edit fields, **resolve** (remove from open map), assign volunteers, move assignments through statuses, **check-in code** modal
  - Bottom **open incidents** strip with counts and quick actions
  - Periodic refresh (≈15s) when logged in
  - If the DB has no open incidents, **JSON incidents** can still appear as a read-only fallback on the map

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui-style components
- React Hook Form + Zod
- Prisma + SQLite
- Leaflet (react-leaflet)
- Zustand

## Setup

```bash
# Install dependencies
npm install

# Configure database (SQLite, file:./dev.db)
# Ensure .env contains: DATABASE_URL="file:./dev.db"

# Generate Prisma client and create database
npx prisma generate
npx prisma db push

# Seed demo data (Gaza-area incidents, duplicate/false examples, 24+ volunteers, sample reports)
npm run db:seed

# Optional: enrich / replace map incidents via JSON pipeline
# Place or update data/incidents.json (see /api/incidents-json)

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo Flow

1. **Landing** → **View Crisis Map** (public) or **Organizer Map** (`/dashboard`).
2. **Public map** → Use **Gaza view** (or zoom from world map) → Pick a marker or an incident from the panel → Read the side drawer; **contact** via the listed phone if you want to represent outreach.
3. **Incident report page** — Use a **database** incident ID (from the organizer drawer, `/api/incidents`, or after seeding) and open `/map/incident/<id>` → Review **time urgency**, injuries estimate, situation summary, and **inbound reports** when seeded.
4. **Organizer** → **Log in as Organizer (Demo)** → Select an incident → **Verify** status, **edit** details, **assign** volunteers from the **seed roster**, advance **assignment** statuses, open **check-in** with the incident code, or **resolve** the incident.

## Project Structure

```
app/
  page.tsx                    # Landing
  map/page.tsx                # Public crisis map
  map/incident/[id]/page.tsx  # DB incident + reports detail
  dashboard/page.tsx          # Organizer map (demo gate → OrganizerMap)
  api/                        # REST handlers (incidents, dashboard, offer-help, …)
components/
  ui/                         # Button, Card, Badge, etc.
  GazaCrisisMap.tsx           # Map + Gaza strip + markers
  OrganizerMap.tsx            # Logged-in organizer map shell
  MapIncidentDrawer.tsx       # Public / JSON incident drawer
  OrganizerIncidentDrawer.tsx # Organizer controls + assignment slot
  OrganizerOpenIncidentsPanel.tsx
  OpenIncidentsPanel.tsx
  GazaZonePanelMapIncident.tsx
  AssignmentPanel.tsx
  CheckInModal.tsx
  EditIncidentModal.tsx
  SiteHeader.tsx
  ...
data/
  incidents.json              # Optional: served by /api/incidents-json
lib/
  prisma.ts
  utils.ts
  auth-store.ts               # Demo organizer/session role
  gaza-zones.ts
  criticality-meta.ts
  time-urgency.ts
  incident-adapters.ts
types/
  incident-json.ts            # JSON incident shape for the map
prisma/
  schema.prisma
  seed.ts
```

## Safety Notice

Assignments should be reviewed by organizers. Do not enter unsafe zones without authorization or training.

## The Team

Built by Jasper He, Leo Wu, Ethan Hoang, Daniel Zou
