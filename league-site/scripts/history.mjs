// Pulls every prior season of the league and rolls it into all-time records.
// Everything is keyed on the ESPN owner id, not team name, because managers
// rename their team most years and the same person needs to stay one row.

import { readFile } from "node:fs/promises";
import path from "node:path";

const HOST = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl";

export function seasonUrl(leagueId, year) {
  // ESPN split its API in 2018. Older seasons live behind leagueHistory and
  // come back wrapped in a single-element array.
  return year >= 2018
    ? `${HOST}/seasons/${year}/segments/0/leagues/${leagueId}?view=mTeam&view=mSettings&view=mMatchupScore`
    : `${HOST}/leagueHistory/${leagueId}?seasonId=${year}&view=mTeam&view=mSettings&view=mMatchupScore`;
}

async function fetchSeason(leagueId, year, headers) {
  const res = await fetch(seasonUrl(leagueId, year), { headers });
  if (!res.ok) return { year, error: `${res.status} ${res.statusText}` };

  const body = await res.json();
  const data = Array.isArray(body) ? body[0] : body;
  if (!data || !data.teams) return { year, error: "no team data returned" };
  return { year, data };
}

export async function loadHistory({ leagueId, years, headers, onProgress }) {
  const seasons = [];
  for (const year of years) {
    const result = await fetchSeason(leagueId, year, headers);
    onProgress?.(result);
    if (result.data) seasons.push(result);
    // ESPN is fine with this pace and it keeps us well clear of throttling.
    await new Promise((r) => setTimeout(r, 350));
  }
  return seasons;
}

export async function loadSampleHistory() {
  const p = path.join(import.meta.dirname, "sample-history.json");
  const raw = JSON.parse(await readFile(p, "utf8"));
  return raw.map((data) => ({ year: data.seasonId, data }));
}

// ------------------------------------------------------------- aggregation

function managerName(ownerId, members, fallback) {
  const m = (members || []).find((x) => x.id === ownerId);
  if (!m) return fallback;
  const full = [m.firstName, m.lastName].filter(Boolean).join(" ").trim();
  return full || m.displayName || fallback;
}

function teamLabel(t) {
  if (t.name) return t.name.trim();
  return [t.location, t.nickname].filter(Boolean).join(" ").trim() || `Team ${t.id}`;
}

const r1 = (n) => Math.round((n ?? 0) * 10) / 10;

export function aggregate(seasons, { includeCurrentYear = null, manualGames = [] } = {}) {
  const managers = new Map();
  const champions = [];
  const runnersUp = new Map(); // year -> who lost the final
  const gameRecords = [];
  const seasonPoints = [];
  const seasonRecords = [];

  const blank = (id, name) => ({
    id,
    name,
    seasons: [],
    wins: 0,
    losses: 0,
    ties: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    championships: 0,
    runnerUps: 0,
    playoffAppearances: 0,
    playoffWins: 0,
    playoffLosses: 0,
    bestFinish: null,
    teamNames: new Set(),
  });

  for (const { year, data } of seasons) {
    const members = data.members || [];
    const byTeamId = new Map();
    // How many teams made the playoffs that year, when ESPN tells us.
    const playoffTeamCount = data.settings?.scheduleSettings?.playoffTeamCount ?? null;

    for (const t of data.teams || []) {
      const ownerId = (t.owners && t.owners[0]) || `team-${t.id}`;
      const label = teamLabel(t);
      const name = managerName(ownerId, members, label);

      if (!managers.has(ownerId)) managers.set(ownerId, blank(ownerId, name));
      const m = managers.get(ownerId);
      // Prefer a real member name if a later season supplies one.
      if (m.name.startsWith("Team ") && !name.startsWith("Team ")) m.name = name;
      m.teamNames.add(label);
      byTeamId.set(t.id, m);

      const o = t.record?.overall || {};
      m.seasons.push(year);
      m.wins += o.wins ?? 0;
      m.losses += o.losses ?? 0;
      m.ties += o.ties ?? 0;
      m.pointsFor += o.pointsFor ?? 0;
      m.pointsAgainst += o.pointsAgainst ?? 0;

      // A season still in progress can't fairly compete for a points total
      // or a win-loss record.
      if (year !== includeCurrentYear) {
        seasonPoints.push({ manager: m.name, year, points: r1(o.pointsFor) });

        const w = o.wins ?? 0, l = o.losses ?? 0, t = o.ties ?? 0;
        if (w + l + t > 0) {
          seasonRecords.push({
            manager: m.name, team: label, year,
            wins: w, losses: l, ties: t,
            pct: w / (w + l + t),
          });
        }
      }

      if (t.manualPlayoffs) {
        if (t.manualPlayoffs.made) m.playoffAppearances++;
        m.playoffWins += t.manualPlayoffs.wins;
        m.playoffLosses += t.manualPlayoffs.losses;
      } else if (
        year !== includeCurrentYear &&
        playoffTeamCount && t.playoffSeed && t.playoffSeed <= playoffTeamCount
      ) {
        // Seeds exist before a season is played, so an in-progress year would
        // otherwise hand everyone a phantom playoff appearance.
        m.playoffAppearances++;
      }

      const finish = t.rankCalculatedFinal ?? null;
      if (finish) {
        if (m.bestFinish === null || finish < m.bestFinish) m.bestFinish = finish;
        if (finish === 1) {
          m.championships++;
          champions.push({
            year,
            manager: m.name,
            team: label,
            logo: t.logo || null,
            wins: o.wins ?? 0,
            losses: o.losses ?? 0,
            ties: o.ties ?? 0,
            pointsFor: r1(o.pointsFor),
            titleGame: t.titleGame || null,
            playoffRecord: t.manualPlayoffs
              ? `${t.manualPlayoffs.wins}-${t.manualPlayoffs.losses}`
              : null,
          });
        }
        if (finish === 2) {
          m.runnerUps++;
          runnersUp.set(year, { manager: m.name, team: label });
        }
      }
    }

    for (const g of data.schedule || []) {
      if (!g.home || !g.away || g.winner === "UNDECIDED") continue;
      for (const side of [g.home, g.away]) {
        const m = byTeamId.get(side.teamId);
        if (m) gameRecords.push({ manager: m.name, year, week: g.matchupPeriodId, points: r1(side.totalPoints) });
      }
      const margin = Math.abs(g.home.totalPoints - g.away.totalPoints);
      const homeWon = g.home.totalPoints >= g.away.totalPoints;
      gameRecords.push({
        margin: r1(margin),
        year,
        week: g.matchupPeriodId,
        winner: byTeamId.get(homeWon ? g.home.teamId : g.away.teamId)?.name,
        loser: byTeamId.get(homeWon ? g.away.teamId : g.home.teamId)?.name,
        winnerPoints: r1(homeWon ? g.home.totalPoints : g.away.totalPoints),
        loserPoints: r1(homeWon ? g.away.totalPoints : g.home.totalPoints),
        isMatchup: true,
      });
    }
  }

  for (const g of manualGames) {
    for (const side of [g.a, g.b]) {
      gameRecords.push({ manager: side.manager, year: g.year, week: g.week, points: side.points });
    }
    const aWon = g.a.points >= g.b.points;
    gameRecords.push({
      margin: r1(Math.abs(g.a.points - g.b.points)),
      year: g.year,
      week: g.week,
      winner: (aWon ? g.a : g.b).manager,
      loser: (aWon ? g.b : g.a).manager,
      winnerTeam: (aWon ? g.a : g.b).team,
      loserTeam: (aWon ? g.b : g.a).team,
      winnerPoints: r1((aWon ? g.a : g.b).points),
      loserPoints: r1((aWon ? g.b : g.a).points),
      isMatchup: true,
    });
  }

  const scores = gameRecords.filter((g) => !g.isMatchup);
  const matchups = gameRecords.filter((g) => g.isMatchup);
  const best = (arr, cmp) => (arr.length ? [...arr].sort(cmp)[0] : null);

  // Manually entered seasons key on name; ESPN seasons key on owner GUID.
  // Fold together anyone whose resolved name matches so one person is one row.
  const nameKey = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, "");

  const byName = new Map();
  for (const m of managers.values()) {
    const key = nameKey(m.name);
    const first = byName.get(key);
    if (!first) { byName.set(key, m); continue; }
    first.seasons.push(...m.seasons);
    first.wins += m.wins; first.losses += m.losses; first.ties += m.ties;
    first.pointsFor += m.pointsFor; first.pointsAgainst += m.pointsAgainst;
    first.championships += m.championships; first.runnerUps += m.runnerUps;
    first.playoffAppearances += m.playoffAppearances;
    first.playoffWins += m.playoffWins; first.playoffLosses += m.playoffLosses;
    if (m.bestFinish !== null && (first.bestFinish === null || m.bestFinish < first.bestFinish)) {
      first.bestFinish = m.bestFinish;
    }
    for (const n of m.teamNames) first.teamNames.add(n);
  }

  const table = [...byName.values()]
    .map((m) => {
      const games = m.wins + m.losses + m.ties;
      return {
        name: m.name,
        seasons: m.seasons.length,
        firstYear: Math.min(...m.seasons),
        wins: m.wins,
        losses: m.losses,
        ties: m.ties,
        winPct: games ? Math.round((m.wins / games) * 1000) / 1000 : 0,
        pointsFor: r1(m.pointsFor),
        pointsAgainst: r1(m.pointsAgainst),
        pointsPerGame: games ? r1(m.pointsFor / games) : 0,
        championships: m.championships,
        runnerUps: m.runnerUps,
        playoffAppearances: m.playoffAppearances,
        playoffWins: m.playoffWins,
        playoffLosses: m.playoffLosses,
        playoffRate: m.seasons.length
          ? Math.round((m.playoffAppearances / m.seasons.length) * 100)
          : 0,
        bestFinish: m.bestFinish,
        teamNames: [...m.teamNames],
      };
    })
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.pointsFor - a.pointsFor);

  return {
    yearsCovered: [...new Set(seasons.map((s) => s.year))].sort((a, b) => a - b),
    currentYearIncluded: includeCurrentYear,
    managers: table,
    champions: champions
      .map((c) => ({ ...c, runnerUp: runnersUp.get(c.year) || null }))
      .sort((a, b) => b.year - a.year),
    records: {
      highestGame: best(scores, (a, b) => b.points - a.points),
      lowestGame: best(scores, (a, b) => a.points - b.points),
      biggestBlowout: best(matchups, (a, b) => b.margin - a.margin),
      highestScoringGame: best(
        matchups.map((m) => ({ ...m, total: r1(m.winnerPoints + m.loserPoints) })),
        (a, b) => b.total - a.total
      ),
      closestGame: best(matchups, (a, b) => a.margin - b.margin),
      bestRecord: best(seasonRecords, (a, b) => b.pct - a.pct || b.wins - a.wins),
      worstRecord: best(seasonRecords, (a, b) => a.pct - b.pct || a.wins - b.wins),
      bestSeason: best(seasonPoints, (a, b) => b.points - a.points),
      worstSeason: best(seasonPoints, (a, b) => a.points - b.points),
    },
  };
}
