# Track Dashboard

Play Store app intelligence website, built in phases. **Phase 1 is live:** App Tracking and Account Tracking.

This is a Sensor Tower / AsoSpy-style product **in architecture**, not a clone of their private data. It reads **public Google Play listings** and stores your own watchlist snapshots.

---

## Competitor analysis (public products)

These sites were reviewed from **public marketing pages and docs only**. No private APIs were reverse-engineered.

| Product | What it is | Modules that matter for this project |
|---|---|---|
| [Sensor Tower](https://sensortower.com/) | Enterprise app + ad + audience intelligence | App profiles, publisher pages, download/revenue *estimates*, keyword ranks, usage (DAU/MAU), ad creatives. Estimates come from a paid panel + models, not from Play Store HTML. |
| [AsoSpy](https://asospy.com/) | ASO overlay on Play Store + web app | Install band, release/update dates, category, rough installs/day, new vs old badges, competitor browse. Browser extension talks to their own `apivector` backend. |
| [Semrush](https://www.semrush.com/) | Web SEO / traffic, not a Play Store intel platform | Keyword research UX is a good reference for **phase 3 Keyword Intel**, but Semrush is not an app-store database. |
| [AppTweak](https://www.apptweak.com/) | ASO-first | Keyword difficulty, rank tracking, metadata history, reviews. Official paid API. |
| [42matters](https://42matters.com/) (Similarweb) | Bulk metadata + SDK intel | App + publisher dumps, SDK detection. Official paid API / file dumps. |
| [MobileAction](https://www.mobileaction.co/) | ASO + Apple Ads | Keyword compare, update history, creatives. |

### What we can legally reproduce now

Public Play Store pages already expose:

- Title, icon, screenshots, description, what’s new
- Developer name / developer id, website, support email
- Install **band** (`10,000,000+`) and sometimes an upper bound
- Rating, rating count, histogram, recent reviews
- Category, IAP, ads, content rating, version, last updated
- Similar apps, permissions, data safety
- Developer catalog
- Search suggestions and top collections

### What we cannot honestly show without a paid panel

Sensor Tower-style **exact downloads, revenue, DAU, retention, ad spend** are modeled from private panels. This app labels derived numbers clearly. **D/I** uses the same public overlay formula AsoSpy shows: Play’s precise install count (`maxInstalls`) ÷ whole days since the Released date. AsoSpy has no public developer API, so we do not call their private backend.

---

## Keys, APIs, and cracking — read this

**Cracking, stealing, or reusing another product’s API keys is not supported and is not implemented.**

That includes Sensor Tower Connect tokens, AsoSpy / `apivector` keys, Semrush keys, AppTweak keys, or anything pulled out of a competitor’s website, extension, or traffic.

Use only:

1. **Public Play Store data** (default, already wired)
2. **Keys you bought** for an official API, stored in `.env.local`

### Official providers you can plug in later

Copy `.env.example` to `.env.local` and fill **your** credentials:

| Env var | Official product | What it unlocks later |
|---|---|---|
| `SENSORTOWER_API_TOKEN` | [Sensor Tower Connect API](https://app.sensortower.com/) — subscribe, then create a token in your account | Download/revenue estimates, ranks |
| `APPTWEAK_API_KEY` | [AppTweak API](https://www.apptweak.com/) | Keyword volume, difficulty, rank history |
| `FORTYTWOMATTERS_ACCESS_TOKEN` | [42matters API](https://42matters.com/) | Bulk metadata, SDK intel |
| `APPFIGURES_CLIENT_KEY` / `SECRET` | [Appfigures](https://appfigures.com/) | Combined store reporting |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | [Google Play Developer API](https://developers.google.com/android-publisher) | **Only apps you own** (installs, crashes, reviews reply) |

The data layer is a provider (`src/lib/playstore/provider.ts`) so a future `OfficialApiProvider` can sit beside the public Play adapter without rewriting the UI.

---

## Architecture (step by step)

```
src/
  lib/
    modules.ts              Product roadmap (phase, status, features)
    playstore/provider.ts   Google Play public adapter
    playstore/metrics.ts    Derived metrics (age, installs/day)
    playstore/types.ts      Shared types
    store/db.ts             Local watchlist + snapshots (data/store.json)
  app/
    apps/                   Module 1 — App Tracking
    accounts/               Module 2 — Account Tracking
    watchlist/              Snapshots for both modules
    compare/                Side-by-side listings
    explorer/               App Market Explorer (AsoSpy-style)
    charts/                 Top collections
    updates/                Phase 2 stub
    releases/               Phase 2 stub
    keywords/               Phase 3 stub
    api/                    Thin HTTP over the provider + store
  components/               Shared UI shell
```

### Phase 1 — live

1. **App Tracking** — search by name or package id, full listing, ratings mix, reviews, similar apps, permissions, data safety, track + snapshots.
2. **Account Tracking** — publisher catalog, portfolio stats, track the developer.
3. **Watchlist** — refresh all tracked apps/accounts and append snapshots.
5. **App Market Explorer** — keyword or category browse, filters, D/I, age badges (public Play Store data; not AsoSpy keys).
6. **Compare** — up to three apps.

### Phase 2 — next

- Recently updated (version diffs on the watchlist)
- New releases for a keyword/category

### Phase 3 — planned

- Keyword rank tracking
- Category charts / movers
- Optional official paid APIs using **your** keys

---

## Run locally

Needs Node.js 18+.

```bash
npm install
npm run dev
```

If `npm` is not on PATH (Windows), a portable Node was placed at `%LOCALAPPDATA%\nodejs-portable\`. From this folder run:

```powershell
.\start.ps1
```

Open [http://localhost:3000](http://localhost:3000).

1. Go to **App Tracking**, search `WhatsApp` or `com.whatsapp`.
2. Open an app, click **Track this app**.
3. Click **Open publisher** for Account Tracking.
4. Use **Watchlist → Refresh snapshots** to store a second data point.

Country and language sit in the top bar (Play storefront).

---

## Notes

- Play Store HTML changes; `google-play-scraper` can break until updated.
- Be polite with request volume. This is for your dashboard, not bulk harvesting.
- Watchlist file: `data/store.json` (created on first track).
