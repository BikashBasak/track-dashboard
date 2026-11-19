"use client";

import { useWatchlist } from "@/components/watchlist-context";
import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export const CATEGORY_CREATED_EVENT = "track-dashboard-category-created";

export type CategoryCreatedDetail = {
  kind: "app" | "account";
  id: string;
};

export function CreateCategoryControl() {
  const pathname = usePathname();
  const watch = useWatchlist();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const kind: "app" | "account" | null =
    pathname === "/apps" ? "app" : pathname === "/accounts" ? "account" : null;

  useEffect(() => {
    setOpen(false);
    setName("");
    setError("");
  }, [kind]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!kind || !watch.ready) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!kind) return;
    const created =
      kind === "app" ? watch.createCategory(name) : watch.createAccountCategory(name);
    if (!created) {
      setError("Enter a unique name");
      return;
    }
    setName("");
    setError("");
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent<CategoryCreatedDetail>(CATEGORY_CREATED_EVENT, {
        detail: { kind, id: created.id },
      }),
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/15 px-3 text-sm text-mist hover:border-mint/40 hover:text-foam"
      >
        <Plus className="h-4 w-4 text-mint" />
        <span className="hidden sm:inline">New category</span>
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError("");
        }}
        placeholder={kind === "app" ? "App category name" : "Account category name"}
        className="h-10 w-[10.5rem] rounded-xl border border-white/15 bg-[#0d1b26] px-3 text-sm text-foam outline-none focus:border-mint/40 sm:w-44"
        aria-label="New category name"
      />
      <button type="submit" className="h-10 rounded-xl bg-mint px-3 text-sm font-semibold text-ink">
        Create
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
          setError("");
        }}
        className="h-10 px-2 text-sm text-mist hover:text-foam"
      >
        Cancel
      </button>
      {error ? <span className="w-full text-xs text-sand sm:w-auto">{error}</span> : null}
    </form>
  );
}
