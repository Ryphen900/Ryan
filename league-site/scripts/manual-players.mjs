// history/players.csv — individual player performances worth recording.
// ESPN's API doesn't expose historical box scores to us, and "how they were
// acquired" isn't in the data at all, so these are entered by hand.
//
// scope is "game" for a single week, "season" for a full-year total.

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const REQUIRED = ["year", "scope", "player", "points", "manager"];

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

export async function loadManualPlayers(root) {
  const file = path.join(root, "history", "players.csv");
  if (!existsSync(file)) return { players: [], warnings: [] };

  const rows = parseCsv(await readFile(file, "utf8"));
  if (rows.length < 2) return { players: [], warnings: [] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) {
    return { players: [], warnings: [`players.csv is missing column(s): ${missing.join(", ")}`] };
  }

  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const get = (row, col) => (idx[col] === undefined ? "" : String(row[idx[col]] ?? "").trim());

  const players = [];
  const warnings = [];

  rows.slice(1).forEach((row, n) => {
    const scope = get(row, "scope").toLowerCase();
    const player = get(row, "player");
    const points = num(get(row, "points"));

    if (!player || !points) {
      warnings.push(`players.csv row ${n + 2}: skipped (needs a player and a points total)`);
      return;
    }
    if (scope !== "game" && scope !== "season") {
      warnings.push(`players.csv row ${n + 2}: skipped (scope must be "game" or "season")`);
      return;
    }

    players.push({
      scope,
      year: num(get(row, "year")),
      week: num(get(row, "week")) || null,
      player,
      position: get(row, "position") || null,
      points,
      manager: get(row, "manager"),
      team: get(row, "team") || null,
      acquired: get(row, "acquired") || null,
    });
  });

  return { players, warnings };
}

export function bestPlayers(players) {
  const top = (scope) =>
    players.filter((p) => p.scope === scope).sort((a, b) => b.points - a.points)[0] || null;
  return { playerGame: top("game"), playerSeason: top("season") };
}
