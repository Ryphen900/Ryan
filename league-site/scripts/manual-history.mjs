// Reads history/seasons.csv — one row per manager per season — and converts it
// into the same shape the ESPN fetch produces, so both feed the same
// all-time aggregation. Lets a league keep years ESPN can't or won't return.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const REQUIRED = ["year", "manager", "wins", "losses"];

// Small CSV reader: handles quoted fields and commas inside them.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const num = (v) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
};

export async function loadManualSeasons(root) {
  const file = path.join(root, "history", "seasons.csv");
  if (!existsSync(file)) return { seasons: [], warnings: [] };

  const rows = parseCsv(await readFile(file, "utf8"));
  if (rows.length < 2) return { seasons: [], warnings: [] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) {
    return { seasons: [], warnings: [`seasons.csv is missing column(s): ${missing.join(", ")}`] };
  }

  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const get = (row, col) => (idx[col] === undefined ? "" : row[idx[col]]);

  const byYear = new Map();
  const warnings = [];

  rows.slice(1).forEach((row, n) => {
    const year = num(get(row, "year"));
    const manager = String(get(row, "manager") ?? "").trim();

    if (!year || !manager) {
      warnings.push(`seasons.csv row ${n + 2}: skipped (needs both a year and a manager)`);
      return;
    }

    if (!byYear.has(year)) byYear.set(year, []);
    const teams = byYear.get(year);

    teams.push({
      id: teams.length + 1,
      name: String(get(row, "team") ?? "").trim() || manager,
      logo: String(get(row, "logo") ?? "").trim() || null,
      // Name doubles as the owner key; the aggregator merges on name too,
      // so a manually entered manager lines up with their ESPN seasons.
      owners: [`manual:${manager.toLowerCase()}`],
      record: {
        overall: {
          wins: num(get(row, "wins")),
          losses: num(get(row, "losses")),
          ties: num(get(row, "ties")),
          pointsFor: num(get(row, "points_for")),
          pointsAgainst: num(get(row, "points_against")),
          streakLength: 0,
          streakType: "WIN",
        },
      },
      rankCalculatedFinal: num(get(row, "finish")) || null,
      playoffSeed: num(get(row, "playoff_seed")) || null,
      // Manually stated playoff record; ESPN seasons derive it instead.
      manualPlayoffs: {
        wins: num(get(row, "playoff_wins")),
        losses: num(get(row, "playoff_losses")),
        made: Boolean(num(get(row, "playoff_seed"))),
      },
    });

    if (!teams.members) {
      Object.defineProperty(teams, "members", { value: [], enumerable: false });
    }
    teams.members.push({ id: `manual:${manager.toLowerCase()}`, firstName: manager, lastName: "" });
  });

  const seasons = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, teams]) => ({
      year,
      data: { seasonId: year, teams, members: teams.members || [], schedule: [] },
    }));

  return { seasons, warnings };
}
