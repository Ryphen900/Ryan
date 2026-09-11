const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function card(mods, label, headline, detail) {
  const c = el("div", `card ${mods}`.trim());
  c.append(el("p", "card__label", label));
  c.append(el("p", "card__team", headline));
  if (detail) c.append(el("p", "card__detail", detail));
  return c;
}

// "Zeke Elliott (RB) — 58.4 · Ryan Manning · Round 2 pick"
function playerDetail(p) {
  const bits = [`${p.points} points`];
  if (p.manager) bits.push(p.manager);
  if (p.acquired) bits.push(p.acquired);
  return bits.join(" · ");
}

function playerHeadline(p) {
  return p.position ? `${p.player} (${p.position})` : p.player;
}

function renderRecords(r) {
  const grid = $("records-grid");
  grid.replaceChildren();

  const when = (x) => `${x.year}, week ${x.week}`;

  if (r.highestGame) {
    grid.append(card("", "Highest score ever",
      r.highestGame.manager, `${r.highestGame.points} points — ${when(r.highestGame)}`));
  }
  if (r.lowestGame) {
    grid.append(card("", "Fewest points in a game",
      r.lowestGame.manager, `${r.lowestGame.points} points — ${when(r.lowestGame)}`));
  }
  if (r.highestScoringGame) {
    const g = r.highestScoringGame;
    grid.append(card("", "Highest-scoring game ever",
      `${g.winnerTeam || g.winner} vs ${g.loserTeam || g.loser}`,
      `${g.total} combined — ${g.winnerPoints}–${g.loserPoints}, ${when(g)}`));
  }
  if (r.playerGame) {
    const p = r.playerGame;
    grid.append(card("", "Most points by a player in a game",
      playerHeadline(p),
      `${playerDetail(p)}${p.year ? ` — ${p.year}${p.week ? `, week ${p.week}` : ""}` : ""}`));
  }
  if (r.playerSeason) {
    const p = r.playerSeason;
    grid.append(card("", "Most points by a player in a season",
      playerHeadline(p),
      `${playerDetail(p)}${p.year ? ` — ${p.year}` : ""}`));
  }
  const showRecord = (rec) => rec.ties ? `${rec.wins}-${rec.losses}-${rec.ties}` : `${rec.wins}-${rec.losses}`;

  if (r.bestRecord) {
    grid.append(card("", "Best regular season record",
      r.bestRecord.team,
      `${showRecord(r.bestRecord)} — ${r.bestRecord.manager}, ${r.bestRecord.year}`));
  }
  if (r.worstRecord) {
    grid.append(card("", "Worst regular season record",
      r.worstRecord.team,
      `${showRecord(r.worstRecord)} — ${r.worstRecord.manager}, ${r.worstRecord.year}`));
  }
  if (r.bestSeason) {
    grid.append(card("", "Most points in a season",
      r.bestSeason.manager, `${r.bestSeason.points} in ${r.bestSeason.year}`));
  }
}

// Column index -> how to sort it. `asc` means low values rank first
// (best finish: 1st beats 8th). Rank column isn't sortable.
const SORTS = [
  null,
  { key: (m) => m.name.toLowerCase(), asc: true, text: true },
  { key: (m) => m.wins },
  { key: (m) => m.winPct },
  { key: (m) => m.seasons },
  { key: (m) => m.championships },
  { key: (m) => m.playoffAppearances },
  { key: (m) => m.playoffWins },
  { key: (m) => m.pointsPerGame },
  { key: (m) => m.bestFinish, asc: true },
];

let tableData = [];
let sortCol = 3;   // win percentage
let sortAsc = false;

function sortManagers() {
  const spec = SORTS[sortCol];
  if (!spec) return tableData;

  return [...tableData].sort((a, b) => {
    const x = spec.key(a);
    const y = spec.key(b);

    // Managers with no value for this column always sit at the bottom.
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;

    if (spec.text) return sortAsc ? (x > y ? 1 : -1) : (x < y ? 1 : -1);
    return sortAsc ? x - y : y - x;
  });
}

function wireSorting() {
  const heads = document.querySelectorAll(".ladder__table thead th");

  heads.forEach((th, i) => {
    const spec = SORTS[i];
    if (!spec) return;

    th.style.cursor = "pointer";
    th.style.userSelect = "none";
    th.tabIndex = 0;
    th.setAttribute("role", "button");
    th.title = "Sort by this column";

    const activate = () => {
      if (sortCol === i) sortAsc = !sortAsc;
      else { sortCol = i; sortAsc = Boolean(spec.asc); }
      drawRows();
      markHeaders();
    };

    th.addEventListener("click", activate);
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
    });
  });

  markHeaders();
}

function markHeaders() {
  document.querySelectorAll(".ladder__table thead th").forEach((th, i) => {
    th.querySelector(".sort-arrow")?.remove();
    th.removeAttribute("aria-sort");
    if (!SORTS[i]) return;

    th.style.color = "";
    if (i !== sortCol) return;

    th.style.color = "var(--ink)";
    th.setAttribute("aria-sort", sortAsc ? "ascending" : "descending");
    const arrow = el("span", "sort-arrow", sortAsc ? " ↑" : " ↓");
    th.append(arrow);
  });
}

function renderTable(managers) {
  tableData = managers;
  drawRows();
  wireSorting();
}

function drawRows() {
  const body = $("alltime-body");
  body.replaceChildren();

  const ordinal = (n) => {
    if (!n) return "—";
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  sortManagers().forEach((m, i) => {
    const tr = el("tr");
    tr.append(el("td", "col-rank", String(i + 1)));
    tr.append(el("td", "col-team", m.name));
    tr.append(el("td", "", m.ties ? `${m.wins}-${m.losses}-${m.ties}` : `${m.wins}-${m.losses}`));
    tr.append(el("td", "num", m.winPct.toFixed(3).replace(/^0/, "")));
    tr.append(el("td", "num", String(m.seasons)));
    tr.append(el("td", "num", m.championships ? "★".repeat(m.championships) : "—"));
    tr.append(el("td", "num", `${m.playoffAppearances} of ${m.seasons}`));
    tr.append(el("td", "num",
      m.playoffAppearances ? `${m.playoffWins}-${m.playoffLosses}` : "—"));
    tr.append(el("td", "num", m.pointsPerGame.toFixed(1)));
    tr.append(el("td", "num", ordinal(m.bestFinish)));
    body.append(tr);
  });
}

function renderTitles(champions) {
  const list = $("titles-list");
  const section = $("titles");
  list.replaceChildren();

  if (!champions.length) { section.hidden = true; return; }

  for (const c of champions) {
    const li = el("li", "titles__row");
    li.append(el("span", "titles__year", String(c.year)));
    li.append(el("span", "titles__manager", c.manager));
    li.append(el("span", "titles__team", `as ${c.team}`));
    list.append(li);
  }
}

function renderAliases(managers) {
  const wrap = $("aliases-list");
  const section = $("aliases");
  const withMany = managers.filter((m) => m.teamNames.length > 1);

  if (!withMany.length) { section.hidden = true; return; }

  wrap.replaceChildren();
  for (const m of withMany) {
    const row = el("p", "alias__row");
    row.append(el("strong", null, m.name));
    row.append(document.createTextNode(" — " + m.teamNames.join(", ")));
    wrap.append(row);
  }
}

async function init() {
  try {
    const res = await fetch("data/history.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(String(res.status));
    const h = await res.json();

    const years = h.yearsCovered;
    $("coverage").textContent =
      years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : `${years[0]}`;

    renderRecords(h.records);
    renderTable(h.managers);
    renderTitles(h.champions);
    renderAliases(h.managers);

    $("stamp").textContent =
      `Covering ${years.length} season${years.length === 1 ? "" : "s"}.` +
      (h.currentYearIncluded ? ` ${h.currentYearIncluded} is still in progress and counts toward records but not titles.` : "");
  } catch (err) {
    $("records-grid").replaceChildren(
      el("p", "loading", "No history data yet. Run `npm run build` — if your league has no prior seasons on ESPN, this page stays empty.")
    );
    console.error(err);
  }
}

init();
