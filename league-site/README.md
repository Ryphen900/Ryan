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

## Entering past seasons by hand

`history/seasons.csv` — one row per manager per season. Anything in here is
used as-is, and takes priority over ESPN for that year. Use it when ESPN
doesn't have your older seasons, or won't return them.

Columns: `year, manager, wins, losses, ties, points_for, points_against, finish`
plus optional `team`, `playoff_seed`, `playoff_wins`, `playoff_losses`, and `logo`.

`logo` is an image URL for that team's crest — on ESPN, right-click a team logo
and choose Copy Image Address. Only the champion's logo is displayed, on the
front page. Leave it blank and the team's initials show instead.

`finish` is where they placed: 1 is the champion, 2 the runner-up. Leave it
blank if you don't remember. Use the same spelling of a manager's name every
year — that's how seasons get tied to one person.

Open it in Numbers, Excel or Google Sheets, fill it in, export as CSV, and
replace the file.

## Entering individual games

`history/games.csv` is optional and only matters for the record book. ESPN gives
us game-by-game scores for the current season only, so any older game worth
recording — a league-record score, a famous blowout — gets a row here.

Columns: `year, week, manager, team, points, opp_manager, opp_team, opp_points`.

One row per game, not per team. You don't need every game — only ones that might
hold a record.

## The all-time records page

`history.html` covers every prior season ESPN still has for this league:
career records, championships, and the record book (highest and lowest scores
ever, biggest blowout, best and worst season totals).

The build reads the list of prior seasons from ESPN itself, so there is nothing
to configure. If that list is wrong or incomplete, override it:

```
ESPN_HISTORY_YEARS=2019,2020,2021,2022
```

Everything is keyed on the ESPN **owner id**, not the team name — managers rename
their team most years, and keying on names would split one person's career
across several rows. The page also lists every alias each manager has used.

Notes:

- Only seasons your league actually played on ESPN under this same league ID
  will appear. If the league moved platforms or was recreated at some point,
  the earlier years aren't retrievable.
- The current season counts toward game records but not toward championships or
  season totals, since it isn't finished.
- Set `SKIP_HISTORY=1` to skip the extra requests during local iteration.

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
