/**
 * One product idea, one group — even when the store title uses a different word.
 * First match wins, so a narrower concept stays above a broader one
 * ("Photo Editor" stays Photo & video editor, not Gallery. "AI Photo" stays AI).
 */
const CONCEPTS: { name: string; pattern: RegExp }[] = [
  { name: "Launcher", pattern: /\blaunchers?\b/i },
  { name: "Messages", pattern: /\b(messages?|messaging|sms|mms|messenger)\b/i },
  {
    name: "Photo & video editor",
    pattern:
      /\b(?:(?:photos?|images?|pictures?|pics?|videos?)\s*(?:&|and)?\s*(?:photos?|images?|pictures?|pics?|videos?)\s*(?:editors?|editing|makers?|making)|(?:photos?|images?|pictures?|pics?|videos?)\s*(?:editors?|editing|makers?|making)|(?:editors?|editing|makers?|making)\s*(?:photos?|images?|pictures?|pics?|videos?))\b/i,
  },
  { name: "AI", pattern: /\bai\b|\ba\.i\.?\b|artificial\s*intelligence/i },
  { name: "Gallery", pattern: /\b(galler(?:y|ies)|photos?|pictures?|albums?)\b/i },
  { name: "Keyboard", pattern: /\bkeyboards?\b/i },
  { name: "Wallpaper", pattern: /\bwallpapers?\b/i },
  { name: "Clock", pattern: /\b(clocks?|alarms?)\b/i },
  { name: "File manager", pattern: /\b(file\s*managers?|file\s*explorers?|files|my\s*files)\b/i },
  { name: "Browser", pattern: /\bbrowsers?\b/i },
  { name: "Calculator", pattern: /\bcalculators?\b/i },
  { name: "Weather", pattern: /\bweather\b/i },
  { name: "Flashlight", pattern: /\b(flash\s*lights?|torch)\b/i },
  { name: "Camera", pattern: /\bcameras?\b/i },
  { name: "Video", pattern: /\bvideos?\b/i },
  { name: "Music", pattern: /\b(music|audio)\b/i },
  { name: "Notes", pattern: /\b(notes?|notepads?|memos?)\b/i },
  { name: "Calendar", pattern: /\bcalendars?\b/i },
  { name: "Cleaner", pattern: /\b(cleaners?|boosters?|junk)\b/i },
  { name: "VPN", pattern: /\bvpn\b/i },
  {
    name: "Phone",
    pattern:
      /\b(contacts?|dials?|dialers?|dial\s*pads?|phones?|phonebooks?|telephones?|calls?|calling|keypads?)\b|caller/i,
  },
  { name: "Lock screen", pattern: /\b(lock\s*screens?|applocks?|app\s*locks?)\b/i },
  { name: "Icons", pattern: /\b(icon\s*packs?|icons)\b/i },
  { name: "Theme", pattern: /\bthemes?\b/i },
  { name: "Widget", pattern: /\bwidgets?\b/i },
];

export type ConceptCount = {
  name: string;
  count: number;
  label: string;
};

export function appConcept(title?: string | null) {
  const text = String(title || "").trim();
  if (!text) return "Other";
  for (const concept of CONCEPTS) {
    if (concept.pattern.test(text)) return concept.name;
  }
  return "Other";
}

export function countAppConcepts(titles: Array<string | null | undefined>): ConceptCount[] {
  const counts = new Map<string, number>();
  for (const title of titles) {
    const name = appConcept(title);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({
      name,
      count,
      label: `${name} (${count} ${count === 1 ? "app" : "apps"})`,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
