# Funding Finder · Ireland

A search tool for research teams and companies: describe an idea and see relevant Irish, EU and ESA funding routes, open tenders and potential partners.

## How it stays current
- A scheduled GitHub Action (`.github/workflows/site.yml`) runs every 6 hours. It reads ESA-STAR, the EU Funding & Tenders portal, Research Ireland and Irish eTenders, checks every funding route's official page, rebuilds the meaning-search index, and republishes the site.
- If a source fails, its last good data is kept and the page says so.
- Funding schemes (`site/data.js`), tracked tenders (`site/tenders.js`) and partners (`site/partners.js`) are curated.

## Privacy
Everything a visitor types, including their organisation profile, stays in their own browser. Nothing is sent to this repository or any server.

## Files
| Path | What it is |
|---|---|
| `site/` | The website |
| `scripts/refresh.mjs` | Reads the live portals and official pages |
| `scripts/embed.mjs` | Builds the meaning-search index |
| `scripts/smoke.mjs` | Checks the live site after each publish |
| `tests/stress.js` | Logic tests (`node tests/stress.js`) |

A guide for orientation, not advice: confirm details with the funder before applying.
