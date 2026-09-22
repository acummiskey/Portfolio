# Stash Match

Photograph a yarn ball band. Find out which of your projects that yarn can actually finish.

A knitter's stash and their project queue are two lists that nobody keeps reconciled, because
reconciling them by hand means arithmetic across weight classes, gauge, and yardage for every
pair. This does that arithmetic and explains each answer in a sentence you can act on.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

The app opens with an example stash and three projects so you can see what it does. Everything
you add is stored in your browser; nothing is uploaded except the band photo you choose to scan.

To turn on label scanning, set an [Anthropic API key](https://console.anthropic.com/) first:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Without a key the app still works — the scan screen falls back to manual entry and says so.
The key is only ever read by the server, so it never reaches the browser bundle.

```bash
npm test             # the match engine's test suite
npm run typecheck
npm run build && npm run preview   # production build on http://localhost:5174
```

## How matching works

Every yarn-to-project decision is four deterministic checks. No model is involved — this is
arithmetic over the Craft Yarn Council weight standard, and it lives in
[`src/core/match.ts`](src/core/match.ts).

| Check | Rule |
| --- | --- |
| **Weight** | Same CYC class passes. One class off warns. Two or more fails. |
| **Gauge** | Within 5% of the pattern's stitches per 4" passes; within 20% warns with a needle suggestion; beyond that fails. Falls back to the weight class midpoint, or to wraps per inch, when a band has no gauge. |
| **Yardage** | `skeins × yds/skein + leftovers ≥ pattern yds × 1.15`. The 15% margin covers swatching and a longer body. Covering the raw number without the margin warns; short fails and says how many more skeins to buy. |
| **Fiber** | Superwash for anything machine washed. No animal fiber where wool is ruled out. Superwash cannot felt, and neither can cotton. |

Any failure makes it a **no**, any warning a **close**, and a clean sweep a **works**. The
verdict is never shown without its reason — the fix a knitter needs (go down a needle size, buy
two more skeins) lives in the reason, not the verdict.

Dye lot is a first-class field from the first scan, because two skeins of the same yarn from
different lots do not match and there is no way to add that fact later.

## Reading a ball band

Ball bands are glossy, curved, multilingual, and carry half their information as standardized
icons, which is why `server/extract.mjs` sends the photo to a vision model with a strict schema
rather than running OCR. Fields it cannot read come back null and named in `unreadable`, and the
confirm screen outlines those inputs so you know what to fill in. It never guesses a yardage —
a wrong one sends you into a sweater you cannot finish.

## Layout

```
src/core/      the match engine and the CYC weight tables — no React, fully tested
src/lib/       localStorage persistence and the first-run example stash
src/ui/        screens: stash, projects, matches, and the scan flow
server/        the ball band extractor, shared by the dev middleware and the standalone server
```

## Not built yet

Deliberately out of scope for this first slice: accounts and sync, a pattern library, row
counters, and anything social. Those are Ravelry's ground. The bet here is on capture speed and
an answer you can act on.
