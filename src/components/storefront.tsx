"use client";

import { COUNTRIES, LANGS } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type StorefrontState = {
  country: string;
  lang: string;
  setCountry: (v: string) => void;
  setLang: (v: string) => void;
  qs: string;
};

const Ctx = createContext<StorefrontState | null>(null);

export function StorefrontProvider({ children }: { children: React.ReactNode }) {
  const [country, setCountry] = useState("us");
  const [lang, setLang] = useState("en");

  useEffect(() => {
    const saved = localStorage.getItem("track-storefront");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { country?: string; lang?: string };
      if (parsed.country) setCountry(parsed.country);
      if (parsed.lang) setLang(parsed.lang);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("track-storefront", JSON.stringify({ country, lang }));
  }, [country, lang]);

  const value = useMemo(
    () => ({
      country,
      lang,
      setCountry,
      setLang,
      qs: `country=${country}&lang=${lang}`,
    }),
    [country, lang],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStorefront() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("StorefrontProvider missing");
  return ctx;
}

export function StorefrontPicker({ className }: { className?: string }) {
  const { country, lang, setCountry, setLang } = useStorefront();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <select
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className="h-10 rounded-xl border border-white/10 bg-[#0d1b26] px-3 text-sm text-foam"
        aria-label="Country"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        className="h-10 rounded-xl border border-white/10 bg-[#0d1b26] px-3 text-sm text-foam"
        aria-label="Language"
      >
        {LANGS.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
