"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { X, Trash2, Pencil, ChevronDown } from "lucide-react";
import type { Incident } from "@prisma/client";
import { cn } from "@/lib/utils";
import { CRITICALITY_META } from "@/lib/criticality-meta";
import { getTimeUrgencyTier } from "@/lib/time-urgency";

const VERIFICATION_OPTIONS = [
  { value: "UNVERIFIED", label: "Initial", style: "border-red-300 bg-red-500/15 text-red-700" },
  { value: "PARTIALLY_VERIFIED", label: "Confident", style: "border-amber-300 bg-amber-500/15 text-amber-700" },
  { value: "VERIFIED", label: "Verified", style: "border-green-300 bg-green-500/15 text-green-700" },
] as const;

const VERIFICATION_STYLES: Record<string, string> = {
  UNVERIFIED: "border-red-300 bg-red-500/15 text-red-700",
  PARTIALLY_VERIFIED: "border-amber-300 bg-amber-500/15 text-amber-700",
  VERIFIED: "border-green-300 bg-green-500/15 text-green-700",
};

export type OrganizerIncidentUpdates = Partial<{
  title: string;
  description: string;
  locationName: string;
  lat: number;
  lng: number;
  reportedAt: string;
  volunteersNeeded: number;
  injuriesReported: number;
  verificationStatus: string;
}>;

interface OrganizerIncidentDrawerProps {
  incident: Incident;
  interestedCount: number;
  confirmedCount: number;
  checkedInCount: number;
  onClose: () => void;
  onVerificationChange: (incidentId: string, status: string) => void;
  onRemove: (incidentId: string) => void;
  onEdit?: (incident: Incident) => void;
  onCheckIn?: () => void;
  onSummarySave?: (incidentId: string, summary: string) => void | Promise<void>;
  onUpdate?: (incidentId: string, updates: OrganizerIncidentUpdates) => void | Promise<void>;
  assignmentPanel?: React.ReactNode;
}

function EditableBox({
  children,
  onEdit,
  className,
}: {
  children: React.ReactNode;
  onEdit?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("relative group/box", className)}>
      {children}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute top-2 right-2 p-1.5 rounded-md bg-background/90 text-muted-foreground hover:bg-muted hover:text-foreground border border-border shadow-sm transition-colors"
          aria-label="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function OrganizerIncidentDrawer({
  incident,
  interestedCount,
  confirmedCount,
  checkedInCount,
  onClose,
  onVerificationChange,
  onRemove,
  onEdit,
  onCheckIn,
  onSummarySave,
  onUpdate,
  assignmentPanel,
}: OrganizerIncidentDrawerProps) {
  const isEditable = Boolean(onUpdate);
  const [titleDraft, setTitleDraft] = useState<string>(incident.title);
  const [summaryDraft, setSummaryDraft] = useState<string>(incident.description ?? "");
  const [locationDraft, setLocationDraft] = useState<string>(incident.locationName);
  const [latDraft, setLatDraft] = useState<string>(String(incident.lat));
  const [lngDraft, setLngDraft] = useState<string>(String(incident.lng));
  const [reportedAtDraft, setReportedAtDraft] = useState<string>(
    incident.reportedAt ? new Date(incident.reportedAt).toISOString().slice(0, 16) : ""
  );
  const [volunteersDraft, setVolunteersDraft] = useState<number>(incident.volunteersNeeded);
  const [injuriesDraft, setInjuriesDraft] = useState<number>(incident.injuriesReported);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setTitleDraft(incident.title);
    setSummaryDraft(incident.description ?? "");
    setLocationDraft(incident.locationName);
    setLatDraft(String(incident.lat));
    setLngDraft(String(incident.lng));
    setReportedAtDraft(incident.reportedAt ? new Date(incident.reportedAt).toISOString().slice(0, 16) : "");
    setVolunteersDraft(incident.volunteersNeeded);
    setInjuriesDraft(incident.injuriesReported);
  }, [incident]);
  const tier = getTimeUrgencyTier(incident.reportedAt);
  const criticality =
    tier === "CRITICAL"
      ? "critical"
      : tier === "MODERATE"
        ? "needs support"
        : "cleanup";
  const meta = CRITICALITY_META[criticality];
  const currentVerification = incident.verificationStatus ?? "UNVERIFIED";
  const verificationStyle =
    VERIFICATION_STYLES[currentVerification] ?? VERIFICATION_STYLES.UNVERIFIED;
  const currentLabel = VERIFICATION_OPTIONS.find((o) => o.value === currentVerification)?.label ?? "Initial";

  const handleEdit = () => onEdit?.(incident);
  const summarySave = onSummarySave ?? (onUpdate ? (id: string, s: string) => onUpdate(id, { description: s }) : undefined);

  const saveSummary = useCallback(async () => {
    if (!summarySave || summaryDraft === (incident.description ?? "")) return;
    setIsSaving(true);
    try {
      await summarySave(incident.id, summaryDraft);
    } finally {
      setIsSaving(false);
    }
  }, [incident.id, incident.description, summarySave, summaryDraft]);

  const handleSummaryBlur = () => {
    if (summaryDraft !== (incident.description ?? "")) saveSummary();
  };

  const saveAll = useCallback(async () => {
    if (!onUpdate) return;
    const updates: OrganizerIncidentUpdates = {};
    if (titleDraft !== incident.title) updates.title = titleDraft;
    if (summaryDraft !== (incident.description ?? "")) updates.description = summaryDraft;
    if (locationDraft !== incident.locationName) updates.locationName = locationDraft;
    const latVal = parseFloat(latDraft);
    const lngVal = parseFloat(lngDraft);
    if (!isNaN(latVal) && latVal !== incident.lat) updates.lat = latVal;
    if (!isNaN(lngVal) && lngVal !== incident.lng) updates.lng = lngVal;
    const reportedAtVal = reportedAtDraft ? new Date(reportedAtDraft).toISOString() : null;
    if (reportedAtVal && reportedAtVal !== incident.reportedAt.toISOString()) updates.reportedAt = reportedAtVal;
    if (volunteersDraft !== incident.volunteersNeeded) updates.volunteersNeeded = volunteersDraft;
    if (injuriesDraft !== incident.injuriesReported) updates.injuriesReported = injuriesDraft;
    if (Object.keys(updates).length === 0) return;
    setIsSaving(true);
    try {
      await onUpdate(incident.id, updates);
    } finally {
      setIsSaving(false);
    }
  }, [
    onUpdate,
    incident,
    titleDraft,
    summaryDraft,
    locationDraft,
    latDraft,
    lngDraft,
    reportedAtDraft,
    volunteersDraft,
    injuriesDraft,
  ]);

  return (
    <div
      className={cn(
        "fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col overflow-y-auto border-l bg-gradient-to-b from-background to-muted/20 shadow-2xl",
        "animate-in slide-in-from-right duration-200"
      )}
    >
      <div className="sticky top-0 z-10 flex shrink-0 flex-col gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-start justify-between gap-2">
          {isEditable ? (
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className="flex-1 text-lg font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-input focus:outline-none px-0 py-0"
            />
          ) : (
            <h2 className="line-clamp-2 flex-1 text-lg font-semibold">{incident.title}</h2>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span
            className="rounded-md border px-2.5 py-1.5 text-xs font-semibold"
            style={{ borderColor: meta.stroke, color: meta.stroke, backgroundColor: `${meta.stroke}15` }}
          >
            {meta.label}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 gap-1.5 font-semibold px-2.5",
                  verificationStyle
                )}
              >
                {currentLabel}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {VERIFICATION_OPTIONS.map((o) => (
                <DropdownMenuItem
                  key={o.value}
                  onClick={() => onVerificationChange(incident.id, o.value)}
                  className={cn("cursor-pointer", o.style)}
                >
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="rounded-xl border bg-card/50 p-4 text-sm shadow-sm">
          <p className="font-medium text-muted-foreground mb-2">Summary</p>
          {(summarySave || onUpdate) ? (
            <>
              <textarea
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                onBlur={handleSummaryBlur}
                placeholder="Add or edit the incident summary…"
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px] resize-y"
              />
              {!isEditable && summaryDraft !== (incident.description ?? "") && (
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={isSaving}
                  onClick={saveSummary}
                >
                  {isSaving ? "Saving…" : "Save summary"}
                </Button>
              )}
            </>
          ) : (
            <p className="mt-1">{incident.description ?? "No description"}</p>
          )}
        </div>

        <div className="rounded-xl border bg-card/50 p-4 text-sm shadow-sm">
          <p className="font-medium text-muted-foreground mb-2">Time of incident</p>
          {isEditable ? (
            <input
              type="datetime-local"
              value={reportedAtDraft}
              onChange={(e) => setReportedAtDraft(e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          ) : (
            <p className="font-medium">{new Date(incident.reportedAt).toLocaleString()}</p>
          )}
        </div>

        <div className="rounded-xl border bg-card/50 p-4 text-sm shadow-sm">
          <p className="font-medium text-muted-foreground mb-2">Location</p>
          {isEditable ? (
            <div className="space-y-2">
              <input
                value={locationDraft}
                onChange={(e) => setLocationDraft(e.target.value)}
                placeholder="Location name"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <div className="flex min-w-0 gap-2">
                <input
                  type="number"
                  step="any"
                  value={latDraft}
                  onChange={(e) => setLatDraft(e.target.value)}
                  placeholder="Lat"
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  step="any"
                  value={lngDraft}
                  onChange={(e) => setLngDraft(e.target.value)}
                  placeholder="Lng"
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          ) : (
            <>
              <p className="font-medium">{incident.locationName}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
              </p>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm">
            <p className="text-muted-foreground">Volunteers needed</p>
            {isEditable ? (
              <input
                type="number"
                min={0}
                value={volunteersDraft}
                onChange={(e) => setVolunteersDraft(parseInt(e.target.value, 10) || 0)}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-lg font-semibold"
              />
            ) : (
              <p className="text-lg font-semibold">{incident.volunteersNeeded}</p>
            )}
          </div>
          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm">
            <p className="text-muted-foreground">Casualties (est.)</p>
            {isEditable ? (
              <input
                type="number"
                min={0}
                value={injuriesDraft}
                onChange={(e) => setInjuriesDraft(parseInt(e.target.value, 10) || 0)}
                className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-lg font-semibold"
              />
            ) : (
              <p className="text-lg font-semibold">{incident.injuriesReported}</p>
            )}
          </div>
          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm">
            <p className="text-muted-foreground">Confirmed</p>
            <p className="text-lg font-semibold">{confirmedCount}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm">
            <p className="text-muted-foreground">Checked In</p>
            <p className="text-lg font-semibold">{checkedInCount}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm">
            <p className="text-muted-foreground">Interested</p>
            <p className="text-lg font-semibold">{interestedCount}</p>
          </div>
        </div>

        {isEditable && (
          <Button size="sm" className="w-full" disabled={isSaving} onClick={saveAll}>
            {isSaving ? "Saving…" : "Save all changes"}
          </Button>
        )}

        {incident.safetyNote && (
          <EditableBox onEdit={handleEdit}>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <p className="font-medium text-amber-700">Safety</p>
              <p className="mt-1 pr-8">{incident.safetyNote}</p>
            </div>
          </EditableBox>
        )}

        {incident.checkInCode && (
          <div className="rounded-xl border bg-muted/30 p-4 text-sm">
            <p className="font-medium text-muted-foreground">Check-in code</p>
            <p className="font-mono font-bold">{incident.checkInCode}</p>
            {onCheckIn && (
              <Button size="sm" className="mt-2" onClick={onCheckIn}>
                Check-in
              </Button>
            )}
          </div>
        )}

        {assignmentPanel}

        <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Offer to help: </span>
          <a href="tel:02-2929984" className="font-medium text-primary hover:underline">
            Tel: 02-2929984
          </a>
        </div>

        <div className="border-t pt-4">
          <Button
            variant="destructive"
            className="w-full gap-2 bg-red-600 hover:bg-red-700"
            onClick={() => onRemove(incident.id)}
          >
            <Trash2 className="h-4 w-4" />
            Remove Incident
          </Button>
        </div>
      </div>
    </div>
  );
}
