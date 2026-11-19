"use client";

import { Radar } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error || "Login failed");
        return;
      }
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#071018] px-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b1720]/90 p-6 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-mint/15 text-mint">
            <Radar className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-foam">Track Dashboard</p>
            <p className="text-xs text-mist">Enter password to continue</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="text-mist">Password</span>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-xl border border-white/12 bg-[#071018] px-3 text-foam outline-none focus:border-mint/50"
              placeholder="Dashboard password"
            />
          </label>
          {error ? <p className="text-sm text-[#ff8b8b]">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !password}
            className="mt-1 h-11 rounded-xl bg-mint px-4 text-sm font-semibold text-ink disabled:opacity-60"
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#071018] text-sm text-mist">Loading…</div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
