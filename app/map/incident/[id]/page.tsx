"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { VerificationBadge } from "@/components/VerificationBadge";
import { SeverityBadge } from "@/components/SeverityBadge";
import {
  getTimeUrgencyTier,
  TIME_URGENCY_META,
} from "@/lib/time-urgency";
import type { Incident, IncidentReport } from "@prisma/client";

type IncidentWithReports = Incident & { reports: IncidentReport[] };

export default function IncidentReportDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<IncidentWithReports | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/incidents/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((j) => setData(j.incident))
      .catch(() => setError("Could not load this incident."));
  }, [id]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        navItems={[
          { href: "/", label: "Home" },
          { href: "/map", label: "Crisis Map" },
        ]}
      />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <Button variant="ghost" size="sm" className="mb-6 -ml-2" asChild>
          <Link href="/map">← Back to map</Link>
        </Button>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {data && (
          <article className="space-y-6">
            <header className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">{data.title}</h1>
              <div className="flex flex-wrap gap-2">
                <VerificationBadge status={data.verificationStatus} />
                <SeverityBadge score={data.severityScore} />
                <span
                  className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
                  style={{
                    borderColor: TIME_URGENCY_META[getTimeUrgencyTier(data.reportedAt)].stroke,
                    color: TIME_URGENCY_META[getTimeUrgencyTier(data.reportedAt)].stroke,
                  }}
                >
                  Time urgency: {TIME_URGENCY_META[getTimeUrgencyTier(data.reportedAt)].label}
                </span>
              </div>
            </header>

            <section className="rounded-lg border bg-card p-4 text-sm space-y-3">
              <div>
                <p className="font-medium text-muted-foreground">Location</p>
                <p>{data.locationName}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Reported at</p>
                <p>{new Date(data.reportedAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Injuries (reported estimate)</p>
                <p>{(data as Incident & { injuriesReported?: number }).injuriesReported ?? 0}</p>
              </div>
              {data.description && (
                <div>
                  <p className="font-medium text-muted-foreground">Situation summary</p>
                  <p className="whitespace-pre-wrap pt-1">{data.description}</p>
                </div>
              )}
              {data.sourceText && data.sourceText !== data.description && (
                <div>
                  <p className="font-medium text-muted-foreground">Source excerpt</p>
                  <p className="whitespace-pre-wrap pt-1 text-muted-foreground">
                    {data.sourceText}
                  </p>
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold">Recent inbound reports</h2>
              {data.reports.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No linked social or field reports in the database yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {data.reports.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border bg-muted/30 p-4 text-sm"
                    >
                      <p className="whitespace-pre-wrap">{r.rawText}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {r.platform} · {new Date(r.timestamp).toLocaleString()}
                        {r.confidence != null &&
                          ` · confidence ${Math.round(r.confidence * 100)}%`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Offer to help: </span>
              <a
                href="tel:02-2929984"
                className="font-medium text-primary hover:underline"
              >
                Tel: 02-2929984
              </a>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}
