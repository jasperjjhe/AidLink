"use client";

import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { MapIncident } from "@/types/incident-json";
import { GAZA_SUB_ZONES, incidentsInZone } from "@/lib/gaza-zones";
import { CRITICALITY_META } from "@/lib/criticality-meta";
import { cn } from "@/lib/utils";

interface GazaZonePanelMapIncidentProps {
  zoneId: string;
  incidents: MapIncident[];
  onClose: () => void;
  onSelectIncident: (id: string) => void;
}

export function GazaZonePanelMapIncident({
  zoneId,
  incidents,
  onClose,
  onSelectIncident,
}: GazaZonePanelMapIncidentProps) {
  const zone = GAZA_SUB_ZONES.find((z) => z.id === zoneId);
  if (!zone) return null;

  const inZone = incidentsInZone(incidents, zone);
  const sorted = [...inZone].sort(
    (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
  );
  const primary = sorted[0];

  const casualtiesTotal = inZone.reduce((s, i) => s + i.casualtiesEstimate, 0);
  const manpowerTotal = inZone.reduce((s, i) => s + i.manpowerEstimate, 0);
  const latestReportTime =
    sorted.length > 0 ? new Date(sorted[0].reportedAt).toLocaleString() : "—";

  return (
    <div
      className={cn(
        "fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col overflow-y-auto border-l bg-gradient-to-b from-background to-muted/20 shadow-2xl",
        "animate-in slide-in-from-right duration-200"
      )}
    >
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div>
          <h2 className="text-lg font-semibold">{zone.name}</h2>
          <p className="text-xs text-muted-foreground">Zone summary</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0" aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="rounded-xl border bg-card/50 p-4 text-sm shadow-sm">
          <p className="font-medium text-muted-foreground">Location</p>
          <p className="font-medium">{zone.name} (Gaza Strip)</p>
        </div>

        <div className="rounded-xl border bg-card/50 p-4 text-sm shadow-sm">
          <p className="font-medium text-muted-foreground">Most recent report</p>
          <p className="font-medium">{latestReportTime}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm">
            <p className="text-muted-foreground">Casualties (est.)</p>
            <p className="text-lg font-semibold">{casualtiesTotal}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm">
            <p className="text-muted-foreground">Manpower needed</p>
            <p className="text-lg font-semibold">{manpowerTotal}</p>
          </div>
        </div>

        <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Offer to help: </span>
          <a
            href="tel:02-2929984"
            className="font-medium text-primary hover:underline"
          >
            Tel: 02-2929984
          </a>
        </div>

        {sorted.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">
              Incidents in this zone
            </p>
            <ul className="space-y-2">
              {sorted.map((inc) => {
                const m = CRITICALITY_META[inc.criticality];
                return (
                  <li key={inc.id}>
                    <button
                      type="button"
                      onClick={() => onSelectIncident(inc.id)}
                      className="flex w-full flex-col rounded-xl border bg-card px-4 py-3 text-left text-sm shadow-sm transition-all hover:border-primary/30 hover:bg-accent/50 hover:shadow"
                    >
                      <span className="font-medium">{inc.title}</span>
                      <span className="mt-1 text-xs text-muted-foreground">
                        {inc.casualtiesEstimate} casualties est. ·{" "}
                        <span style={{ color: m.fill }}>{m.label}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No incidents mapped in this zone.
          </p>
        )}
      </div>
    </div>
  );
}
