"use client";

import { AppSearch } from "@/components/app-search";
import { CategoryBoard } from "@/components/category-board";
import { PageHeader } from "@/components/ui";

export default function AppsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Module 1 · Live"
        title="App Tracking"
        description="Create categories from the top bar, then move tracked apps into them. Open a category and use Force reload to refresh that group from Play (good for a daily update). Rename or delete a category anytime — deleting it only ungroups apps, it does not untrack them."
      />

      <section className="mb-10">
        <AppSearch />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Categories and tracked apps</h2>
        <CategoryBoard />
      </section>
    </div>
  );
}
