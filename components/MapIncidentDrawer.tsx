"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, ExternalLink, Trash2 } from "lucide-react";
import type { MapIncident, CriticalityTier, CasualtiesCategory, ManpowerCategory } from "@/types/incident-json";
import { CRITICALITY_META } from "@/lib/criticality-meta";
import { useLanguageStore } from "@/lib/language-store";
import { t, getCriticalityLabel, type TranslationKey } from "@/lib/translations";
import { cn } from "@/lib/utils";

const VERIFICATION_KEYS: Record<string, "verificationInitial" | "verificationConfident" | "verificationVerified"> = {
  initial_reports: "verificationInitial",
  confident: "verificationConfident",
  verified: "verificationVerified",
};

const CRITICALITY_OPTIONS: CriticalityTier[] = ["critical", "needs support", "cleanup"];
const VERIFICATION_OPTIONS: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: "initial_reports", labelKey: "verificationInitial" },
  { value: "confident", labelKey: "verificationConfident" },
  { value: "verified", labelKey: "verificationVerified" },
];
const CASUALTIES_OPTIONS: CasualtiesCategory[] = ["few", "some", "many"];
const MANPOWER_OPTIONS: ManpowerCategory[] = ["small", "moderate", "large"];

export type MapIncidentUpdates = Partial<{
  summary: string;
  reportedAt: string;
  lat: number;
  lng: number;
  radiusKm: number;
  casualtiesEstimate: number;
  casualtiesCategory: CasualtiesCategory;
  manpowerEstimate: number;
  manpowerCategory: ManpowerCategory;
  criticality: CriticalityTier;
  verification: string;
}>;

interface MapIncidentDrawerProps {
  incident: MapIncident;
  onClose: () => void;
  /** When provided (organizer context), shows Remove Incident button */
  onRemove?: (incidentId: string) => void;
  /** When provided (organizer context), makes Summary editable and persists to backend */
  onSummarySave?: (incidentId: string, summary: string) => void | Promise<void>;
  /** When provided (organizer context), makes all fields editable and persists to backend */
  onUpdate?: (incidentId: string, updates: MapIncidentUpdates) => void | Promise<void>;
}

export function MapIncidentDrawer({ incident, onClose, onRemove, onSummarySave, onUpdate }: MapIncidentDrawerProps) {
  const { lang } = useLanguageStore();
  const meta = CRITICALITY_META[incident.criticality];
  const isEditable = Boolean(onUpdate);
  const summarySave = onSummarySave ?? (onUpdate ? (id: string, s: string) => onUpdate(id, { summary: s }) : undefined);

  const [summaryDraft, setSummaryDraft] = useState<string>(incident.summary ?? "");
  const [reportedAtDraft, setReportedAtDraft] = useState<string>(
    incident.reportedAt ? new Date(incident.reportedAt).toISOString().slice(0, 16) : ""
  );
  const [latDraft, setLatDraft] = useState<string>(String(incident.lat));
  const [lngDraft, setLngDraft] = useState<string>(String(incident.lng));
  const [radiusDraft, setRadiusDraft] = useState<string>(String(incident.radiusKm ?? ""));
  const [casualtiesDraft, setCasualtiesDraft] = useState<number>(incident.casualtiesEstimate);
  const [casualtiesCatDraft, setCasualtiesCatDraft] = useState<CasualtiesCategory>(incident.casualtiesCategory);
  const [manpowerDraft, setManpowerDraft] = useState<number>(incident.manpowerEstimate);
  const [manpowerCatDraft, setManpowerCatDraft] = useState<ManpowerCategory>(incident.manpowerCategory);
  const [criticalityDraft, setCriticalityDraft] = useState<CriticalityTier>(incident.criticality);
  const [verificationDraft, setVerificationDraft] = useState<string>(incident.verification);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSummaryDraft(incident.summary ?? "");
    setReportedAtDraft(incident.reportedAt ? new Date(incident.reportedAt).toISOString().slice(0, 16) : "");
    setLatDraft(String(incident.lat));
    setLngDraft(String(incident.lng));
    setRadiusDraft(String(incident.radiusKm ?? ""));
    setCasualtiesDraft(incident.casualtiesEstimate);
    setCasualtiesCatDraft(incident.casualtiesCategory);
    setManpowerDraft(incident.manpowerEstimate);
    setManpowerCatDraft(incident.manpowerCategory);
    setCriticalityDraft(incident.criticality);
    setVerificationDraft(incident.verification);
  }, [incident]);

  const saveAll = useCallback(async () => {
    if (!onUpdate) return;
    const updates: MapIncidentUpdates = {};
    if (summaryDraft !== (incident.summary ?? "")) updates.summary = summaryDraft;
    const reportedAtVal = reportedAtDraft ? new Date(reportedAtDraft).toISOString() : null;
    if (reportedAtVal && reportedAtVal !== incident.reportedAt) updates.reportedAt = reportedAtVal;
    const latVal = parseFloat(latDraft);
    const lngVal = parseFloat(lngDraft);
    if (!isNaN(latVal) && latVal !== incident.lat) updates.lat = latVal;
    if (!isNaN(lngVal) && lngVal !== incident.lng) updates.lng = lngVal;
    const radiusVal = parseFloat(radiusDraft);
    if (!isNaN(radiusVal) && radiusVal !== (incident.radiusKm ?? 0)) updates.radiusKm = radiusVal;
    if (casualtiesDraft !== incident.casualtiesEstimate) updates.casualtiesEstimate = casualtiesDraft;
    if (casualtiesCatDraft !== incident.casualtiesCategory) updates.casualtiesCategory = casualtiesCatDraft;
    if (manpowerDraft !== incident.manpowerEstimate) updates.manpowerEstimate = manpowerDraft;
    if (manpowerCatDraft !== incident.manpowerCategory) updates.manpowerCategory = manpowerCatDraft;
    if (criticalityDraft !== incident.criticality) updates.criticality = criticalityDraft;
    if (verificationDraft !== incident.verification) updates.verification = verificationDraft;
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
    summaryDraft,
    reportedAtDraft,
    latDraft,
    lngDraft,
    radiusDraft,
    casualtiesDraft,
    casualtiesCatDraft,
    manpowerDraft,
    manpowerCatDraft,
    criticalityDraft,
    verificationDraft,
  ]);

  const saveSummary = useCallback(async () => {
    if (!summarySave || summaryDraft === (incident.summary ?? "")) return;
    setIsSaving(true);
    try {
      await summarySave(incident.id, summaryDraft);
    } finally {
      setIsSaving(false);
    }
  }, [incident.id, incident.summary, summarySave, summaryDraft]);

  const handleSummaryBlur = () => {
    if (summaryDraft !== (incident.summary ?? "")) saveSummary();
  };

  return (
    <div
      className={cn(
        "fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col overflow-y-auto border-l bg-gradient-to-b from-background to-muted/20 shadow-2xl",
        "animate-in slide-in-from-right duration-200"
      )}
    >
      <div className="sticky top-0 z-10 flex shrink-0 flex-col gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-start justify-between gap-3">
          <h2 className="line-clamp-2 flex-1 text-lg font-semibold">{incident.title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0" aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {isEditable ? (
            <>
              <select
                value={criticalityDraft}
                onChange={(e) => setCriticalityDraft(e.target.value as CriticalityTier)}
                className="rounded-md border px-2.5 py-1.5 text-xs font-semibold bg-background"
                style={{ borderColor: CRITICALITY_META[criticalityDraft].stroke, color: CRITICALITY_META[criticalityDraft].stroke }}
              >
                {CRITICALITY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {getCriticalityLabel(lang, c)}
                  </option>
                ))}
              </select>
              <select
                value={verificationDraft}
                onChange={(e) => setVerificationDraft(e.target.value)}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold bg-background"
              >
                {VERIFICATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(lang, o.labelKey)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span
                className="rounded-md border px-2.5 py-1.5 text-xs font-semibold"
                style={{ borderColor: meta.stroke, color: meta.stroke, backgroundColor: `${meta.stroke}15` }}
              >
                {getCriticalityLabel(lang, incident.criticality)}
              </span>
              <span
                className="rounded-md border px-2.5 py-1.5 text-xs font-semibold"
                style={{
                  borderColor: "var(--border)",
                  color: "hsl(var(--foreground))",
                  backgroundColor: "hsl(var(--muted))",
                }}
              >
                {t(lang, (VERIFICATION_KEYS[incident.verification] ?? "verificationInitial") as TranslationKey)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="space-y-5 p-5">

        <div className="rounded-xl border bg-card/50 p-4 text-sm shadow-sm">
          <p className="font-medium text-muted-foreground mb-2">{t(lang, "summary")}</p>
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
              {!isEditable && summaryDraft !== (incident.summary ?? "") && (
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
            <p className="mt-1">{incident.summary ?? "—"}</p>
          )}
        </div>

        <div className="rounded-xl border bg-card/50 p-4 text-sm shadow-sm">
          <p className="font-medium text-muted-foreground mb-2">{t(lang, "timeOfIncident")}</p>
          {isEditable ? (
            <input
              type="datetime-local"
              value={reportedAtDraft}
              onChange={(e) => setReportedAtDraft(e.target.value)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          ) : (
            <>
              <p className="font-medium">{new Date(incident.reportedAt).toLocaleString()}</p>
              {incident.timeSince && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {incident.timeSince} {t(lang, "sinceIncident")}
                </p>
              )}
            </>
          )}
        </div>

        <div className="rounded-xl border bg-card/50 p-4 text-sm shadow-sm">
          <p className="font-medium text-muted-foreground mb-2">{t(lang, "location")}</p>
          {isEditable ? (
            <div className="space-y-2">
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
              <input
                type="number"
                step="any"
                value={radiusDraft}
                onChange={(e) => setRadiusDraft(e.target.value)}
                placeholder="Radius (km)"
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          ) : (
            <>
              <p className="font-medium">
                {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
              </p>
              {incident.radiusKm != null && incident.radiusKm > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(lang, "radiusTriangulated", { n: String(incident.radiusKm) })}
                </p>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm">
            <p className="text-muted-foreground mb-1">{t(lang, "casualtiesEst")}</p>
            {isEditable ? (
              <div className="space-y-1">
                <input
                  type="number"
                  min={0}
                  value={casualtiesDraft}
                  onChange={(e) => setCasualtiesDraft(parseInt(e.target.value, 10) || 0)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-semibold"
                />
                <select
                  value={casualtiesCatDraft}
                  onChange={(e) => setCasualtiesCatDraft(e.target.value as CasualtiesCategory)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  {CASUALTIES_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <p className="text-lg font-semibold">{incident.casualtiesEstimate}</p>
                <p className="text-xs text-muted-foreground capitalize">{incident.casualtiesCategory}</p>
              </>
            )}
          </div>
          <div className="rounded-xl border bg-muted/30 p-4 shadow-sm">
            <p className="text-muted-foreground mb-1">{t(lang, "manpowerNeeded")}</p>
            {isEditable ? (
              <div className="space-y-1">
                <input
                  type="number"
                  min={0}
                  value={manpowerDraft}
                  onChange={(e) => setManpowerDraft(parseInt(e.target.value, 10) || 0)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm font-semibold"
                />
                <select
                  value={manpowerCatDraft}
                  onChange={(e) => setManpowerCatDraft(e.target.value as ManpowerCategory)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  {MANPOWER_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <p className="text-lg font-semibold">{incident.manpowerEstimate}</p>
                <p className="text-xs text-muted-foreground capitalize">{incident.manpowerCategory}</p>
              </>
            )}
          </div>
        </div>

        {isEditable && (
          <Button
            size="sm"
            className="w-full"
            disabled={isSaving}
            onClick={saveAll}
          >
            {isSaving ? "Saving…" : "Save all changes"}
          </Button>
        )}

        {incident.media.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">{t(lang, "media")}</p>
            <div className="grid grid-cols-2 gap-2">
              {incident.media
                .filter((m) => m.type === "image")
                .slice(0, 6)
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
              {incident.media
                .filter((m) => m.type === "video")
                .slice(0, 4)
                .map((m, i) => (
                  <a
                    key={`v-${i}`}
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-xs transition-colors hover:bg-accent/50"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Video {i + 1}</span>
                  </a>
                ))}
            </div>
          </div>
        )}

        {incident.posts.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">{t(lang, "sourcePosts")}</p>
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
          <span className="text-muted-foreground">{t(lang, "offerToHelp")}: </span>
          <a
            href="tel:02-2929984"
            className="font-medium text-primary hover:underline"
          >
            Tel: 02-2929984
          </a>
        </div>

        {onRemove && (
          <div className="border-t pt-4">
            <Button
              variant="destructive"
              className="w-full gap-2 bg-red-600 hover:bg-red-700"
              onClick={() => onRemove(incident.id)}
            >
              <Trash2 className="h-4 w-4" />
              {t(lang, "removeIncident")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
