import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { SafetyNotice } from "@/components/SafetyNotice";
import { Map, Users, LayoutDashboard, Shield } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader
        navItems={[
          { href: "/map", label: "Crisis Map" },
          { href: "/volunteer", label: "Volunteer" },
        ]}
      />

      <main className="flex-1">
        <section className="container py-24 px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Coordinate relief when it matters most
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              AidLink helps local organizers triage emergency reports, verify
              incidents, and safely assign volunteers during crises—earthquakes,
              conflict zones, building collapses, and more.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link href="/map">
                <Button size="lg" className="gap-2">
                  <Map className="h-4 w-4" />
                  View Crisis Map
                </Button>
              </Link>
              <Link href="/volunteer">
                <Button variant="outline" size="lg" className="gap-2">
                  <Users className="h-4 w-4" />
                  Volunteer
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button variant="secondary" size="lg" className="gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  Organizer Dashboard
                </Button>
              </Link>
            </div>
            <div className="mt-12">
              <SafetyNotice />
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30 py-16">
          <div className="container px-4">
            <h2 className="text-center text-2xl font-semibold mb-12">
              How it works
            </h2>
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Map className="h-6 w-6" />
                </div>
                <h3 className="font-semibold">Reports & Map</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Emergency reports are ingested and displayed on a live map.
                  Organizers review and verify before acting.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="font-semibold">Triage & Verify</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Raw data is untrusted until reviewed. Organizers verify
                  incidents, mark duplicates, and prioritize by severity.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="font-semibold">Assign & Track</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Volunteers are assigned by organizers. Check-in codes ensure
                  accurate counts. Safety first—no ad-hoc deployments.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-6">
        <div className="container text-center text-sm text-muted-foreground">
          AidLink — Hackathon MVP • Crisis Response Coordination
        </div>
      </footer>
    </div>
  );
}
