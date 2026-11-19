import { PageHeader } from "@/components/ui";
import Link from "next/link";

export function ComingSoon({
  phase,
  title,
  description,
  features,
}: {
  phase: number;
  title: string;
  description: string;
  features: string[];
}) {
  return (
    <div>
      <PageHeader
        eyebrow={`Phase ${phase} · Coming next`}
        title={title}
        description={description}
        actions={
          <Link href="/apps" className="rounded-xl bg-mint px-4 py-2 text-sm font-semibold text-ink">
            Use App Tracking now
          </Link>
        }
      />
      <div className="panel p-6">
        <p className="text-sm font-semibold">Planned capabilities</p>
        <ul className="mt-4 grid gap-2 text-sm text-mist sm:grid-cols-2">
          {features.map((f) => (
            <li key={f} className="rounded-xl bg-white/4 px-4 py-3">
              {f}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-mist">
          Architecture already reserves this module in <span className="font-mono text-foam">src/lib/modules.ts</span>. Phase 1
          (App + Account tracking) is live so the data layer and watchlist can feed these screens next.
        </p>
      </div>
    </div>
  );
}
