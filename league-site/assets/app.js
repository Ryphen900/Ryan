const PLAYOFF_SPOTS = 7;
const BYE_SEEDS = 1; // Top seed sits out round one.

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

// ---------------------------------------------------------------- champions

// Falls back to initials in a disc when a team has no logo URL.
function crest(champ, size) {
  if (champ.logo) {
    const img = el("img", `crest crest--${size}`);
    img.src = champ.logo;
    img.alt = "";
    img.loading = "lazy";
    // A dead image URL shouldn't leave a broken icon on the page.
    img.addEventListener("error", () => img.replaceWith(initials(champ, size)));
    return img;
  }
  return initials(champ, size);
}

function initials(champ, size) {
  const letters = champ.team
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return el("span", `crest crest--${size} crest--letters`, letters || "?");
}

// The final-game line: score plus who they beat, when we know it.
function titleLine(c) {
  if (!c.titleGame && !c.runnerUp) return null;
  const beat = c.runnerUp ? `def. ${c.runnerUp.team}` : "won the final";
  if (!c.titleGame) return beat;
  return `${beat} ${c.titleGame.for}–${c.titleGame.against}`;
}

function banner(c, size) {
  const b = el("div", `banner banner--${size}`);

  b.append(el("p", "banner__year", String(c.year)));
  b.append(crest(c, size));
  b.append(el("p", "banner__manager", c.manager));
  b.append(el("p", "banner__team", c.team));

  const line = titleLine(c);
  if (line) b.append(el("p", "banner__final", line));

  const stats = `${record(c)}` +
    (size === "lg" ? ` · ${c.pointsFor} points` : "") +
    (c.playoffRecord ? ` · ${c.playoffRecord} in the playoffs` : "");
  b.append(el("p", "banner__record", stats));

  return b;
}

function renderChampions(history) {
  const section = $("champs");
  if (!history || !history.champions || !history.champions.length) return;

  const [latest, ...rest] = history.champions;
  section.hidden = false;

  const current = $("champ-current");
  current.replaceChildren();

  current.append(banner(latest, "lg"));

  const past = $("champ-past");
  past.replaceChildren();
  if (!rest.length) return;

  past.append(el("h3", "champ-past__heading", "Previous winners"));

  const list = el("ul", "champ-past__list");
  for (const c of rest) {
    const li = el("li", "champ-past__item");
    li.append(banner(c, "sm"));
    list.append(li);
  }
  past.append(list);
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
    const team = el("td", "col-team");
    team.append(document.createTextNode(t.name));
    if (i < BYE_SEEDS) team.append(el("span", "tag tag--bye", "BYE"));
    tr.append(team);
    tr.append(el("td", "", record(t)));
    tr.append(el("td", "num", t.pointsFor.toFixed(1)));
    tr.append(el("td", "num", t.pointsAgainst.toFixed(1)));
    tr.append(el("td", "", t.streak));
    body.append(tr);
  });

  $("ladder-note").textContent =
    `Dashed line is the playoff cut — top ${PLAYOFF_SPOTS} make the playoffs. ` +
    `The ${BYE_SEEDS === 1 ? "top seed gets a first-round bye" : `top ${BYE_SEEDS} seeds get first-round byes`}.`;
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
      el("p", "loading", "First issue lands after Week 1. Check back Tuesday.")
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
    const [league, issues, history] = await Promise.all([
      getJSON("data/league.json"),
      getJSON("data/newsletters.json").catch(() => []),
      getJSON("data/history.json").catch(() => null),
    ]);

    document.title = `${league.leagueName} — League HQ`;
    $("league-name").textContent = league.leagueName;
    $("season").textContent = `${league.season} season`;

    renderChampions(history);
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
