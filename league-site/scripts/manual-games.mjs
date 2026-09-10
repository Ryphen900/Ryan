// history/games.csv — one row per notable game. ESPN only hands us game-level
// detail for the current season, so anything older gets entered here to feed
// the record book (highest score, biggest blowout, highest-scoring game).

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const REQUIRED = ["year", "manager", "points", "opp_manager", "opp_points"];

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

export async function loadManualGames(root) {
  const file = path.join(root, "history", "games.csv");
  if (!existsSync(file)) return { games: [], warnings: [] };

  const rows = parseCsv(await readFile(file, "utf8"));
  if (rows.length < 2) return { games: [], warnings: [] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) {
    return { games: [], warnings: [`games.csv is missing column(s): ${missing.join(", ")}`] };
  }

  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const get = (row, col) => (idx[col] === undefined ? "" : String(row[idx[col]] ?? "").trim());

  const games = [];
  const warnings = [];

  rows.slice(1).forEach((row, n) => {
    const year = num(get(row, "year"));
    const a = { manager: get(row, "manager"), team: get(row, "team"), points: num(get(row, "points")) };
    const b = {
      manager: get(row, "opp_manager"),
      team: get(row, "opp_team"),
      points: num(get(row, "opp_points")),
    };

    if (!year || !a.manager || !b.manager) {
      warnings.push(`games.csv row ${n + 2}: skipped (needs year and both managers)`);
      return;
    }

    games.push({ year, week: num(get(row, "week")) || null, a, b });
  });

  return { games, warnings };
}
