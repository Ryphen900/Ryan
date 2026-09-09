import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { loadHistory, loadSampleHistory, aggregate } from "./history.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");

const LEAGUE_ID = process.env.ESPN_LEAGUE_ID;
const SEASON = process.env.ESPN_SEASON || "2026";
const ESPN_S2 = process.env.ESPN_S2;
const SWID = process.env.ESPN_SWID;
const USE_SAMPLE = process.env.SAMPLE === "1";
const SKIP_HISTORY = process.env.SKIP_HISTORY === "1";
// Comma-separated override, e.g. "2019,2020,2021". Otherwise ESPN tells us.
const HISTORY_YEARS = process.env.ESPN_HISTORY_YEARS;

// ---------------------------------------------------------------- ESPN fetch

function espnHeaders() {
  const headers = { accept: "application/json" };
  if (ESPN_S2 && SWID) headers.cookie = `espn_s2=${ESPN_S2}; SWID=${SWID}`;
  return headers;
}

async function loadRaw() {
  if (USE_SAMPLE) {
    const p = path.join(ROOT, "scripts", "sample-league.json");
    return JSON.parse(await readFile(p, "utf8"));
  }

  if (!LEAGUE_ID) {
    throw new Error(
      "ESPN_LEAGUE_ID is not set. Copy .env.example to .env and fill it in, " +
        "or run `npm run sample` to build the site with example data."
    );
  }

  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}` +
    `/segments/0/leagues/${LEAGUE_ID}` +
    `?view=mTeam&view=mSettings&view=mMatchupScore`;

  // SWID must keep its curly braces.
  const res = await fetch(url, { headers: espnHeaders() });

  if (res.status === 401) {
    throw new Error(
      "ESPN returned 401. Your espn_s2 / SWID cookies are missing, expired, or " +
        "belong to an account that isn't in this league. Log into ESPN and copy them again."
    );
  }
  if (!res.ok) {
    throw new Error(`ESPN returned ${res.status} ${res.statusText} for league ${LEAGUE_ID}.`);
  }
  return res.json();
}

// ------------------------------------------------------------- normalisation

function teamName(team) {
  // ESPN switched from location+nickname to a single name field; support both.
  if (team.name) return team.name.trim();
  return [team.location, team.nickname].filter(Boolean).join(" ").trim() || `Team ${team.id}`;
}

function streak(overall) {
  const n = overall?.streakLength || 0;
  if (!n) return "—";
  return `${overall.streakType === "WIN" ? "W" : "L"}${n}`;
}

function normalise(raw) {
  const currentWeek = raw.status?.currentMatchupPeriod ?? raw.scoringPeriodId ?? 1;

  const teams = (raw.teams || []).map((t) => {
    const o = t.record?.overall || {};
    return {
      id: t.id,
      name: teamName(t),
      abbrev: t.abbrev || "",
      logo: t.logo || null,
      wins: o.wins ?? 0,
      losses: o.losses ?? 0,
      ties: o.ties ?? 0,
      pointsFor: Math.round((o.pointsFor ?? 0) * 10) / 10,
      pointsAgainst: Math.round((o.pointsAgainst ?? 0) * 10) / 10,
      streak: streak(o),
      seed: t.playoffSeed ?? null,
    };
  });

  const byId = new Map(teams.map((t) => [t.id, t]));

  const games = (raw.schedule || [])
    .filter((m) => m.home && m.away)
    .map((m) => ({
      week: m.matchupPeriodId,
      home: { id: m.home.teamId, points: round1(m.home.totalPoints) },
      away: { id: m.away.teamId, points: round1(m.away.totalPoints) },
      winner: m.winner || "UNDECIDED",
    }));

  // The most recent week that actually has scores on the board.
  const played = games.filter((g) => g.winner !== "UNDECIDED");
  const lastWeek = played.length ? Math.max(...played.map((g) => g.week)) : null;
  const weekGames = lastWeek ? played.filter((g) => g.week === lastWeek) : [];

  const scores = weekGames.flatMap((g) => [
    { id: g.home.id, points: g.home.points },
    { id: g.away.id, points: g.away.points },
  ]);

  const highest = pick(scores, (a, b) => b.points - a.points);
  const lowest = pick(scores, (a, b) => a.points - b.points);

  const withMargin = weekGames.map((g) => ({
    ...g,
    margin: round1(Math.abs(g.home.points - g.away.points)),
  }));
  const blowout = pick(withMargin, (a, b) => b.margin - a.margin);
  const nailbiter = pick(withMargin, (a, b) => a.margin - b.margin);

  return {
    generatedAt: new Date().toISOString(),
    season: Number(SEASON),
    leagueName: raw.settings?.name || "The League",
    currentWeek,
    lastCompletedWeek: lastWeek,
    standings: [...teams].sort(
      (a, b) =>
        b.wins - a.wins || a.losses - b.losses || b.pointsFor - a.pointsFor
    ),
    week: lastWeek
      ? {
          number: lastWeek,
          highest: label(highest, byId),
          lowest: label(lowest, byId),
          blowout: matchupLabel(blowout, byId),
          nailbiter: matchupLabel(nailbiter, byId),
          games: withMargin.map((g) => ({
            margin: g.margin,
            home: { name: byId.get(g.home.id)?.name, points: g.home.points },
            away: { name: byId.get(g.away.id)?.name, points: g.away.points },
          })),
        }
      : null,
  };
}

const round1 = (n) => Math.round((n ?? 0) * 10) / 10;
const pick = (arr, cmp) => (arr.length ? [...arr].sort(cmp)[0] : null);

function label(entry, byId) {
  if (!entry) return null;
  return { name: byId.get(entry.id)?.name ?? "Unknown", points: entry.points };
}

function matchupLabel(g, byId) {
  if (!g) return null;
  const winnerIsHome = g.home.points >= g.away.points;
  const w = winnerIsHome ? g.home : g.away;
  const l = winnerIsHome ? g.away : g.home;
  return {
    winner: byId.get(w.id)?.name ?? "Unknown",
    loser: byId.get(l.id)?.name ?? "Unknown",
    winnerPoints: w.points,
    loserPoints: l.points,
    margin: g.margin,
  };
}

// ------------------------------------------------------------------ history

async function buildHistory(raw) {
  if (SKIP_HISTORY) return null;

  if (USE_SAMPLE) {
    const seasons = await loadSampleHistory();
    return aggregate([...seasons, { year: Number(SEASON), data: raw }], {
      includeCurrentYear: Number(SEASON),
    });
  }

  // ESPN lists the league's own prior seasons, so we don't have to guess how
  // far back it goes. The env var overrides it if that list is wrong.
  const years = HISTORY_YEARS
    ? HISTORY_YEARS.split(",").map((y) => Number(y.trim())).filter(Boolean)
    : (raw.status?.previousSeasons || []).map(Number).sort((a, b) => a - b);

  if (!years.length) {
    console.log("No prior seasons reported for this league — skipping all-time page.");
    return null;
  }

  console.log(`Fetching ${years.length} prior season(s): ${years.join(", ")}`);

  const seasons = await loadHistory({
    leagueId: LEAGUE_ID,
    years,
    headers: espnHeaders(),
    onProgress: (r) =>
      console.log(r.error ? `  ${r.year}: skipped (${r.error})` : `  ${r.year}: ok`),
  });

  return aggregate([...seasons, { year: Number(SEASON), data: raw }], {
    includeCurrentYear: Number(SEASON),
  });
}

// ----------------------------------------------------------------- newsletters

async function buildNewsletters() {
  const dir = path.join(ROOT, "newsletters");
  if (!existsSync(dir)) return [];

  const files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort().reverse();

  return Promise.all(
    files.map(async (file) => {
      const src = await readFile(path.join(dir, file), "utf8");
      const { meta, body } = frontmatter(src);
      return {
        slug: file.replace(/\.md$/, ""),
        title: meta.title || file.replace(/\.md$/, ""),
        week: meta.week ? Number(meta.week) : null,
        date: meta.date || null,
        dek: meta.dek || "",
        html: marked.parse(body),
      };
    })
  );
}

// Deliberately tiny: `key: value` lines between --- fences. No YAML dependency.
function frontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: m[2] };
}

// ------------------------------------------------------------------- entry

async function main() {
  await mkdir(DATA, { recursive: true });

  const raw = await loadRaw();
  const league = normalise(raw);
  await writeFile(path.join(DATA, "league.json"), JSON.stringify(league, null, 2));

  const history = await buildHistory(raw);
  if (history) {
    await writeFile(path.join(DATA, "history.json"), JSON.stringify(history, null, 2));
  }

  const newsletters = await buildNewsletters();
  await writeFile(path.join(DATA, "newsletters.json"), JSON.stringify(newsletters, null, 2));

  const src = USE_SAMPLE ? "sample data" : `ESPN league ${LEAGUE_ID}`;
  console.log(
    `Built from ${src}: ${league.standings.length} teams, ` +
      `week ${league.lastCompletedWeek ?? "—"} on the board, ` +
      `${newsletters.length} newsletter${newsletters.length === 1 ? "" : "s"}.`
  );
  if (history) {
    console.log(
      `All-time: ${history.yearsCovered.length} season(s) ` +
        `(${history.yearsCovered.join(", ")}), ${history.managers.length} managers.`
    );
  }
}

main().catch((err) => {
  console.error(`\nBuild failed. ${err.message}\n`);
  process.exit(1);
});
