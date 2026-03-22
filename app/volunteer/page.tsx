"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/SiteHeader";
import { SafetyNotice } from "@/components/SafetyNotice";
import { VolunteerForm } from "@/components/VolunteerForm";
import { IncidentCard } from "@/components/IncidentCard";
import type { Incident } from "@prisma/client";

function VolunteerContent() {
  const searchParams = useSearchParams();
  const incidentId = searchParams.get("incident");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [counts, setCounts] = useState<Record<string, { i: number; c: number; ch: number }>>({});
  const [profileCreated, setProfileCreated] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/incidents")
      .then((r) => r.json())
      .then((data) => {
        setIncidents(data.incidents ?? []);
        setCounts(data.counts ?? {});
      })
      .catch(() => setIncidents([]));
  }, []);

  const publicIncidents = incidents.filter(
    (i) => !["FALSE_REPORT", "DUPLICATE"].includes(i.verificationStatus)
  );

  const handleProfileCreated = (volunteerId: string) => {
    setProfileCreated(volunteerId);
  };

  const handleOfferHelp = async (incidentId: string) => {
    if (!profileCreated) return;
    const res = await fetch("/api/offer-help", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volunteerId: profileCreated, incidentId }),
    });
    if (res.ok) {
      const data = await fetch("/api/incidents").then((r) => r.json());
      setCounts(data.counts ?? {});
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader navItems={[{ href: "/map", label: "Crisis Map" }]} />

      <main className="flex flex-1 flex-col items-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-4xl">
          <h1 className="text-2xl font-bold mb-2">Volunteer</h1>
          <p className="text-muted-foreground mb-6">
            Create your profile and offer to help at an incident. An organizer will review and may confirm your assignment.
          </p>

          <SafetyNotice
            text="Interested does not mean assigned. An organizer may review and confirm you. Do not enter unsafe zones without authorization."
            className="mb-8"
          />

          {!profileCreated ? (
            <VolunteerForm onSuccess={handleProfileCreated} />
          ) : (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Your Profile</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Profile created. You can now offer to help at incidents below.
                </p>
              </CardContent>
            </Card>
          )}

          <h2 className="text-lg font-semibold mb-4">Open Incidents</h2>
          <div className="grid gap-4">
            {publicIncidents.map((inc) => (
              <IncidentCard
                key={inc.id}
                incident={inc}
                interestedCount={counts[inc.id]?.i ?? 0}
                confirmedCount={counts[inc.id]?.c ?? 0}
                checkedInCount={counts[inc.id]?.ch ?? 0}
                actions={
                  profileCreated && (
                    <Button
                      size="sm"
                      onClick={() => handleOfferHelp(inc.id)}
                      disabled={!profileCreated}
                    >
                      Offer to Help
                    </Button>
                  )
                }
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function VolunteerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-muted/20">
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" aria-hidden />
          <span className="sr-only">Loading</span>
        </div>
      }
    >
      <VolunteerContent />
    </Suspense>
  );
}
