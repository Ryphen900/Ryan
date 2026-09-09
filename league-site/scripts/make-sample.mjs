// Generates scripts/sample-league.json and scripts/sample-history.json in
// ESPN's response shape, so the whole site (including all-time records) can be
// previewed before any credentials exist. Team names deliberately change
// between seasons to exercise the owner-id keying.
import { writeFile } from "node:fs/promises";
import path from "node:path";

const managers = [
  "Ryan D", "Marcus H", "Tony P", "Dev S", "Big Mike", "Kev",
  "Nate R", "Sam W", "Chris L", "Joey B", "Andre T", "Will K",
];

const namePool = [
  ["Autodraft Andy", "Draft Day Disaster", "Mock Draft Millionaire"],
  ["The Punt Life", "Punt Intended", "Punt City"],
  ["Bye Week Bandits", "Bye Bye Birdie", "Byes Before Guys"],
  ["Kittle Me This", "Kittle Litter", "Kittle Corn"],
  ["Waiver Wire Warriors", "Wire Tappers", "Waiver Wonders"],
  ["Zero RB Zealots", "Hero RB", "RB Dead Zone"],
  ["Sunday Scaries", "Scary Terry", "Sunday Best"],
  ["Flex Appeal", "Flex Offender", "Full Flex"],
  ["The Handcuffs", "Cuffed Up", "Handcuff Nation"],
  ["Garbage Time Gary", "Garbage Plate", "Trash Pandas"],
  ["Injured Reserved", "IR Stash", "Questionable Tag"],
  ["Commissioner's Curse", "Abuse of Power", "Veto This"],
];

const ownerId = (i) => `{OWNER-${String(i + 1).padStart(4, "0")}-SAMPLE}`;

const members = managers.map((m, i) => ({
  id: ownerId(i),
  displayName: m.toLowerCase().replace(/\s+/g, ""),
  firstName: m.split(" ")[0],
  lastName: m.split(" ")[1] || "",
}));

let seed = 20261;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const score = () => Math.round((72 + rand() * 62) * 10) / 10;

function buildSeason(year, { weeks, nameIndex, finished }) {
  const teams = managers.map((_, i) => ({
    id: i + 1,
    name: namePool[i][nameIndex % namePool[i].length],
    abbrev: `T${i + 1}`,
    owners: [ownerId(i)],
    record: { overall: { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, streakLength: 0, streakType: "WIN" } },
    playoffSeed: null,
    rankCalculatedFinal: null,
  }));

  const byId = new Map(teams.map((t) => [t.id, t]));
  const schedule = [];
  const ids = teams.map((t) => t.id);

  for (let week = 1; week <= weeks; week++) {
    const rotated = [ids[0], ...ids.slice(1).map((_, i) => ids[1 + ((i + week - 1) % (ids.length - 1))])];

    for (let i = 0; i < rotated.length; i += 2) {
      const home = rotated[i];
      const away = rotated[i + 1];
      const decided = finished || week < weeks;
      const hp = decided ? score() : 0;
      const ap = decided ? score() : 0;

      schedule.push({
        matchupPeriodId: week,
        home: { teamId: home, totalPoints: hp },
        away: { teamId: away, totalPoints: ap },
        winner: decided ? (hp >= ap ? "HOME" : "AWAY") : "UNDECIDED",
      });

      if (!decided) continue;

      const h = byId.get(home).record.overall;
      const a = byId.get(away).record.overall;
      h.pointsFor += hp; h.pointsAgainst += ap;
      a.pointsFor += ap; a.pointsAgainst += hp;

      const homeWon = hp >= ap;
      (homeWon ? h : a).wins++;
      (homeWon ? a : h).losses++;

      for (const [rec, won] of [[h, homeWon], [a, !homeWon]]) {
        const type = won ? "WIN" : "LOSS";
        rec.streakLength = rec.streakType === type ? rec.streakLength + 1 : 1;
        rec.streakType = type;
      }
    }
  }

  const ranked = [...teams].sort(
    (x, y) => y.record.overall.wins - x.record.overall.wins ||
              y.record.overall.pointsFor - x.record.overall.pointsFor
  );
  ranked.forEach((t, i) => {
    t.playoffSeed = i + 1;
    if (finished) t.rankCalculatedFinal = i + 1;
  });

  return {
    seasonId: year,
    settings: { name: "The Sunday Scaries Invitational" },
    status: {
      currentMatchupPeriod: weeks,
      latestScoringPeriod: weeks,
      previousSeasons: [2022, 2023, 2024, 2025],
    },
    scoringPeriodId: weeks,
    members,
    teams,
    schedule,
  };
}

const history = [2022, 2023, 2024, 2025].map((year, i) =>
  buildSeason(year, { weeks: 14, nameIndex: i, finished: true })
);

const current = buildSeason(2026, { weeks: 4, nameIndex: 4, finished: false });

const dir = import.meta.dirname;
await writeFile(path.join(dir, "sample-history.json"), JSON.stringify(history, null, 2));
await writeFile(path.join(dir, "sample-league.json"), JSON.stringify(current, null, 2));
console.log("Wrote sample-league.json and sample-history.json");
