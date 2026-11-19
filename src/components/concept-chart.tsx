"use client";

import { countAppConcepts, type ConceptCount } from "@/lib/app-concept";
import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ConceptChart({
  titles,
  heading = "App concepts",
  hint = "Click a bar to show only those apps. Click it again to show every app.",
  empty = "No app names to group yet.",
  selected = null,
  onSelect,
  onOpen,
}: {
  titles: Array<string | null | undefined>;
  heading?: string;
  hint?: string;
  empty?: string;
  selected?: string | null;
  onSelect?: (concept: string | null) => void;
  onOpen?: () => void;
}) {
  const rows = useMemo(() => countAppConcepts(titles), [titles]);
  const top = rows[0];
  const height = Math.max(220, rows.length * 36 + 24);

  function pick(name?: string | null) {
    if (!onSelect || !name) return;
    onSelect(selected === name ? null : name);
  }

  return (
    <section className="panel mb-5 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{heading}</h3>
          <p className="text-sm text-mist">{hint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selected ? (
            <>
              {onOpen ? (
                <button
                  type="button"
                  onClick={onOpen}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-sm font-semibold"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open all on Play
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onSelect?.(null)}
                className="rounded-full bg-mint px-3 py-1.5 text-sm font-semibold text-ink"
              >
                Show all apps
              </button>
            </>
          ) : top ? (
            <p className="text-sm font-semibold text-mint">
              Most common: {top.name} · {top.count} {top.count === 1 ? "app" : "apps"}
            </p>
          ) : null}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-mist">{empty}</p>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              layout="vertical"
              margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
              style={{ cursor: onSelect ? "pointer" : undefined }}
              onClick={(state) => {
                const payload = state?.activePayload?.[0]?.payload as ConceptCount | undefined;
                pick(payload?.name);
              }}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} stroke="#8aa39a" tick={{ fill: "#8aa39a", fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="label"
                width={196}
                stroke="#8aa39a"
                tick={{ fill: "#e7fff6", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(62,224,179,0.08)" }}
                contentStyle={{ background: "#0d1b26", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }}
                formatter={(value) => [`${value} apps`, "Count"]}
              />
              <Bar dataKey="count" radius={6} barSize={18}>
                {rows.map((row) => (
                  <Cell
                    key={row.name}
                    fill={!selected || selected === row.name ? "#3ee0b3" : "rgba(62,224,179,0.28)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
