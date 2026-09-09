# League HQ

A static site for an ESPN fantasy league: this week's results up top, full standings,
and the newsletter archive. A build script pulls from ESPN and writes JSON; the page
reads that JSON. Nothing runs on a server, so it hosts free on GitHub Pages.

## See it right now

```bash
npm install
npm run sample     # builds with example data — no ESPN credentials needed
npm run serve      # http://localhost:4173
```

## Point it at your league

1. **League ID** — the number in your ESPN league URL, after `?leagueId=`.
2. **Cookies** — private leagues need two. Log into ESPN, open DevTools →
   Application → Cookies → `fantasy.espn.com`, and copy `espn_s2` and `SWID`.
   Keep the curly braces on `SWID`.
3. Copy `.env.example` to `.env`, fill it in, then:

```bash
set -a && source .env && set +a && npm run build && npm run serve
```

## Put it online

Push to GitHub, then:

- Settings → Pages → Source: **GitHub Actions**
- Settings → Secrets and variables → Actions → add `ESPN_LEAGUE_ID`,
  `ESPN_S2`, `ESPN_SWID`

The workflow in `.github/workflows/refresh.yml` rebuilds and redeploys every Tuesday
at 11:00 UTC, right after Monday night finishes, plus on every push. You can also
trigger it by hand from the Actions tab.

## Adding a newsletter

Drop a markdown file in `newsletters/`. Name them so they sort — `2026-week-04.md`.
The newest one is open by default on the page.

```markdown
---
title: Week 4 — The waiver wire giveth
week: 4
date: 2026-10-06
dek: One sentence that shows in the archive list before anyone clicks.
---

Body text. Standard markdown: **bold**, ## headings, lists, links.
```

Then `npm run build` (or just push — the workflow does it).

## Things worth knowing

- **Cookies expire.** Roughly once a year, sometimes sooner if you log out
  everywhere. When the build starts failing with a 401, grab fresh values and
  update the repo secrets. That's the only recurring maintenance.
- **ESPN's API is unofficial.** It's been stable for years but nobody at ESPN
  promises it. If a field moves, `normalise()` in `scripts/build.mjs` is the one
  place to fix.
- **Don't commit `.env`.** `.gitignore` covers it. Anyone with those cookies can
  act as your ESPN account, so treat them like a password.
- **Playoff cutline** is set to six teams in `assets/app.js` (`PLAYOFF_SPOTS`).

## Files

```
scripts/build.mjs      fetch ESPN + render newsletters → data/*.json
scripts/serve.mjs      local preview server
index.html             page structure
assets/styles.css      all styling
assets/app.js          reads data/*.json, fills the page
newsletters/*.md       one file per issue
```
