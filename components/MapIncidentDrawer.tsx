"use client";

import { Button } from "@/components/ui/button";
import { X, ExternalLink } from "lucide-react";
import type { MapIncident } from "@/types/incident-json";
import { CRITICALITY_META } from "@/lib/criticality-meta";
import { cn } from "@/lib/utils";

const VERIFICATION_LABELS: Record<string, string> = {
  initial_reports: "Initial reports",
  confident: "Confident",
  verified: "Verified",
};

interface MapIncidentDrawerProps {
  incident: MapIncident;
  onClose: () => void;
}

export function MapIncidentDrawer({ incident, onClose }: MapIncidentDrawerProps) {
  const meta = CRITICALITY_META[incident.criticality];

  return (
    <div
      className={cn(
        "fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col overflow-y-auto border-l bg-gradient-to-b from-background to-muted/20 shadow-2xl",
        "animate-in slide-in-from-right duration-200"
      )}
    >
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <h2 className="line-clamp-2 text-lg font-semibold">{incident.title}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0" aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-5 p-5">
        <div className="flex flex-wrap gap-2">
          <span
            className="rounded-md border px-2 py-1 text-xs font-medium"
            style={{ borderColor: meta.stroke, color: meta.stroke }}
          >
            {meta.label}
          </span>
          <span className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground">
            {VERIFICATION_LABELS[incident.verification] ?? incident.verification}
          </span>
        </div>

        {incident.summary && (
          <div className="rounded-xl border bg-card/50 p-4 text-sm shadow-sm">
            <p className="font-medium text-muted-foreground">Summary</p>
            <p className="mt-1">{incident.summary}</p>
          </div>
        )}

        <div className="rounded-xl border bg-card/50 p-4 text-sm shadow-sm">
          <p className="font-medium text-muted-foreground">Time of incident</p>
          <p className="font-medium">{new Date(incident.reportedAt).toLocaleString()}</p>
          {incident.timeSince && (
            <p className="mt-1 text-xs text-muted-foreground">
              {incident.timeSince} since incident
            </p>
          )}
        </div>

        <div className="rounded-xl border bg-card/50 p-4 text-sm shadow-sm">
          <p className="font-medium text-muted-foreground">Location</p>
          <p className="font-medium">
            {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
          </p>
          {incident.radiusKm != null && incident.radiusKm > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              ~{incident.radiusKm} km radius (triangulated)
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm">
            <p className="text-muted-foreground">Casualties (est.)</p>
            <p className="text-lg font-semibold">{incident.casualtiesEstimate}</p>
            <p className="text-xs text-muted-foreground capitalize">{incident.casualtiesCategory}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm">
            <p className="text-muted-foreground">Manpower needed</p>
            <p className="text-lg font-semibold">{incident.manpowerEstimate}</p>
            <p className="text-xs text-muted-foreground capitalize">{incident.manpowerCategory}</p>
          </div>
        </div>

        {incident.media.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">Media</p>
            <div className="grid grid-cols-2 gap-2">
              {incident.media
                .filter((m) => m.type === "image")
                .slice(0, 4)
                .map((m, i) => (
                  <a
                    key={i}
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-video overflow-hidden rounded-lg border bg-muted"
                  >
                    <img
                      src={m.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </a>
                ))}
            </div>
          </div>
        )}

        {incident.posts.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">Source posts</p>
            <ul className="space-y-2">
              {incident.posts.slice(0, 5).map((url, i) => (
                <li key={i}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border bg-card/50 px-3 py-2 text-xs transition-colors hover:bg-accent/50"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{url}</span>
                  </a>
                </li>
              ))}
              {incident.posts.length > 5 && (
                <p className="text-xs text-muted-foreground">
                  +{incident.posts.length - 5} more
                </p>
              )}
            </ul>
          </div>
        )}

        <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Offer to help: </span>
          <a
            href="tel:02-2929984"
            className="font-medium text-primary hover:underline"
          >
            Tel: 02-2929984
          </a>
        </div>
      </div>
    </div>
  );
}
