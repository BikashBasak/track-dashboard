import { NextRequest } from "next/server";
import { defaultStorefront } from "@/lib/countries";
import type { Storefront } from "@/lib/playstore/types";

export function storefrontFrom(request: NextRequest): Storefront {
  const { searchParams } = new URL(request.url);
  const defaults = defaultStorefront();
  return {
    country: (searchParams.get("country") || defaults.country).toLowerCase(),
    lang: (searchParams.get("lang") || defaults.lang).toLowerCase(),
  };
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
