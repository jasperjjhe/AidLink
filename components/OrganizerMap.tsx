"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AidLinkLogo } from "@/components/AidLinkLogo";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrganizerOpenIncidentsPanel } from "@/components/OrganizerOpenIncidentsPanel";
import { OrganizerIncidentDrawer } from "@/components/OrganizerIncidentDrawer";
import { MapIncidentDrawer } from "@/components/MapIncidentDrawer";
import { AssignmentPanel } from "@/components/AssignmentPanel";
import { CheckInModal } from "@/components/CheckInModal";
import { EditIncidentModal } from "@/components/EditIncidentModal";
import { RegionZonePanel } from "@/components/RegionZonePanel";
import { pointInBounds } from "@/lib/gaza-zones";
import { getZoneForPoint } from "@/lib/gaza-zones";
import { getZoneForPoint as getUkraineZoneForPoint } from "@/lib/ukraine-zones";
import { jsonToMapIncident, prismaToMapIncident } from "@/lib/incident-adapters";
import { REGIONS } from "@/lib/regions";
import { useLanguageStore } from "@/lib/language-store";
import type { RegionId, LangCode } from "@/lib/region-types";

const LANG_LABELS: Record<LangCode, string> = {
  en: "English",
  ar: "العربية",
  uk: "Українська",
};
import { RefreshCw } from "lucide-react";
import { t } from "@/lib/translations";
import type { Incident, VolunteerProfile, Assignment } from "@prisma/client";
import type { MapIncident, IncidentJson } from "@/types/incident-json";

const RegionCrisisMap = dynamic(
  () =>
    import("@/components/RegionCrisisMap").then((m) => ({
      default: m.RegionCrisisMap,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[400px] items-center justify-center bg-muted animate-pulse">
        Loading map…
      </div>
    ),
  }
);

function inRegion(inc: { lat: number; lng: number }, regionId: RegionId): boolean {
  const region = REGIONS[regionId];
  return region ? pointInBounds(inc.lat, inc.lng, region.flyBounds) : false;
}

function getZoneForRegion(regionId: RegionId, lat: number, lng: number) {
  if (regionId === "gaza") return getZoneForPoint(lat, lng);
  if (regionId === "ukraine") return getUkraineZoneForPoint(lat, lng);
  return null;
}

type IncidentWithAssignments = Incident & {
  assignments: (Assignment & { volunteer: VolunteerProfile })[];
};

type VolunteerWithAssignments = VolunteerProfile & {
  assignments: (Assignment & { incident: { title: string } })[];
};

interface OrganizerMapProps {
  region: RegionId;
  lang: LangCode;
}

export function OrganizerMap({ region, lang }: OrganizerMapProps) {
  const router = useRouter();
  const { setLang } = useLanguageStore();
  const regionConfig = REGIONS[region];
  const availableLangs = regionConfig.languages;
  const [supabaseIncidents, setSupabaseIncidents] = useState<MapIncident[]>([]);
  const [prismaIncidents, setPrismaIncidents] = useState<IncidentWithAssignments[]>([]);
  const [jsonFallbackIncidents, setJsonFallbackIncidents] = useState<MapIncident[]>([]);
  const [volunteers, setVolunteers] = useState<VolunteerWithAssignments[]>([]);
  const [counts, setCounts] = useState<Record<string, { i: number; c: number; ch: number }>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [editIncident, setEditIncident] = useState<Incident | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const prismaById = useMemo(
    () => Object.fromEntries(prismaIncidents.map((i) => [i.id, i])),
    [prismaIncidents]
  );

  const openPrismaIncidents = useMemo(
    () => prismaIncidents.filter((i) => i.operationalStatus !== "RESOLVED"),
    [prismaIncidents]
  );

  const mapIncidentsFromPrisma = useMemo(
    () =>
      openPrismaIncidents
        .filter(
          (i) =>
            !["FALSE_REPORT", "DUPLICATE"].includes(
              i.verificationStatus ?? ""
            )
        )
        .filter((i) => inRegion(i, region))
        .map(prismaToMapIncident),
    [openPrismaIncidents, region]
  );

  const mapIncidents =
    supabaseIncidents.length > 0
      ? supabaseIncidents
      : mapIncidentsFromPrisma.length > 0
        ? mapIncidentsFromPrisma
        : jsonFallbackIncidents;

  const selectedPrismaIncident = selectedId ? prismaById[selectedId] : null;
  const selectedMapIncident = mapIncidents.find((i) => i.id === selectedId);
  const c = selectedId ? counts[selectedId] ?? { i: 0, c: 0, ch: 0 } : { i: 0, c: 0, ch: 0 };

  const availableForAssign =
    selectedPrismaIncident &&
    volunteers.filter(
      (v) => !selectedPrismaIncident.assignments.some((a) => a.volunteerId === v.id)
    );

  const fetchDashboard = useCallback(() => {
    setIsRefreshing(true);
    const loadFallbacks = () =>
      Promise.all([
        fetch("/api/dashboard/incidents"),
        fetch("/api/dashboard/volunteers"),
      ])
        .then(([incRes, volRes]) =>
          Promise.all([
            incRes.ok ? incRes.json() : Promise.resolve({ incidents: [], counts: {} }),
            volRes.ok ? volRes.json() : Promise.resolve({ volunteers: [] }),
          ])
        )
        .then(([incData, volData]) => {
          const incidents = incData.incidents ?? [];
          setPrismaIncidents(incidents);
          setVolunteers(volData.volunteers ?? []);
          setCounts(incData.counts ?? {});
          const openCount = incidents.filter((i: Incident) => i.operationalStatus !== "RESOLVED").length;
          if (openCount === 0) {
            return fetch("/api/incidents-json")
              .then((r) => (r.ok ? r.json() : Promise.resolve({ incidents: [] })))
              .then((jsonData: { incidents?: IncidentJson[] }) => {
                const json = jsonData.incidents ?? [];
                if (Array.isArray(json) && json.length > 0) {
                  setJsonFallbackIncidents(
                    json.map(jsonToMapIncident).filter((i) => inRegion(i, region))
                  );
                  return;
                }
                setJsonFallbackIncidents([]);
              })
              .catch(() => setJsonFallbackIncidents([]));
          }
          setJsonFallbackIncidents([]);
        });

    fetch(`/api/incidents-supabase?region=${region}`)
      .then((r) => (r.ok ? r.json() : Promise.resolve({ incidents: [] })))
      .then((data: { incidents?: MapIncident[] }) => {
        const incidents = (data.incidents ?? []).filter((i) => inRegion(i, region));
        if (Array.isArray(incidents) && incidents.length > 0) {
          setSupabaseIncidents(incidents);
          return loadFallbacks();
        }
        setSupabaseIncidents([]);
        return loadFallbacks();
      })
      .catch(() => {
        setSupabaseIncidents([]);
        return loadFallbacks();
      })
      .finally(() => setIsRefreshing(false));
  }, [region]);

  useEffect(() => {
    fetchDashboard();
    const id = setInterval(fetchDashboard, 15000);
    return () => clearInterval(id);
  }, [fetchDashboard]);

  const handleVerify = async (incidentId: string, status: string) => {
    await fetch("/api/dashboard/incidents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId, verificationStatus: status }),
    });
    fetchDashboard();
  };

  const handleRemove = async (incidentId: string) => {
    await fetch("/api/dashboard/incidents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId, operationalStatus: "RESOLVED" }),
    });
    setSelectedId(null);
    fetchDashboard();
  };

  const handleSummarySave = async (incidentId: string, summary: string) => {
    await fetch("/api/dashboard/incidents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId, description: summary }),
    });
    fetchDashboard();
  };

  const handleOrganizerUpdate = async (
    incidentId: string,
    updates: {
      title?: string;
      description?: string;
      locationName?: string;
      lat?: number;
      lng?: number;
      reportedAt?: string;
      volunteersNeeded?: number;
      injuriesReported?: number;
      verificationStatus?: string;
    }
  ) => {
    await fetch("/api/dashboard/incidents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId, ...updates }),
    });
    fetchDashboard();
  };

  const handleEditSave = async (
    id: string,
    data: {
      title: string;
      description?: string;
      locationName: string;
      lat: number;
      lng: number;
      severityScore: number;
      volunteersNeeded: number;
      safetyNote?: string;
    }
  ) => {
    await fetch("/api/dashboard/incidents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId: id, ...data }),
    });
    setEditModalOpen(false);
    setEditIncident(null);
    fetchDashboard();
  };

  const handleAssign = async (volunteerId: string) => {
    if (!selectedId) return;
    await fetch("/api/dashboard/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId: selectedId, volunteerId }),
    });
    fetchDashboard();
  };

  const handleStatusChange = async (assignmentId: string, status: string) => {
    await fetch("/api/dashboard/assign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId, status }),
    });
    fetchDashboard();
  };

  const handleCheckIn = async (code: string, assignmentId?: string): Promise<boolean> => {
    if (!selectedId) return false;
    const res = await fetch("/api/dashboard/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId: selectedId, code, assignmentId }),
    });
    const data = await res.json();
    if (data.ok) fetchDashboard();
    return !!data.ok;
  };

  const handleSelectIncident = (id: string) => {
    setSelectedId(id);
    const inc = mapIncidents.find((i) => i.id === id);
    if (inc) {
      const z = getZoneForRegion(region, inc.lat, inc.lng);
      setSelectedZoneId(z?.id ?? null);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <AidLinkLogo className="ml-2 sm:ml-4" />
          <nav className="flex items-center justify-end gap-2 sm:gap-3">
            <Link href="/" className="shrink-0">
              <Button variant="outline" size="sm" className="h-9">
                {t(lang, "home")}
              </Button>
            </Link>
            <Link href={`/map?region=${region}&lang=${lang}`} className="shrink-0">
              <Button variant="outline" size="sm" className="h-9">
                {t(lang, "crisisMap")}
              </Button>
            </Link>
            <Select
              value={lang}
              onValueChange={(v) => {
                const newLang = v as LangCode;
                setLang(newLang);
                router.replace(`/dashboard?region=${region}&lang=${newLang}`);
              }}
            >
              <SelectTrigger className="w-[100px] sm:w-[110px] h-9 shrink-0" aria-label={t(lang, "selectLanguage")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableLangs.map((code) => (
                  <SelectItem key={code} value={code}>
                    {LANG_LABELS[code] ?? code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </nav>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative z-[1100] flex shrink-0 flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3 text-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={() => fetchDashboard()}
            className="gap-1.5"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {t(lang, "refresh")}
          </Button>
          <span className="text-muted-foreground">
            {t(lang, "hoverHint")} • {t(lang, "clickHint")}
          </span>
        </div>

        <div className="relative min-h-0 flex-1">
          <RegionCrisisMap
            region={regionConfig}
            lang={lang}
            incidents={mapIncidents}
            selectedIncidentId={selectedId}
            onSelectIncident={(id) => {
              setSelectedId(id);
              if (id) {
                const inc = mapIncidents.find((i) => i.id === id);
                if (inc) {
                  const z = getZoneForRegion(region, inc.lat, inc.lng);
                  setSelectedZoneId(z?.id ?? null);
                }
              } else {
                setSelectedZoneId(null);
              }
            }}
            selectedZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
            className="h-full min-h-0 rounded-none border-0"
          />
        </div>

        {selectedMapIncident && selectedPrismaIncident && (
          <OrganizerIncidentDrawer
            incident={selectedPrismaIncident}
            interestedCount={c.i}
            confirmedCount={c.c}
            checkedInCount={c.ch}
            onClose={() => setSelectedId(null)}
            onVerificationChange={handleVerify}
            onRemove={handleRemove}
            onEdit={(inc) => {
              setEditIncident(inc);
              setEditModalOpen(true);
            }}
            onSummarySave={handleSummarySave}
            onUpdate={handleOrganizerUpdate}
            onCheckIn={
              selectedPrismaIncident.checkInCode
                ? () => setCheckInOpen(true)
                : undefined
            }
            assignmentPanel={
              availableForAssign ? (
                <AssignmentPanel
                  incident={selectedPrismaIncident}
                  assignments={selectedPrismaIncident.assignments ?? []}
                  availableVolunteers={availableForAssign}
                  onAssign={handleAssign}
                  onStatusChange={handleStatusChange}
                />
              ) : null
            }
          />
        )}

        {selectedMapIncident && !selectedPrismaIncident && (
          <MapIncidentDrawer
            incident={selectedMapIncident}
            onClose={() => setSelectedId(null)}
            onRemove={(id) => {
              setSelectedId(null);
              setJsonFallbackIncidents((prev) => prev.filter((i) => i.id !== id));
            }}
            onUpdate={
              supabaseIncidents.length > 0
                ? async (incidentId, updates) => {
                    const body: Record<string, unknown> = { incidentId, region };
                    if (updates.summary != null) body.summary = updates.summary;
                    if (updates.reportedAt != null) body.time_of_incident = updates.reportedAt;
                    if (updates.lat != null) body.location_lat = updates.lat;
                    if (updates.lng != null) body.location_lon = updates.lng;
                    if (updates.radiusKm != null) body.location_radius_km = updates.radiusKm;
                    if (updates.casualtiesEstimate != null) body.casualties_estimate = updates.casualtiesEstimate;
                    if (updates.casualtiesCategory != null) body.casualties = updates.casualtiesCategory;
                    if (updates.manpowerEstimate != null) body.manpower_needed_estimate = updates.manpowerEstimate;
                    if (updates.manpowerCategory != null) body.manpower_needed = updates.manpowerCategory;
                    if (updates.criticality != null)
                      body.criticality = updates.criticality.replace(" ", "_") as "critical" | "needs_support" | "cleanup";
                    if (updates.verification != null) body.verification = updates.verification;
                    await fetch("/api/incidents-supabase", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(body),
                    });
                    fetchDashboard();
                  }
                : undefined
            }
          />
        )}

        {selectedZoneId && !selectedMapIncident && (
          <RegionZonePanel
            region={regionConfig}
            lang={lang}
            zoneId={selectedZoneId}
            incidents={mapIncidents}
            onClose={() => setSelectedZoneId(null)}
            onSelectIncident={handleSelectIncident}
          />
        )}
      </div>

      {!selectedMapIncident && !selectedZoneId && (
        <OrganizerOpenIncidentsPanel
          mapIncidents={mapIncidents}
          counts={counts}
          prismaById={prismaById}
          selectedId={selectedId}
          onSelectIncident={handleSelectIncident}
          onEditIncident={(inc) => {
            setEditIncident(inc);
            setEditModalOpen(true);
          }}
        />
      )}

      {selectedPrismaIncident?.checkInCode && (
        <CheckInModal
          open={checkInOpen}
          onOpenChange={setCheckInOpen}
          checkInCode={selectedPrismaIncident.checkInCode}
          incidentTitle={selectedPrismaIncident.title}
          assignments={selectedPrismaIncident.assignments ?? []}
          onCheckIn={handleCheckIn}
        />
      )}

      <EditIncidentModal
        incident={editIncident}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSave={handleEditSave}
      />
    </div>
  );
}
