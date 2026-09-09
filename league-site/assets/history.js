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

function renderRecords(r) {
  const grid = $("records-grid");
  grid.replaceChildren();

  const when = (x) => `${x.year}, week ${x.week}`;

  if (r.lowestGame) {
    grid.append(card("card--shame", "Worst score in league history",
      r.lowestGame.manager, `${r.lowestGame.points} points — ${when(r.lowestGame)}. It is written down now.`));
  }
  if (r.highestGame) {
    grid.append(card("", "Highest score ever",
      r.highestGame.manager, `${r.highestGame.points} points — ${when(r.highestGame)}`));
  }
  if (r.biggestBlowout) {
    grid.append(card("", "Biggest beating ever",
      `${r.biggestBlowout.winner} over ${r.biggestBlowout.loser}`,
      `${r.biggestBlowout.margin}-point margin — ${when(r.biggestBlowout)}`));
  }
  if (r.closestGame) {
    grid.append(card("", "Closest game ever",
      `${r.closestGame.winner} over ${r.closestGame.loser}`,
      r.closestGame.margin === 0 ? `A dead tie — ${when(r.closestGame)}`
        : `Decided by ${r.closestGame.margin} — ${when(r.closestGame)}`));
  }
  if (r.bestSeason) {
    grid.append(card("", "Most points in a season",
      r.bestSeason.manager, `${r.bestSeason.points} in ${r.bestSeason.year}`));
  }
  if (r.worstSeason) {
    grid.append(card("", "Fewest points in a season",
      r.worstSeason.manager, `${r.worstSeason.points} in ${r.worstSeason.year}`));
  }
}

function renderTable(managers) {
  const body = $("alltime-body");
  body.replaceChildren();

  const ordinal = (n) => {
    if (!n) return "—";
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  managers.forEach((m, i) => {
    const tr = el("tr");
    tr.append(el("td", "col-rank", String(i + 1)));
    tr.append(el("td", "col-team", m.name));
    tr.append(el("td", "", m.ties ? `${m.wins}-${m.losses}-${m.ties}` : `${m.wins}-${m.losses}`));
    tr.append(el("td", "num", m.winPct.toFixed(3).replace(/^0/, "")));
    tr.append(el("td", "num", String(m.seasons)));
    tr.append(el("td", "num", m.championships ? "★".repeat(m.championships) : "—"));
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
