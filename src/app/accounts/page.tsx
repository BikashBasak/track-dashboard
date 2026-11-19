"use client";

import { AccountCategoryBoard } from "@/components/account-category-board";
import { AccountSearch } from "@/components/account-search";
import { PageHeader } from "@/components/ui";

export default function AccountsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Module 2 · Live"
        title="Account Tracking"
        description="Search the exact Play publisher name, developer ID, or developer URL. Related or similar names are not returned. Create categories from the top bar, track catalogs, then Force reload a category when you want a fresh daily update."
      />

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Search publishers</h2>
        <AccountSearch />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Categories and tracked publishers</h2>
        <AccountCategoryBoard />
      </section>
    </div>
  );
}
