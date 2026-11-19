export const COUNTRIES = [
  { code: "us", name: "United States" },
  { code: "in", name: "India" },
  { code: "gb", name: "United Kingdom" },
  { code: "de", name: "Germany" },
  { code: "fr", name: "France" },
  { code: "br", name: "Brazil" },
  { code: "jp", name: "Japan" },
  { code: "kr", name: "South Korea" },
  { code: "id", name: "Indonesia" },
  { code: "mx", name: "Mexico" },
  { code: "au", name: "Australia" },
  { code: "ca", name: "Canada" },
  { code: "es", name: "Spain" },
  { code: "it", name: "Italy" },
  { code: "tr", name: "Turkey" },
  { code: "ae", name: "United Arab Emirates" },
  { code: "sa", name: "Saudi Arabia" },
  { code: "ru", name: "Russia" },
  { code: "vn", name: "Vietnam" },
  { code: "th", name: "Thailand" },
  { code: "ph", name: "Philippines" },
  { code: "pk", name: "Pakistan" },
  { code: "bd", name: "Bangladesh" },
  { code: "ng", name: "Nigeria" },
  { code: "za", name: "South Africa" },
] as const;

export const LANGS = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "ar", name: "Arabic" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "id", name: "Indonesian" },
] as const;

export function defaultStorefront() {
  return {
    country: process.env.PLAY_DEFAULT_COUNTRY || "us",
    lang: process.env.PLAY_DEFAULT_LANG || "en",
  };
}
