"use client";

type CategoryOption = { id: string; name: string };

export function CategoryPick({
  categories,
  value,
  onChange,
  disabled,
  label,
}: {
  categories: CategoryOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  label: string;
}) {
  if (categories.length === 0) return null;
  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label={label}
      className="h-8 max-w-[160px] rounded-lg border border-white/10 bg-[#0d1b26] px-2 text-xs disabled:opacity-60"
    >
      <option value="">Choose category</option>
      {categories.map((cat) => (
        <option key={cat.id} value={cat.id}>
          {cat.name}
        </option>
      ))}
    </select>
  );
}

export function trackLabel(tracked: boolean, busy: boolean, categoryName?: string | null) {
  if (tracked) return "Tracked";
  if (busy) return "Tracking…";
  if (categoryName) return `Track · ${categoryName}`;
  return "Track";
}
