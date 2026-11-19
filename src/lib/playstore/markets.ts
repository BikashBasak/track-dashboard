/** Markets used to confirm geo availability beyond the selected storefront. */
export const PRESENCE_FALLBACK_COUNTRIES = ["us", "in", "gb", "br", "de", "id", "pk", "bd"] as const;

/** Primary storefront first, then fallbacks (deduped, capped). */
export function confirmationCountries(primary: string, limit = 5): string[] {
  const ordered = [primary.toLowerCase(), ...PRESENCE_FALLBACK_COUNTRIES];
  return [...new Set(ordered)].slice(0, limit);
}
