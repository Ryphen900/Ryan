const PLAYOFF_SPOTS = 6;

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

async function getJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

function record(t) {
  return t.ties ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`;
}

// ------------------------------------------------------------------ verdict

function renderVerdict(league) {
  const grid = $("verdict-grid");
  grid.replaceChildren();

  if (!league.week) {
    $("verdict-heading").textContent = "No games on the board yet";
    grid.append(
      el("p", "loading", "Standings will fill in here once Week 1 is scored.")
    );
    return;
  }

  const w = league.week;
  $("week-number").textContent = w.number;

  const card = (mods, label, team, detail) => {
    const c = el("div", `card ${mods}`.trim());
    c.append(el("p", "card__label", label));
    c.append(el("p", "card__team", team));
    if (detail) c.append(el("p", "card__detail", detail));
    return c;
  };

  if (w.lowest) {
    grid.append(
      card(
        "card--shame",
        "Lowest score of the week",
        w.lowest.name,
        `${w.lowest.points} points. The whole league saw it.`
      )
    );
  }

  if (w.highest) {
    grid.append(
      card("", "Highest score", w.highest.name, `${w.highest.points} points`)
    );
  }

  if (w.blowout) {
    grid.append(
      card(
        "",
        "Biggest beating",
        `${w.blowout.winner} over ${w.blowout.loser}`,
        `${w.blowout.winnerPoints}–${w.blowout.loserPoints}, a ${w.blowout.margin}-point margin`
      )
    );
  }

  if (w.nailbiter) {
    grid.append(
      card(
        "",
        "Closest game",
        `${w.nailbiter.winner} over ${w.nailbiter.loser}`,
        `${w.nailbiter.winnerPoints}–${w.nailbiter.loserPoints}, decided by ${w.nailbiter.margin}`
      )
    );
  }
}

// ------------------------------------------------------------------- ladder

function renderLadder(league) {
  const body = $("ladder-body");
  body.replaceChildren();

  league.standings.forEach((t, i) => {
    const tr = el("tr");
    if (i === PLAYOFF_SPOTS - 1) tr.className = "cutline";

    tr.append(el("td", "col-rank", String(i + 1)));
    tr.append(el("td", "col-team", t.name));
    tr.append(el("td", "", record(t)));
    tr.append(el("td", "num", t.pointsFor.toFixed(1)));
    tr.append(el("td", "num", t.pointsAgainst.toFixed(1)));
    tr.append(el("td", "", t.streak));
    body.append(tr);
  });

  $("ladder-note").textContent =
    `Dashed line is the playoff cut — top ${PLAYOFF_SPOTS} are in.`;
}

// ------------------------------------------------------------------- scores

function renderScores(league) {
  const list = $("scores-list");
  const section = $("scores");
  list.replaceChildren();

  if (!league.week || !league.week.games.length) {
    section.hidden = true;
    return;
  }

  $("scores-heading").textContent = `Every result from Week ${league.week.number}`;

  for (const g of league.week.games) {
    const homeWon = g.home.points >= g.away.points;
    const row = el("li", "scores__row");

    for (const [side, won] of [[g.home, homeWon], [g.away, !homeWon]]) {
      const s = el("span", `scores__side scores__side--${won ? "won" : "lost"}`);
      s.append(document.createTextNode(side.name));
      s.append(el("span", "scores__pts", side.points.toFixed(1)));
      row.append(s);
    }

    row.append(el("span", "scores__margin", `by ${g.margin.toFixed(1)}`));
    list.append(row);
  }
}

// ------------------------------------------------------------------ archive

function renderArchive(issues) {
  const wrap = $("archive-list");
  wrap.replaceChildren();

  if (!issues.length) {
    wrap.append(
      el("p", "loading", "No issues yet. Drop a markdown file in /newsletters to start the archive.")
    );
    return;
  }

  issues.forEach((issue, i) => {
    const details = el("details", "issue");
    if (i === 0) details.open = true;

    const summary = el("summary", "issue__toggle");
    summary.append(el("span", "issue__title", issue.title));
    if (issue.dek) summary.append(el("span", "issue__dek", issue.dek));
    details.append(summary);

    const bodyWrap = el("div", "issue__body");
    bodyWrap.innerHTML = issue.html; // Our own markdown, built at deploy time.
    details.append(bodyWrap);

    wrap.append(details);
  });
}

// -------------------------------------------------------------------- init

async function init() {
  try {
    const [league, issues] = await Promise.all([
      getJSON("data/league.json"),
      getJSON("data/newsletters.json").catch(() => []),
    ]);

    document.title = `${league.leagueName} — League HQ`;
    $("league-name").textContent = league.leagueName;
    $("season").textContent = `${league.season} season`;

    renderVerdict(league);
    renderLadder(league);
    renderScores(league);
    renderArchive(issues);

    const when = new Date(league.generatedAt);
    $("stamp").textContent = `Standings last refreshed ${when.toLocaleString()}.`;
  } catch (err) {
    $("verdict-grid").replaceChildren(
      el("p", "loading", "Couldn't load league data. Run `npm run build` to refresh it.")
    );
    console.error(err);
  }
}

init();
