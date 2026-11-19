const KEY = "track-dashboard-category-reload-v1";

type Meta = Record<string, number>;

function read(): Meta {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Meta;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(next: Meta) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function categoryReloadKey(kind: "app" | "account", categoryId: string) {
  return `${kind}:${categoryId}`;
}

export function getCategoryLastReload(kind: "app" | "account", categoryId: string): number | null {
  const ts = read()[categoryReloadKey(kind, categoryId)];
  return typeof ts === "number" ? ts : null;
}

export function setCategoryLastReload(kind: "app" | "account", categoryId: string, ts = Date.now()) {
  const next = read();
  next[categoryReloadKey(kind, categoryId)] = ts;
  write(next);
}
