"use client";

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
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/lib/language-store";
import { t } from "@/lib/translations";
import type { LangCode } from "@/lib/region-types";

export type SiteHeaderNavItem = { href: string; label: string };

interface SiteHeaderProps {
  navItems: SiteHeaderNavItem[];
  className?: string;
}

const LANG_LABELS: Record<LangCode, string> = {
  en: "English",
  ar: "العربية",
  uk: "Українська",
};

export function SiteHeader({ navItems, className }: SiteHeaderProps) {
  const { lang, setLang, availableLangs } = useLanguageStore();
  const langs = availableLangs();

  return (
    <header
      className={cn(
        "border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0",
        className
      )}
    >
      <div className="container flex h-14 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <AidLinkLogo className="ml-2 sm:ml-4" />
        <nav
          className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:gap-x-4"
          aria-label="Main"
        >
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0">
              <Button variant="outline" size="sm">
                {item.label}
              </Button>
            </Link>
          ))}
          <Link href="/dashboard" className="shrink-0">
            <Button variant="outline" size="sm">
              {t(lang, "organizerMap")}
            </Button>
          </Link>
          <Select value={lang} onValueChange={(v) => setLang(v as LangCode)}>
            <SelectTrigger className="w-[100px] sm:w-[110px] h-9 shrink-0" aria-label={t(lang, "selectLanguage")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {langs.map((code) => (
                <SelectItem key={code} value={code}>
                  {LANG_LABELS[code] ?? code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </nav>
      </div>
    </header>
  );
}
