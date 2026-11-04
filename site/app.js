"use strict";
const $ = (s, el = document) => el.querySelector(s);
const pct = (x) => (x == null ? "–" : Math.round(x * 100) + " %");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const S = { data: null, perf: null, meta: null, tickets: null, res: {}, comp: store.get("comp", "ALL"), day: "all", conf: 0,
  combo: store.get("combo", []), book: store.get("book", null), stake: store.get("stake", "5"), tcomp: store.get("tcomp", "ALL"),
  bets: store.get("bets", []), mp: store.get("mp", "combo"), bank: store.get("bank", "") };
const fmtWhen = (iso) => { const d = new Date(iso); return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); };
const n2 = (x) => Number(x).toFixed(2).replace(".", ",");
const dec = (x) => String(x).replace(".", ",");
const num = (s) => parseFloat(String(s ?? "").replace(",", "."));
const euro = (x) => x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const hhmm = (d) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const flagOf = (c) => (S.data && S.data.competitions[c] ? S.data.competitions[c].flag : "");
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 1800); }

async function getJSON(path) {
  const r = await fetch(path + "?t=" + Date.now());
  if (!r.ok) throw new Error(path);
  return r.json();
}

async function init() {
  bindUI();
  $("#match-list").innerHTML = '<div class="skeleton"></div>'.repeat(4);
  let res = null;
  try {
    [S.data, S.perf, S.meta, S.tickets, res] = await Promise.all([getJSON("data/matches.json"), getJSON("data/performance.json"),
      getJSON("data/meta.json").catch(() => null), getJSON("data/tickets.json").catch(() => null),
      getJSON("data/results.json").catch(() => null)]);
    getJSON("data/teams.json").then((x) => { S.teams = x; renderInfos(); }).catch(() => {});
  } catch {
    $("#match-list").innerHTML = '<p class="empty">Pas encore de données. Le premier calcul automatique arrive dans quelques minutes.</p>';
    $("#updated").textContent = "En attente";
    renderMP();
    return;
  }
  S.res = (res && res.results) || {};
  $("#updated").textContent = "Mis à jour " + relTime(S.data.generated);
  renderChips(); renderHighlights(); renderMatches(); renderTickets(); renderMP(); renderPerf(); renderInfos();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

function relTime(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  if (m < 1440) return `il y a ${Math.round(m / 60)} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function bindUI() {
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + b.dataset.view));
    window.scrollTo(0, 0);
  }));
  for (const [id, key] of [["#day-seg", "day"], ["#conf-seg", "conf"]]) {
    $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      S[key] = key === "conf" ? +b.dataset.v : b.dataset.v;
      $(id).querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      renderMatches();
    });
  }
  $("#sheet-bg").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  $("#stake-in").value = S.stake;
  $("#stake-in").addEventListener("input", (e) => { S.stake = e.target.value; store.set("stake", S.stake); renderTickets(); });
  $("#bank-in").value = S.bank || "";
  $("#bank-in").addEventListener("change", (e) => { S.bank = e.target.value; store.set("bank", S.bank); renderTickets(); });
  $("#mp-bets").addEventListener("click", onBetAction);
  $("#mp-stats").addEventListener("click", (e) => {
    if (e.target.id === "bets-export") exportBets();
    if (e.target.id === "bets-import") importBets();
  });
}

// ------------------------------------------------------------------ liste
function renderChips() {
  const comps = S.data.competitions;
  const present = new Set(S.data.matches.map((m) => m.comp));
  if (S.comp !== "ALL" && !present.has(S.comp)) S.comp = "ALL";
  const chip = ([k, v]) => {
    const on = S.comp === k ? "on" : "";
    if (!v.logo) return `<button class="chip ${on}" data-k="${k}">${esc(v.flag + " " + v.name)}</button>`;
    const dark = v.logo.startsWith("icons/") ? "dark" : "";
    return `<button class="chip logo ${dark} ${on}" data-k="${k}" aria-label="${esc(v.name)}" title="${esc(v.name)}">
      <img src="${esc(v.logo)}" alt="" onerror="this.parentNode.classList.add('nologo');this.replaceWith(document.createTextNode('${esc(v.flag + " " + v.name).replace(/'/g, "")}'))"></button>`;
  };
  $("#comp-chips").innerHTML = `<button class="chip all ${S.comp === "ALL" ? "on" : ""}" data-k="ALL">Tout</button>` +
    Object.entries(comps).filter(([k]) => present.has(k)).map(chip).join("");
  $("#comp-chips").onclick = (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    S.comp = b.dataset.k; store.set("comp", S.comp); renderChips(); renderHighlights(); renderMatches();
  };
}

const dayKey = (d) => d.toLocaleDateString("fr-CA");
function crest(url, name, cls = "crest") {
  return url ? `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls} ph',textContent:'${esc(name).slice(0, 1)}'}))">`
             : `<span class="${cls} ph">${esc(name).slice(0, 1)}</span>`;
}

function renderMatches() {
  const today = dayKey(new Date()), tom = dayKey(new Date(Date.now() + 864e5));
  const list = S.data.matches.filter((m) => {
    const dk = dayKey(new Date(m.date));
    return (S.comp === "ALL" || m.comp === S.comp) && m.confidence >= S.conf &&
      (S.day === "all" || (S.day === "today" ? dk === today : dk === tom));
  });
  if (!list.length) { $("#match-list").innerHTML = '<p class="empty">Aucun match pour ces filtres.</p>' + disclaimer(); return; }
  let html = "", last = "";
  for (const m of list) {
    const d = new Date(m.date), dk = dayKey(d);
    if (dk !== last) {
      last = dk;
      const lbl = dk === today ? "Aujourd'hui" : dk === tom ? "Demain" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
      html += `<div class="day">${lbl}</div>`;
    }
    html += cardHTML(m);
  }
  $("#match-list").innerHTML = staleBanner() + html + disclaimer();
  $("#match-list").onclick = (e) => { const c = e.target.closest(".card"); if (c) openSheet(c.dataset.key); };
}

function bar(p, pick) {
  const seg = (k, cls) => `<div class="${cls} ${pick === k ? "pick" : ""}" style="flex:${Math.max(p[k], 0.06)}">${Math.round(p[k] * 100)}</div>`;
  return `<div class="bar">${seg("home", "h")}${seg("draw", "d")}${seg("away", "a")}</div>`;
}

function compTag(code, withName) {
  const c = S.data.competitions[code];
  if (!c.logo) return `${c.flag} ${esc(c.name)}`;
  return `<img class="clogo ${c.logo.startsWith("icons/") ? "dark" : ""}" src="${esc(c.logo)}" alt="${esc(c.name)}" title="${esc(c.name)}" onerror="this.replaceWith(document.createTextNode('${esc(c.flag + " " + c.name).replace(/'/g, "")}'))">${withName ? " " + esc(c.name) : ""}`;
}
const bookOf = (m) => { const want = S.book || "Betclic"; return (m.books || []).find((x) => x.book === want) || (m.books || [])[0]; };
function oddsRow(m) {
  const f = m.final, bk = bookOf(m);
  const btn = (k, lbl, side) => `<div class="ob ${m.pick === k ? "pick" : ""}"><span class="ol">${lbl}</span><b>${bk && bk[side] ? n2(bk[side]) : "–"}</b><small>${pct(f[k])}</small></div>`;
  return `<div class="odds">${btn("home", "1", "h")}${btn("draw", "N", "d")}${btn("away", "2", "a")}</div>`;
}

function cardHTML(m) {
  const c = S.data.competitions[m.comp], f = m.final;
  const time = hhmm(new Date(m.date));
  const confTxt = ["", "Incertain", "Moyen", "Fort"][m.confidence];
  const gap = m.market && Math.abs(m.model.home - m.market.home) >= 0.08;
  const bk = bookOf(m);
  return `<article class="card" data-key="${esc(m.key)}">
    <div class="meta"><span class="cmeta">${compTag(m.comp)} · ${time}</span><span class="conf conf${m.confidence}">${confTxt}</span></div>
    <div class="vs">
      <div class="vteam">${crest(m.home.crest, m.home.name)}<span>${esc(m.home.name)}</span></div>
      <div class="vteam">${crest(m.away.crest, m.away.name)}<span>${esc(m.away.name)}</span></div>
      <div class="vscore"><b>${esc((m.pick_score || m.scores[0]).score)}</b><small>score prono</small></div>
    </div>
    ${oddsRow(m)}
    <div class="tags">
      <span class="tag">+2,5 <b>${pct(f["over_2.5"])}</b></span>
      <span class="tag">Les 2 marquent <b>${pct(f.btts)}</b></span>
      ${bk ? `<span class="tag">${esc(bk.book)}</span>` : '<span class="tag">Pas de cotes</span>'}
      ${gap ? '<span class="tag gap">Écart modèle / marché</span>' : ""}
      ${m.bvalue ? `<span class="tag val">💎 Bonne cote ${m.bvalue.side === "home" ? "1" : m.bvalue.side === "draw" ? "N" : "2"} @${n2(m.bvalue.odd)}</span>` : ""}
    </div>
  </article>`;
}

// ------------------------------------------------------------------ à la une
const COMP_TINT = { PL: "#3b1f6b", PD: "#7a2a1c", SA: "#173f7a", BL1: "#6e1a26", FL1: "#1c3570", CL: "#10307a", EL: "#6b3f0e", ECL: "#0f5236" };
const ghost = (u, cls) => (u ? `<img class="ghost ${cls}" src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">` : "");
function dayWord(d) {
  const k = dayKey(d);
  if (k === dayKey(new Date())) return "Aujourd'hui";
  if (k === dayKey(new Date(Date.now() + 864e5))) return "Demain";
  if (d - Date.now() > 6 * 864e5) return cap(d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }));
  return cap(d.toLocaleDateString("fr-FR", { weekday: "long" }));
}

function topMatches() {
  const now = Date.now(), elo = (t) => t.elo || 1450;
  let pool = S.data.matches.filter((m) => (S.comp === "ALL" || m.comp === S.comp) && new Date(m.date) > now);
  const soon = pool.filter((m) => new Date(m.date) - now < 36 * 3600e3);
  if (soon.length >= 2) pool = soon;
  // les plus belles affiches : deux grosses équipes, plutôt proches, bonus Ligue des champions
  const score = (m) => elo(m.home) + elo(m.away) - 0.5 * Math.abs(elo(m.home) - elo(m.away)) + (m.comp === "CL" ? 80 : 0);
  return pool.slice().sort((a, b) => score(b) - score(a)).slice(0, 4);
}

function topScorers() {
  const now = Date.now();
  let out = [];
  for (const h of [72, 24 * 9, Infinity]) {
    out = [];
    for (const m of S.data.matches) {
      const t = new Date(m.date) - now;
      if ((S.comp !== "ALL" && m.comp !== S.comp) || t < 0 || t > h * 3600e3) continue;
      const seen = new Set();
      for (const s of m.scorers || []) {   // le meilleur de chaque équipe
        if (seen.has(s.side)) continue;
        seen.add(s.side);
        const opp = s.side === "home" ? m.away : m.home;
        out.push({ ...s, key: m.key, date: m.date, team: m[s.side].name, crest: m[s.side].crest, kit: m[s.side].kit, opp: opp.name });
      }
    }
    if (out.length >= 3) break;
  }
  return out.sort((a, b) => b.p - a.p).slice(0, 8);
}

function renderHighlights() {
  const el = $("#highlights");
  if (!S.data || !el) return;
  const tops = topMatches(), sc = topScorers();
  const hero = (m) => {
    const c = S.data.competitions[m.comp], d = new Date(m.date);
    const pickTxt = m.pick === "home" ? m.home.name : m.pick === "away" ? m.away.name : "Match nul";
    return `<article class="hero" data-key="${esc(m.key)}" style="--tint:${COMP_TINT[m.comp] || "#1d2a55"}">
      ${c.logo ? `<div class="hlogo" style="background-image:url('${esc(c.logo)}')"></div>` : ""}${ghost(m.home.crest, "gl")}${ghost(m.away.crest, "gr")}
      <div class="hmeta"><span class="cmeta">${compTag(m.comp)}</span><span>${dayWord(d)} · ${hhmm(d)}</span></div>
      <div class="hteams">
        <div class="ht">${crest(m.home.crest, m.home.name, "hcrest")}<b>${esc(m.home.name)}</b></div>
        <span class="hvs">VS</span>
        <div class="ht">${crest(m.away.crest, m.away.name, "hcrest")}<b>${esc(m.away.name)}</b></div>
      </div>
      ${oddsRow(m)}
      <div class="hpick">Prono de l'app : <b>${esc(pickTxt)}</b> · ${pct(m.final[m.pick])}${m.pick_score ? ` · score ${esc(m.pick_score.score)}` : ""}</div>
    </article>`;
  };
  const scard = (p, i) => {
    const d = new Date(p.date), kit = kitOf(p.kit);
    return `<article class="scard" data-key="${esc(p.key)}">
      <div class="sart" style="--k:${bgOf(kit)}">
        ${ghost(p.crest, "gs")}${playerSVG(p, kit, "s" + i)}
        <span class="srank">#${i + 1}</span>${crest(p.crest, p.team, "screst")}
      </div>
      <div class="sinfo">
        <b class="sname">${esc(p.name)}</b>
        <small class="steam">${esc(p.team)}${p.goals != null ? ` · ${p.goals} but${p.goals > 1 ? "s" : ""}` : ""}</small>
        <div class="sp"><b>${pct(p.p)}</b><small>de marquer</small></div>
        <div class="sfair">cote juste <b>${n2(p.fair)}</b></div>
        <small class="swhen">contre ${esc(p.opp)} · ${dayWord(d)} ${hhmm(d)}</small>
      </div>
    </article>`;
  };
  const podium = (top) => {
    if (top.length < 3) return `<div class="rail">${top.map(scard).join("")}</div>`;
    const col = (x, r) => `<button class="pcol r${r}" data-key="${esc(x.key)}" style="--k:${bgOf(kitOf(x.kit))}">
        <span class="pnum">${r}</span>${crest(x.crest, x.team, "pcrest")}${playerSVG(x, kitOf(x.kit), "p" + r)}
        <b class="pname">${esc(x.last || x.name)}</b><small>${esc(x.team)}</small>
        <span class="ppct">${pct(x.p)}</span><span class="pfair">${n2(x.fair)}</span></button>`;
    return `<div class="podium">${col(top[1], 2)}${col(top[0], 1)}${col(top[2], 3)}</div>`;
  };
  el.innerHTML = (tops.length ? `<div class="hl-head"><h3>À la une</h3></div><div class="rail">${tops.map(hero).join("")}</div>` : "") +
    (sc.length ? `<div class="hl-head"><h3>Top buteurs</h3><span>chance de marquer, s'il joue</span></div>${podium(sc.slice(0, 3))}
      ${sc.length > 3 ? `<div class="rail">${sc.slice(3).map((x, i) => scard(x, i + 3)).join("")}</div>` : ""}` : "");
  el.onclick = (e) => { const c = e.target.closest("[data-key]"); if (c) openSheet(c.dataset.key); };
}

// ------------------------------------------------------------------ silhouettes de buteurs (maillot, nom, numéro : aucun trait physique)
const kitOf = (k) => (k && k.c && k.c.length ? { p: k.p || "plain", c: k.c.concat(k.c).slice(0, 3) } : { p: "plain", c: ["#3a4470", "#f4f4f6", "#f4f4f6"] });
function lum(hex) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const bgOf = (kit) => shade(kit.c[0], lum(kit.c[0]) > 0.4 ? -0.72 : -0.3);
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
const POSES = [   // épaule, coude, main : bras levés, un bras au ciel, avion
  [[[64, 104], [42, 66], [30, 30]], [[136, 104], [158, 66], [170, 30]]],
  [[[64, 106], [54, 146], [50, 184]], [[136, 104], [154, 64], [164, 24]]],
  [[[62, 106], [32, 98], [8, 86]], [[138, 106], [168, 98], [192, 86]]],
];
function hashStr(s) { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return h; }
function playerSVG(p, kit, uid) {   // maillot vu de face : couleurs, motif, écusson côté cœur
  const [c0, c1, c2] = kit.c;
  const ink = shade(c0, lum(c0) > 0.45 ? -0.55 : -0.5);
  const shirt = "M72 22 L54 28 L14 54 L30 98 L56 86 L58 200 Q100 210 142 200 L144 86 L170 98 L186 54 L146 28 L128 22 Q100 46 72 22 Z";
  const layer = {
    stripes: [66, 90, 114, 138, 162].map((x) => `<rect x="${x - 6}" y="0" width="12" height="214" fill="${c1}"/>`).join(""),
    hoops: [70, 102, 134, 166, 198].map((y) => `<rect x="0" y="${y}" width="200" height="16" fill="${c1}"/>`).join(""),
    halves: `<rect x="100" y="0" width="100" height="214" fill="${c1}"/>`,
    diag: `<polygon points="0,214 200,40 200,214" fill="${c1}"/>`,
    band: `<rect x="82" y="0" width="36" height="214" fill="${c2}"/><rect x="88" y="0" width="24" height="214" fill="${c1}"/>`,
    sash: `<polygon points="60,30 82,24 166,200 140,208" fill="${c1}"/>`,
    chest: `<rect x="0" y="92" width="200" height="22" fill="${c1}"/>`,
    sleeves: `<polygon points="0,0 60,0 56,214 0,214" fill="${c1}"/><polygon points="144,0 200,0 200,214 144,214" fill="${c1}"/>`,
  }[kit.p] || "";
  const trim = kit.p === "plain" ? c1 : kit.p === "sleeves" ? c0 : (lum(c0) + lum(c1) > 0.9 ? "#15151a" : "#ffffff");
  return `<svg class="ssil" viewBox="0 0 200 214" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <defs><clipPath id="${uid}t"><path d="${shirt}"/></clipPath>
      <radialGradient id="${uid}hl" cx=".42" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
    <linearGradient id="${uid}fd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c0}"/><stop offset=".45" stop-color="${c0}"/>
      <stop offset="1" stop-color="${shade(c0, lum(c0) > 0.6 ? -0.12 : 0.38)}"/></linearGradient></defs>
    <g clip-path="url(#${uid}t)"><rect width="200" height="214" fill="url(#${uid}fd)"/>${layer}
      <path d="M58 96 L66 200 L58 200 Z M142 96 L134 200 L142 200 Z" fill="${shade(c0, 0.3)}" opacity=".55"/>
      <text x="100" y="128" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-style="italic" font-weight="800" font-size="30"
        fill="${trim}" opacity=".92" letter-spacing="1">BETI<tspan fill="${lum(c0) > 0.45 || [c0, c1].some((c) => /^#f[cdef]/i.test(c)) ? trim : "#ffd60a"}">X</tspan></text>
      <path d="M100 46 L100 214" stroke="#000" stroke-opacity=".08" stroke-width="2"/>
      <path d="M58 92 Q70 150 62 200 M142 92 Q130 150 138 200" stroke="#000" stroke-opacity=".12" stroke-width="3" fill="none"/>
      <rect width="200" height="214" fill="url(#${uid}hl)"/></g>
    <path d="${shirt}" fill="none" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M72 22 Q100 46 128 22" fill="none" stroke="${trim}" stroke-width="7" stroke-linecap="round"/><path d="M76 24 Q100 42 124 24" fill="none" stroke="#000" stroke-opacity=".15" stroke-width="1.5"/>
    <path d="M17 62 L33 92 M183 62 L167 92" stroke="${trim}" stroke-width="5" stroke-linecap="round"/>
    ${p.crest ? `<image href="${esc(p.crest)}" x="114" y="56" width="26" height="26" preserveAspectRatio="xMidYMid meet"/>` : ""}
    ${p.num ? `<text x="78" y="78" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="20" fill="${trim}">${esc(p.num)}</text>` : ""}
  </svg>`;
}

// ------------------------------------------------------------------ infos : forme des équipes
S.icomp = "ALL";
function renderInfos() {
  if (!S.data || !$("#info-list")) return;
  const present = [...new Set(S.data.matches.map((m) => m.comp))];
  $("#info-chips").innerHTML = `<button class="chip all ${S.icomp === "ALL" ? "on" : ""}" data-k="ALL">Tout</button>` +
    present.map((k) => { const v = S.data.competitions[k]; return `<button class="chip tlogo ${S.icomp === k ? "on" : ""}" data-k="${k}" aria-label="${esc(v.name)}">${v.logo ? `<img src="${esc(v.logo)}" alt="" class="${v.logo.startsWith("icons/") ? "full" : ""}">` : esc(v.flag)}</button>`; }).join("");
  $("#info-chips").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; S.icomp = b.dataset.k; renderInfos(); };
  const list = S.data.matches.filter((m) => (S.icomp === "ALL" || m.comp === S.icomp) && new Date(m.date) > Date.now() - 2 * 3600e3);
  let html = "", last = "";
  for (const m of list) {
    const d = new Date(m.date), dk = dayKey(d);
    if (dk !== last) { last = dk; html += `<div class="day">${dayWord(d)} ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</div>`; }
    html += `<button class="irow" data-key="${esc(m.key)}"><span class="cmeta">${compTag(m.comp)}</span>
      <span class="iteams">${crest(m.home.crest, m.home.name)}<b>${esc(m.home.name)}</b><small>${hhmm(d)}</small><b>${esc(m.away.name)}</b>${crest(m.away.crest, m.away.name)}</span>
      <span class="iform">${miniForm(m.home)}<i></i>${miniForm(m.away)}</span></button>`;
  }
  $("#info-list").innerHTML = html || '<p class="empty">Aucun match à venir.</p>';
  $("#info-list").onclick = (e) => { const r = e.target.closest(".irow"); if (r) openDossier(r.dataset.key); };
}
const teamDoc = (t) => S.teams && S.teams.teams[t.crest || t.name];
const resOf = (r) => (r.s[0] > r.s[1] ? "V" : r.s[0] === r.s[1] ? "N" : "D");
function miniForm(t) {
  const d = teamDoc(t); if (!d) return "<span class='src'>–</span>";
  return d.rows.slice(0, 5).reverse().map((r) => `<span class="fb ${resOf(r)}">${resOf(r)}</span>`).join("");
}
function teamStats(rows) {
  const n = rows.length; if (!n) return null;
  const v = rows.filter((r) => r.s[0] > r.s[1]).length, nn = rows.filter((r) => r.s[0] === r.s[1]).length;
  const gf = rows.reduce((a, r) => a + r.s[0], 0), ga = rows.reduce((a, r) => a + r.s[1], 0);
  return { n, v, nn, d: n - v - nn, gf: gf / n, ga: ga / n, cs: rows.filter((r) => r.s[1] === 0).length,
    o25: rows.filter((r) => r.s[0] + r.s[1] > 2.5).length, btts: rows.filter((r) => r.s[0] > 0 && r.s[1] > 0).length };
}
function openDossier(key) {
  const m = S.data.matches.find((x) => x.key === key); if (!m) return;
  const c = S.data.competitions[m.comp], d = new Date(m.date);
  const side = (t) => {
    const doc = teamDoc(t);
    if (!doc) return `<div class="dteam"><p class="src">Pas d'historique dans nos sources pour cette équipe.</p></div>`;
    const st = teamStats(doc.rows.slice(0, 10));
    const pos = Object.entries(doc.pos || {}).map(([k, p]) => `<span class="dpos">${compTag(k)} <b>${p[0]}<sup>e</sup></b> · ${p[1]} pts · ${p[2]} m.</span>`).join("");
    const comps = [...new Set(doc.rows.map((r) => r.c))];
    const block = (k) => { const rows = doc.rows.filter((r) => r.c === k).slice(0, 5); return rows.length ? `<div class="dblock"><div class="dbh">${compTag(k, true)}</div>${rows.map(rowHTML).join("")}</div>` : ""; };
    return `<div class="dteam">
      <div class="dname">${crest(t.crest, t.name)}<b>${esc(t.name)}</b></div>
      ${pos ? `<div class="dposs">${pos}</div>` : ""}
      <div class="form">${doc.rows.slice(0, 5).reverse().map((r) => `<span class="fb ${resOf(r)}">${resOf(r)}</span>`).join("")}</div>
      ${st ? `<div class="dstats"><span><b>${st.v}-${st.nn}-${st.d}</b>V-N-D</span><span><b>${dec(st.gf.toFixed(1))}</b>buts marqués</span><span><b>${dec(st.ga.toFixed(1))}</b>encaissés</span>
        <span><b>${st.cs}</b>clean sheets</span><span><b>${Math.round(st.o25 / st.n * 100)} %</b>+2,5 buts</span><span><b>${Math.round(st.btts / st.n * 100)} %</b>2 marquent</span></div>
        <p class="src">Sur les ${st.n} derniers matchs, toutes compétitions.</p>` : ""}
      ${comps.map(block).join("")}
    </div>`;
  };
  const rowHTML = (r) => `<div class="drow"><time>${new Date(r.d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</time><span class="dv">${r.v === "D" ? "dom." : "ext."}</span>
    ${crest(r.oc, r.o)}<span class="dop">${esc(r.o)}</span><b class="dsc ${resOf(r)}">${r.s[0]}-${r.s[1]}</b></div>`;
  const h = (S.teams && S.teams.h2h[key]) || [];
  $("#sheet").innerHTML = `<div class="sheet-top"><span></span><div class="grab"></div><button class="close" aria-label="Fermer">×</button></div>
    <div class="meta"><span class="cmeta">${compTag(m.comp, true)}</span><span>${dayWord(d)} · ${hhmm(d)}</span></div>
    <div class="dtabs"><button class="on" data-s="0">${esc(m.home.name)}</button><button data-s="1">${esc(m.away.name)}</button>${h.length ? '<button data-s="2">Face-à-face</button>' : ""}</div>
    <div class="dpane" data-p="0">${side(m.home)}</div><div class="dpane" data-p="1" hidden>${side(m.away)}</div>
    ${h.length ? `<div class="dpane" data-p="2" hidden><p class="src">Du point de vue de ${esc(m.home.name)}.</p>${h.map(rowHTML).join("")}</div>` : ""}
    <button class="btn" id="dos-match">Voir le prono du match</button>`;
  $("#sheet").onclick = (e) => {
    if (e.target.closest(".close")) { closeSheet(); return; }
    if (e.target.id === "dos-match") { openSheet(key); return; }
    const t = e.target.closest(".dtabs button"); if (!t) return;
    $("#sheet").querySelectorAll(".dtabs button").forEach((b) => b.classList.toggle("on", b === t));
    $("#sheet").querySelectorAll(".dpane").forEach((p) => (p.hidden = p.dataset.p !== t.dataset.s));
  };
  showSheet();
}

// ------------------------------------------------------------------ fiche
function showSheet() { $("#sheet").classList.add("on"); $("#sheet-bg").classList.add("on"); $("#sheet").scrollTop = 0; }

function openSheet(key) {
  const m = S.data.matches.find((x) => x.key === key); if (!m) return;
  const c = S.data.competitions[m.comp], f = m.final, mo = m.model, mk = m.market;
  const d = new Date(m.date);
  const row = (lbl, k) => `<tr><td>${lbl}</td><td>${pct(mo[k])}</td><td>${mk ? pct(mk[k]) : "–"}</td><td class="hl">${pct(f[k])}</td></tr>`;
  const form = (t) => t.form.length ? `<div class="form">${t.form.map((x) => `<span class="fb ${x.r}" title="${esc(x.opp)}">${x.s}</span>`).join("")}</div>` : '<span class="src">–</span>';
  const xg = (t) => t.xg ? `${dec(t.xg.for)} créés · ${dec(t.xg.against)} concédés` : "–";
  const abs = (t) => t.absences.length ? t.absences.map((a) => `${esc(a.player)} <small>(${esc(a.reason || "absent")}${a.doubt && a.reason !== "incertain" ? ", incertain" : ""})</small>`).join(", ") : "Aucune signalée";
  const inC = (sel) => S.combo.some((x) => x.id === m.key + "|" + sel) ? "in" : "";
  const addBtn = (sel, lbl, p) => `<button class="add ${inC(sel)}" data-sel="${sel}">${lbl}<b>${pct(p)}</b></button>`;

  $("#sheet").innerHTML = `<div class="sheet-top"><span></span><div class="grab"></div><button class="close" aria-label="Fermer">×</button></div>
    <div class="meta"><span class="cmeta">${compTag(m.comp, true)}</span><span>${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span></div>
    <div class="big-teams">
      <div>${crest(m.home.crest, m.home.name)}<div class="n">${esc(m.home.name)}</div><div class="elo">${m.home.elo ? "Elo " + m.home.elo : ""}</div></div>
      <div class="xgline">${dec(m.xg[0])} – ${dec(m.xg[1])}<small>buts attendus</small></div>
      <div>${crest(m.away.crest, m.away.name)}<div class="n">${esc(m.away.name)}</div><div class="elo">${m.away.elo ? "Elo " + m.away.elo : ""}</div></div>
    </div>
    ${bar(f, m.pick)}

    <button class="btn dos" data-dos="${esc(m.key)}">📋 Forme des équipes et derniers matchs</button>
    <h3>L'analyse</h3>
    <ul class="why">${m.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
    ${m.quality.map((q) => `<p class="note">⚠ ${esc(q)}</p>`).join("")}

    <h3>Probabilités</h3>
    <table><tr><th></th><th>Modèle</th><th>Marché</th><th>Finale</th></tr>
      ${row(esc(m.home.name), "home")}${row("Nul", "draw")}${row(esc(m.away.name), "away")}${row("+2,5 buts", "over_2.5")}
      <tr><td>Les 2 marquent</td><td>${pct(mo.btts)}</td><td>–</td><td class="hl">${pct(f.btts)}</td></tr>
      <tr><td>+1,5 / +3,5 buts</td><td>${pct(mo["over_1.5"])} / ${pct(mo["over_3.5"])}</td><td>–</td><td></td></tr>
    </table>
    <p class="src" style="margin-top:6px">Finale = ${mk ? `${Math.round(W().market * 100)} % marché + ${100 - Math.round(W().market * 100)} % modèle` : "modèle seul (pas de cotes)"}.${m.pick_score ? ` Si ${m.pick === "home" ? esc(m.home.name) + " gagne" : m.pick === "away" ? esc(m.away.name) + " gagne" : "c'est nul"}, le score le plus probable est ${m.pick_score.score}.` : ""} Scores exacts les plus probables : ${m.scores.map((s) => `${s.score} (${pct(s.p)})`).join(", ")}</p>
    ${m.scorers && m.scorers.length ? `<h3>Buteurs (au moins un but, s'il joue)</h3>
    <table><tr><th></th><th>Chance</th><th>Cote juste</th></tr>
      ${m.scorers.map((p) => `<tr><td>${esc(p.name)} <small class="src">${esc(m[p.side].name)}</small></td><td>${pct(p.p)}</td><td class="hl">${n2(p.fair)}</td></tr>`).join("")}</table>
    <p class="src" style="margin-top:6px">Estimé à partir de ses buts cette saison et la précédente, et des buts attendus de son équipe ce jour-là. On ne connaît pas la compo : vérifie qu'il est titulaire. En général, le pari est remboursé s'il ne joue pas (vérifie la règle Betclic).</p>` : ""}
    ${m.combos && m.combos.length ? `<h3>Combis du match (MyCombi)</h3>
    <table><tr><th></th><th>Chance</th><th>Cote juste</th></tr>
      ${m.combos.map((c) => `<tr><td>${esc(c.label)}</td><td>${pct(c.p)}</td><td class="hl">${n2(c.fair)}</td></tr>`).join("")}</table>
    <p class="src" style="margin-top:6px">Ces cotes ne sont pas dans nos sources. Compare dans MyCombi : la combi ne vaut le coup que si Betclic paie plus que la cote juste.</p>` : ""}

    ${m.books.length ? `<h3>Cotes ${mk ? "· relevées " + relTime(mk.at) : ""}</h3>
    <table><tr><th></th><th>1</th><th>N</th><th>2</th><th>Marge</th></tr>
      ${m.books.map((b) => `<tr><td>${esc(b.book)}</td><td>${n2(b.h)}</td><td>${n2(b.d)}</td><td>${n2(b.a)}</td><td>${dec(b.margin)} %</td></tr>`).join("")}
    </table>
    ${m.value ? `<p class="note">La meilleure cote (${n2(m.value.odd)} chez ${esc(m.value.book)}) dépasse d'environ ${m.value.ev} % la proba finale. Un écart vient souvent d'une info que le modèle n'a pas (compo, blessure).</p>` : ""}` : ""}

    <h3>Forme (5 derniers)</h3>
    <div class="twocol"><div><div class="lbl">${esc(m.home.name)}</div>${form(m.home)}</div><div><div class="lbl">${esc(m.away.name)}</div>${form(m.away)}</div></div>
    <h3>${S.data.xg_source === "tirs" ? "xG approchés (tirs)" : "xG"} sur les 6 derniers</h3>
    <div class="twocol src"><div>${xg(m.home)}</div><div>${xg(m.away)}</div></div>
    <h3>Repos & absences</h3>
    <div class="twocol src">
      <div>${m.home.rest != null ? m.home.rest + " j de repos" : "–"}<br>${abs(m.home)}</div>
      <div>${m.away.rest != null ? m.away.rest + " j de repos" : "–"}<br>${abs(m.away)}</div>
    </div>

    <h3>Ajouter au combiné</h3>
    <div class="add-grid">
      ${addBtn("home", "1", f.home)}${addBtn("draw", "N", f.draw)}${addBtn("away", "2", f.away)}
      ${addBtn("over", "+2,5", f["over_2.5"])}${addBtn("under", "−2,5", 1 - f["over_2.5"])}${addBtn("btts", "BTTS", f.btts)}
    </div>
    ${disclaimer()}`;
  $("#sheet").onclick = (e) => {
    if (e.target.closest(".close")) { closeSheet(); return; }
    const dos = e.target.closest("[data-dos]"); if (dos) { openDossier(dos.dataset.dos); return; }
    const b = e.target.closest(".add"); if (!b) return;
    toggleCombo(m, b.dataset.sel); b.classList.toggle("in");
  };
  showSheet();
}
function closeSheet() { $("#sheet").classList.remove("on"); $("#sheet-bg").classList.remove("on"); }

const W = () => (S.data && S.data.weights) || { market: 0.6, xg: 0.55, xi: 0.003, elo: 0.3 };

// ------------------------------------------------------------------ tickets
function renderTickets() {
  const T = S.tickets;
  if (!T || !T.books || !T.books.length) {
    $("#book-chips").innerHTML = "";
    $("#tickets").innerHTML = '<p class="empty">Pas encore de tickets.<br>Il faut des cotes (clé ODDS_KEY) et des matchs dans les prochains jours.</p>';
    $("#tickets-track").innerHTML = trackHTML();
    return;
  }
  if (!S.book || !T.books.includes(S.book)) S.book = T.books[0];
  $("#book-chips").innerHTML = T.books.map((b) => `<button class="chip ${b === S.book ? "on" : ""}" data-b="${esc(b)}">${esc(b)}</button>`).join("");
  $("#book-chips").onclick = (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    S.book = c.dataset.b; store.set("book", S.book); renderTickets(); renderMatches();
  };
  const groups = T.groups || {};
  const comps = (T.comps || []).filter((c) => groups[c] || (S.data && S.data.competitions[c]));
  if (S.tcomp !== "ALL" && !comps.includes(S.tcomp)) S.tcomp = "ALL";
  const logoOf = (c) => { const v = S.data.competitions[c]; return v && v.logo ? `<img src="${esc(v.logo)}" alt="" class="${v.logo.startsWith("icons/") ? "full" : ""}">` : esc(v ? v.flag : c); };
  const tchip = (c) => {
    const on = S.tcomp === c ? "on" : "";
    if (groups[c]) return `<button class="chip tlogo group ${on}" data-c="${c}" aria-label="${esc(groups[c].name)}">${groups[c].members.map(logoOf).join("")}</button>`;
    return `<button class="chip tlogo ${on}" data-c="${c}" aria-label="${esc(S.data.competitions[c].name)}">${logoOf(c)}</button>`;
  };
  $("#tcomp-chips").innerHTML = `<button class="chip all ${S.tcomp === "ALL" ? "on" : ""}" data-c="ALL">Toutes</button>` + comps.map(tchip).join("");
  $("#tcomp-chips").onclick = (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    S.tcomp = c.dataset.c; store.set("tcomp", S.tcomp); renderTickets();
  };
  const res = currentTickets();
  $("#tickets").innerHTML = Object.entries(T.formulas).map(([fid, fm]) => formulaHTML(fid, fm, res[fid])).join("") +
    `<p class="src tnote">Glisse pour voir les 3 tickets de chaque formule. Cotes ≈ estimées : vérifie-les chez ${esc(S.book)}.</p>`;
  $("#tickets").onclick = (e) => {
    const b = e.target.closest(".copy, .play"); if (!b) return;
    if (b.classList.contains("copy")) copyTicket(b.dataset.f, +b.dataset.i || 0);
    else playTicket(b.dataset.f, +b.dataset.i || 0);
  };
  document.querySelectorAll(".trail").forEach((r) => r.addEventListener("scroll", () => {
    const i = Math.round(r.scrollLeft / (r.firstElementChild.offsetWidth + 12));
    r.nextElementSibling && r.nextElementSibling.querySelectorAll("i").forEach((d, k) => d.classList.toggle("on", k === i));
  }, { passive: true }));
  $("#combis").innerHTML = combisHTML();
  $("#buteurs").oninput = $("#combis").oninput = (e) => {
    const inp = e.target.closest("input[data-cid]"); if (!inp) return;
    const saved = store.get("combi_odds", {}); saved[inp.dataset.cid] = inp.value; store.set("combi_odds", saved);
    const out = [...document.querySelectorAll(".cverdict")].find((x) => x.dataset.for === inp.dataset.cid);
    if (out) out.innerHTML = combiVerdict(+inp.dataset.p, inp.value);
  };
  $("#buteurs").innerHTML = buteursHTML();
  $("#tickets-track").innerHTML = trackHTML();
}

function currentTickets() {
  const T = S.tickets;
  if (S.tcomp === "ALL") return T.by_book[S.book] || {};
  return ((T.by_comp || {})[S.book] || {})[S.tcomp] || {};
}

function crests(hc, ac) {
  const one = (u) => (u ? `<img src="${esc(u)}" alt="" loading="lazy" onerror="this.remove()">` : "");
  return hc || ac ? `<span class="lcrests">${one(hc)}${one(ac)}</span>` : "";
}

function combisHTML() {
  const list = (S.tickets && S.tickets.combis) || [];
  if (!list.length) return "";
  const saved = store.get("combi_odds", {});
  return `<section class="formula t-combi"><header class="fhead"><span class="tname">🎯 Combis du jour</span><span class="fband">à comparer dans MyCombi</span></header>
    <div class="trail">${list.map((c, i) => {
      const cid = c.key + "|" + c.label, v = saved[cid] || "";
      return `<article class="slipt" style="--d:${i}">
        <div class="st-head"><span class="st-brand">BETI<b>X</b></span><span>MyCombi</span><span class="st-no">${i + 1}/${list.length}</span></div>
        <ul class="st-legs"><li class="sleg" style="--k:0"><div class="lmeta">${compTag(c.comp)}<span>${esc(c.match)}</span><time>${fmtWhen(c.date)}</time></div>
          <div class="lpick"><span class="lsel">${esc(c.label)}</span></div></li></ul>
        <div class="st-tear" aria-hidden="true"></div>
        <div class="st-foot"><div class="st-odds"><small>Cote juste</small><b>${n2(c.fair)}</b></div>
          <div class="st-money"><span>Chance <b>${pct(c.p)}</b></span></div></div>
        <label class="input cin"><span class="src">Cote Betclic</span><input inputmode="decimal" data-cid="${esc(cid)}" data-p="${c.p}" placeholder="ex : ${n2(c.fair * 0.9)}" value="${esc(v)}"></label>
        <div class="cverdict" data-for="${esc(cid)}">${combiVerdict(c.p, v)}</div>
        <div class="st-bar" aria-hidden="true"></div>
      </article>`;
    }).join("")}</div>
    ${list.length > 1 ? `<div class="tdots">${list.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>` : ""}
    <p class="src tnote">La cote juste, c'est la vraie chance sans la marge du bookmaker. Tape la cote affichée par MyCombi : l'app te dit si elle vaut le coup.</p></section>`;
}
function combiVerdict(p, v) {
  const o = num(v);
  if (!(o > 1)) return "";
  const ev = Math.round((p * o - 1) * 100);
  return `<span class="tg ${ev >= 0 ? "pos" : "neg"}">${ev >= 0 ? "Bonne cote" : "Cote trop basse"} · rendement ${ev >= 0 ? "+" : ""}${ev} %</span>`;
}
function buteursHTML() {
  const list = (S.tickets && S.tickets.buteurs) || [];
  if (!list.length) return "";
  const saved = store.get("combi_odds", {});
  return `<section class="formula t-buteur"><header class="fhead"><span class="tname">⚽ Buteurs du jour</span><span class="fband">s'il est titulaire</span></header>
    <div class="trail">${list.map((c, i) => {
      const cid = c.key + "|but|" + c.name, v = saved[cid] || "";
      return `<article class="slipt" style="--d:${i}">
        <div class="st-head"><span class="st-brand">BETI<b>X</b></span><span>Buteur</span><span class="st-no">${i + 1}/${list.length}</span></div>
        <ul class="st-legs"><li class="sleg" style="--k:0"><div class="lmeta">${compTag(c.comp)}<span>${esc(c.match)}</span><time>${fmtWhen(c.date)}</time></div>
          <div class="lpick"><span class="lsel">${crests(c.crest, "")} ${esc(c.name)} marque</span></div></li></ul>
        <div class="st-tear" aria-hidden="true"></div>
        <div class="st-foot"><div class="st-odds"><small>Cote juste</small><b>${n2(c.fair)}</b></div>
          <div class="st-money"><span>Chance <b>${pct(c.p)}</b></span></div></div>
        <label class="input cin"><span class="src">Cote Betclic</span><input inputmode="decimal" data-cid="${esc(cid)}" data-p="${c.p}" placeholder="ex : ${n2(c.fair * 0.9)}" value="${esc(v)}"></label>
        <div class="cverdict" data-for="${esc(cid)}">${combiVerdict(c.p, v)}</div>
        <div class="st-bar" aria-hidden="true"></div>
      </article>`;
    }).join("")}</div>
    ${list.length > 1 ? `<div class="tdots">${list.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>` : ""}
    <p class="src tnote">Vérifie la compo avant de jouer : l'app ne la connaît pas.</p></section>`;
}

function advisedStake(p, odds) {
  const bank = num(S.bank); if (!(bank > 0)) return null;
  const k = (p * odds - 1) / (odds - 1);
  const f = k > 0 ? Math.min(k / 4, 0.03) : 0.005;   // quart de Kelly, plafonné à 3 % ; sinon mise « plaisir » de 0,5 %
  return { eur: Math.max(0.1, Math.round(bank * f * 10) / 10), fun: k <= 0 };
}
const ticketsOf = (t) => (t ? [t].concat(t.alts || []) : []);
function formulaHTML(fid, fm, t) {
  const list = ticketsOf(t);
  const head = `<header class="fhead"><span class="tname">${fm.emoji} ${esc(fm.name)}</span><span class="fband">cote ${n2(fm.band[0])} à ${n2(fm.band[1])}</span></header>`;
  if (!list.length) return `<section class="formula t-${fid}">${head}<p class="src tnone">Pas de ticket crédible dans cette fourchette chez ${esc(S.book)} pour l'instant.</p></section>`;
  return `<section class="formula t-${fid}">${head}
    <div class="trail">${list.map((x, i) => ticketHTML(fid, fm, x, i, list.length)).join("")}</div>
    ${list.length > 1 ? `<div class="tdots">${list.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>` : ""}</section>`;
}

function ticketHTML(fid, fm, t, i = 0, n = 1) {
  const now = Date.now();
  const started = t.legs.some((l) => new Date(l.date) <= now);
  const stake = num(S.stake) || 0;
  const ev = Math.round(t.ev * 100);
  const logo = (c) => { const v = S.data && S.data.competitions[c]; return v && v.logo ? `<img class="llogo" src="${esc(v.logo)}" alt="${esc(v.name)}">` : (v ? v.flag : ""); };
  const legs = t.legs.map((l, k) => `<li class="sleg ${new Date(l.date) <= now ? "past" : ""}" style="--k:${k}">
      <div class="lmeta">${logo(l.comp)}<span>${esc(l.match)}</span><time>${fmtWhen(l.date)}</time></div>
      <div class="lpick"><span class="lsel">${esc(l.label)}</span><span class="obadge">${l.est ? "≈" : ""}${n2(l.odd)}</span></div></li>`).join("");
  return `<article class="slipt" style="--d:${i}">
    <div class="st-head"><span class="st-brand">BETI<b>X</b></span><span>${t.legs.length === 1 ? "Simple" : `Combiné ×${t.legs.length}`}</span><span class="st-no">${n > 1 ? `${i + 1}/${n}` : ""}</span></div>
    <ul class="st-legs">${legs}</ul>
    <div class="st-tear" aria-hidden="true"></div>
    <div class="st-foot">
      <div class="st-odds"><small>Cote totale</small><b>${n2(t.odds)}</b></div>
      <div class="st-money"><span>Mise <b>${stake ? euro(stake) : "–"}</b></span><span>Gain <b class="gain">${stake ? euro(stake * t.odds) : "–"}</b></span></div>
    </div>
    ${(() => { const a = advisedStake(t.p, t.odds); return a ? `<p class="advice">Mise conseillée : <b>${euro(a.eur)}</b>${a.fun ? " · pour le plaisir, la cote ne compense pas le risque" : " · la cote paie plus que le risque"}</p>` : ""; })()}
    <div class="st-tags"><span class="tg">${pct(t.p)} de chances</span><span class="tg ${ev >= 0 ? "pos" : "neg"}">rendement ${ev >= 0 ? "+" : ""}${ev} %</span>${t.window_h > 48 ? '<span class="tg">matchs de la semaine</span>' : ""}</div>
    <div class="st-bar" aria-hidden="true"></div>
    ${started ? '<p class="note">⚠ Un match a commencé : ticket remplacé au prochain calcul.</p>' : ""}
    <div class="tact"><button class="copy" data-f="${fid}" data-i="${i}">Copier</button>
      ${isPlayed(fid, t) ? `<button class="play done" data-f="${fid}" data-i="${i}">Dans Mes paris ✓</button>` : started ? "" : `<button class="play" data-f="${fid}" data-i="${i}">Je l'ai joué</button>`}</div>
  </article>`;
}

const legSig = (legs) => legs.map((l) => l.key + "|" + l.sel).sort().join(",");
const isPlayed = (src, t) => S.bets.some((b) => b.src === src && legSig(b.legs) === legSig(t.legs));

function playTicket(fid, i = 0) {
  const t = ticketsOf(currentTickets()[fid])[i]; if (!t) return;
  if (isPlayed(fid, t)) { toast("Déjà dans Mes paris"); return; }
  openBetForm({ src: fid, book: S.book, odds: t.odds,
    legs: t.legs.map(({ key, comp, date, match, hc, ac, sel, label, odd }) => ({ key, comp, date, match, hc, ac, sel, label, odd })) });
}

function copyTicket(fid, i = 0) {
  const T = S.tickets, fm = T.formulas[fid], t = ticketsOf(currentTickets()[fid])[i];
  if (!t) return;
  const txt = `${fm.emoji} Ticket ${fm.name} (${S.book}) – cote ${n2(t.odds)} – ${pct(t.p)} de chances\n` +
    t.legs.map((l) => `• ${l.label} (${l.match}, ${fmtWhen(l.date)}) @${l.est ? "≈" : ""}${n2(l.odd)}`).join("\n");
  const done = () => toast("Ticket copié");
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done).catch(() => window.prompt("Copie le ticket :", txt));
  else window.prompt("Copie le ticket :", txt);
}

function trackHTML() {
  const T = S.tickets, tr = T && T.tracking;
  const intro = `<h3 class="day">Suivi des tickets${T && T.track_book ? " · " + esc(T.track_book) : ""}</h3>
    <p class="src" style="margin-bottom:8px">Chaque ticket est figé au coup d'envoi de son 1er match, puis réglé avec les scores. Ça montre ce qu'ils auraient vraiment rapporté.</p>`;
  if (!tr || !tr.recent.length) return intro + '<p class="src">Le suivi démarre : premiers résultats après les prochains matchs.</p>';
  const rows = Object.entries(T.formulas).map(([fid, fm]) => {
    const s = tr.by_formula[fid];
    if (!s) return `<div class="trow"><span class="tn">${fm.emoji} ${esc(fm.name)}</span><span class="src">pas encore réglé</span></div>`;
    const roi = Math.round(s.roi * 100);
    return `<div class="trow"><span class="tn">${fm.emoji} ${esc(fm.name)}</span>
      <b class="${roi >= 0 ? "pos" : "neg"}">${roi >= 0 ? "+" : ""}${roi} %</b>
      <small class="src">${s.won} passé${s.won > 1 ? "s" : ""} sur ${s.n} · ${pct(s.hit)} (attendu ${pct(s.expected)})</small></div>`;
  }).join("");
  const icon = { won: "✓", lost: "✗", pending: "⏳" };
  const recent = tr.recent.map((t) => {
    const fm = T.formulas[t.formula] || { emoji: "", name: t.formula };
    return `<div class="res"><span>${fm.emoji} ${fmtWhen(t.first)} · ${t.legs.length} sél. · cote ${n2(t.odds)}</span>
      <span class="${t.status === "won" ? "ok" : t.status === "lost" ? "ko" : ""}">${icon[t.status] || ""}</span></div>`;
  }).join("");
  return intro + `<div class="tsum">${rows}</div><p class="src" style="margin:6px 0 4px">En couleur : rendement réel si tu avais misé 1 € sur chaque ticket.</p>${recent}`;
}

// ------------------------------------------------------------------ combiné
const SEL_LBL = { home: "Victoire dom.", draw: "Match nul", away: "Victoire ext.", over: "+2,5 buts", under: "−2,5 buts", btts: "Les 2 marquent" };
function selProb(m, sel) {
  const f = m.final;
  return { home: f.home, draw: f.draw, away: f.away, over: f["over_2.5"], under: 1 - f["over_2.5"], btts: f.btts }[sel];
}
function toggleCombo(m, sel) {
  const id = m.key + "|" + sel;
  const i = S.combo.findIndex((x) => x.id === id);
  if (i >= 0) S.combo.splice(i, 1);
  else {
    S.combo = S.combo.filter((x) => !(x.key === m.key && ["home", "draw", "away"].includes(x.sel) && ["home", "draw", "away"].includes(sel)));
    S.combo.push({ id, key: m.key, sel, label: `${m.home.name} – ${m.away.name}` });
  }
  store.set("combo", S.combo); renderCombo();
}

function selLabel(m, sel) {
  return { home: `${m.home.name} gagne`, draw: "Match nul", away: `${m.away.name} gagne`, over: "Plus de 2,5 buts",
    under: "Moins de 2,5 buts", btts: "Les 2 équipes marquent" }[sel];
}
function selOdd(m, sel) {   // cote du bookmaker choisi quand on l'a (pas pour « les 2 marquent »)
  const bk = bookOf(m);
  if (["home", "draw", "away"].includes(sel)) return bk ? bk[{ home: "h", draw: "d", away: "a" }[sel]] || null : null;
  if (sel === "over" || sel === "under") {
    const want = S.book || "Betclic", tb = (m.totals_books || []).find((x) => x.book === want);
    return tb ? tb[sel] || null : null;
  }
  return null;
}

function renderCombo() {
  const live = S.combo.map((s) => ({ ...s, m: S.data && S.data.matches.find((x) => x.key === s.key) })).filter((s) => s.m);
  if (S.data && live.length !== S.combo.length) { S.combo = live.map(({ m, ...s }) => s); store.set("combo", S.combo); }
  const badge = $("#combo-badge"); badge.textContent = live.length; badge.classList.toggle("on", live.length > 0);
  if (!live.length) { $("#combo").innerHTML = '<p class="empty">Aucune sélection.<br>Ouvre un match et touche une issue pour l\'ajouter.</p>'; return; }
  const sameMatch = new Set(live.map((s) => s.key)).size < live.length;
  const p = live.reduce((a, s) => a * selProb(s.m, s.sel), 1);
  const fair = 1 / p;
  const odds = live.map((s) => selOdd(s.m, s.sel));
  const bookTotal = !sameMatch && odds.every((o) => o) ? odds.reduce((a, o) => a * o, 1) : null;
  const saved = store.get("combo_odd", "");
  $("#combo").innerHTML = `
    ${live.map((s, i) => `<div class="sel"><div class="lmain">${crests(s.m.home.crest, s.m.away.crest)}<div>${esc(selLabel(s.m, s.sel))}<small>${esc(s.label)} · ${fmtWhen(s.m.date)}</small></div></div>
      <div class="sright">${odds[i] ? `<span class="obadge">${n2(odds[i])}</span>` : ""}<span class="pct">${pct(selProb(s.m, s.sel))}</span><button class="x" data-id="${esc(s.id)}" aria-label="Retirer">×</button></div></div>`).join("")}
    <div class="kpis">
      <div class="kpi"><div class="v">${p >= 0.01 ? Math.round(p * 1000) / 10 + " %" : "< 1 %"}</div><div class="l">Chance que tout passe</div></div>
      <div class="kpi"><div class="v">${n2(fair)}</div><div class="l">Cote « juste » (sans marge)</div></div>
    </div>
    <div class="input"><span class="src">Cote ${esc(S.book || "Betclic")}</span><input id="odd-in" inputmode="decimal" placeholder="${bookTotal ? n2(bookTotal) : "ex : 12,50"}" value="${esc(saved)}"></div>
    ${bookTotal ? `<p class="src" style="margin-top:6px">Calculée avec les cotes relevées : ${n2(bookTotal)}. Corrige-la si l'appli de ton bookmaker affiche autre chose (boost, cote qui a bougé).</p>` : ""}
    <div id="verdict"></div>
    ${sameMatch ? '<p class="note">⚠ Plusieurs sélections sur le même match : elles sont liées, le calcul les traite comme indépendantes et devient approximatif.</p>' : ""}
    <button class="cta" id="combo-play">Je l'ai joué</button>
    <p class="src" style="margin-top:12px">Ce combiné passe environ 1 fois sur ${Math.max(1, Math.round(fair))}. Chaque sélection ajoutée cumule la marge du bookmaker, c'est pour ça que les gros combinés sont rarement rentables.</p>
    <button class="btn" id="combo-clear">Vider le combiné</button>`;
  const offered = () => num($("#odd-in").value) || bookTotal || 0;
  const verdict = () => {
    store.set("combo_odd", $("#odd-in").value);
    const v = offered();
    if (!v || v <= 1) { $("#verdict").innerHTML = ""; return; }
    const ev = p * v - 1;
    $("#verdict").innerHTML = `<div class="verdict ${ev >= 0 ? "ok" : "bad"}">Espérance à ${n2(v)} : <b>${ev >= 0 ? "+" : ""}${Math.round(ev * 100)} %</b> par euro misé.
      ${ev < 0 ? `En moyenne, tu perds ${Math.abs(Math.round(ev * 100))} centimes par euro sur ce type de pari.` : "La cote paie plus que la chance estimée, mais ça reste une estimation : garde des mises raisonnables."}</div>`;
  };
  $("#odd-in").addEventListener("input", verdict); verdict();
  $("#combo").onclick = (e) => {
    const x = e.target.closest(".x");
    if (x) { S.combo = S.combo.filter((s) => s.id !== x.dataset.id); store.set("combo", S.combo); renderCombo(); }
    if (e.target.id === "combo-clear") { S.combo = []; store.set("combo", []); store.set("combo_odd", ""); renderCombo(); }
    if (e.target.id === "combo-play") {
      openBetForm({ src: "combine", book: S.book || "Betclic", odds: offered() > 1 ? offered() : null,
        legs: live.map((s, i) => ({ key: s.m.key, comp: s.m.comp, date: s.m.date, match: `${s.m.home.name} – ${s.m.away.name}`,
          hc: s.m.home.crest || "", ac: s.m.away.crest || "", sel: s.sel, label: selLabel(s.m, s.sel), odd: odds[i] })) });
    }
  };
}

// ------------------------------------------------------------------ mes paris (gardés sur l'appareil)
const LEG_WON = { home: (h, a) => h > a, draw: (h, a) => h === a, away: (h, a) => h < a, "1N": (h, a) => h >= a, N2: (h, a) => h <= a,
  "12": (h, a) => h !== a, over: (h, a) => h + a > 2.5, under: (h, a) => h + a < 2.5, btts: (h, a) => h > 0 && a > 0 };
const SEL_TYPE = { home: "Victoire d'une équipe", away: "Victoire d'une équipe", draw: "Match nul", "1N": "Double chance",
  N2: "Double chance", "12": "Double chance", over: "Plus de 2,5 buts", under: "Moins de 2,5 buts", btts: "Les 2 équipes marquent" };
function srcName(src) {
  const fm = S.tickets && S.tickets.formulas && S.tickets.formulas[src];
  return fm ? `${fm.emoji} Ticket ${fm.name}` : src === "combine" ? "🧩 Mon combiné" : "Pari";
}
function legState(l) {
  const r = S.res[l.key];
  if (r && r[0] != null) return LEG_WON[l.sel] && LEG_WON[l.sel](r[0], r[1]) ? "won" : "lost";
  if (Date.now() - new Date(l.date) > 4 * 864e5) return "void";   // match reporté ou score introuvable
  return "wait";
}
function betState(b) {
  if (b.manual) return b.manual;
  const st = b.legs.map(legState);
  if (st.includes("lost")) return "lost";
  if (st.includes("wait")) return "wait";
  return st.every((s) => s === "void") ? "void" : "won";
}
function betReturn(b, st = betState(b)) {
  if (st === "won") {
    let o = b.odds;
    if (!b.manual) for (const l of b.legs) if (legState(l) === "void" && l.odd) o /= l.odd;   // sélection annulée = cote 1
    return b.stake * Math.max(o, 1);
  }
  return st === "void" ? b.stake : 0;
}
function saveBets() { store.set("bets", S.bets); }

function openBetForm(d) {
  const n = d.legs.length;
  $("#sheet").innerHTML = `<div class="sheet-top"><span></span><div class="grab"></div><button class="close" aria-label="Fermer">×</button></div>
    <h2 class="title">Je l'ai joué</h2>
    <p class="src">${esc(srcName(d.src))} · ${n} sélection${n > 1 ? "s" : ""} · ${esc(d.book || "Betclic")}</p>
    <ul class="legs bf">${d.legs.map((l) => `<li><div class="lmain">${crests(l.hc, l.ac)}<div><span class="lsel">${esc(l.label)}</span><small>${flagOf(l.comp)} ${esc(l.match)} · ${fmtWhen(l.date)}</small></div></div>${l.odd ? `<span class="obadge">${n2(l.odd)}</span>` : ""}</li>`).join("")}</ul>
    <div class="bf-grid">
      <label class="input"><span class="src">Mise</span><input id="bf-stake" inputmode="decimal" value="${esc(S.stake)}"><span class="src">€</span></label>
      <label class="input"><span class="src">Cote</span><input id="bf-odds" inputmode="decimal" value="${d.odds ? n2(d.odds) : ""}" placeholder="ex : 3,40"></label>
    </div>
    <p class="src" style="margin-top:8px">Mets la cote exacte que ${esc(d.book || "Betclic")} t'a donnée au moment de jouer.</p>
    <button class="cta" id="bf-save">Enregistrer le pari</button>
    <p class="src" style="margin-top:10px">Enregistré sur cet appareil. Le résultat se met à jour tout seul avec les scores.</p>`;
  $("#sheet").onclick = (e) => {
    if (e.target.closest(".close")) { closeSheet(); return; }
    if (e.target.id !== "bf-save") return;
    const stake = num($("#bf-stake").value), odds = num($("#bf-odds").value);
    if (!(stake > 0) || !(odds > 1)) { toast("Indique la mise et la cote"); return; }
    S.bets.unshift({ id: "b" + Date.now().toString(36), at: new Date().toISOString(), src: d.src, book: d.book || "Betclic",
      stake: Math.round(stake * 100) / 100, odds: Math.round(odds * 100) / 100, legs: d.legs });
    saveBets(); closeSheet(); toast("Ajouté à Mes paris");
    renderTickets(); renderMP();
  };
  showSheet();
}

function renderMP() {
  const pend = S.bets.filter((b) => betState(b) === "wait").length;
  $("#mp-seg").innerHTML = [["combo", "Combiné"], ["bets", `Mes paris${pend ? ` (${pend})` : ""}`], ["stats", "Bilan"]]
    .map(([k, l]) => `<button data-v="${k}" class="${S.mp === k ? "on" : ""}">${l}</button>`).join("");
  $("#mp-seg").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    S.mp = b.dataset.v; store.set("mp", S.mp); renderMP(); window.scrollTo(0, 0);
  };
  for (const k of ["combo", "bets", "stats"]) $("#mp-" + k).hidden = S.mp !== k;
  if (S.mp === "bets") $("#mp-bets").innerHTML = betsHTML();
  if (S.mp === "stats") $("#mp-stats").innerHTML = statsHTML();
  renderCombo();
}

function betsHTML() {
  if (!S.bets.length) return `<p class="empty">Aucun pari enregistré.<br>Touche « Je l'ai joué » sous un ticket ou dans ton combiné : le résultat et ton bilan se mettront à jour tout seuls.</p>`;
  const list = S.bets.map((b) => ({ b, st: betState(b) }))
    .sort((x, y) => ((x.st === "wait") === (y.st === "wait") ? (x.b.at < y.b.at ? 1 : -1) : x.st === "wait" ? -1 : 1));
  let html = "", head = "";
  for (const { b, st } of list) {
    const h = st === "wait" ? "En cours" : "Terminés";
    if (h !== head) { head = h; html += `<div class="day">${h}</div>`; }
    html += betCard(b, st);
  }
  return html + `<p class="src" style="margin-top:10px">Un match reporté (sans score après 4 jours) compte comme remboursé. Si ton bookmaker a réglé autrement (cash out, règle spéciale), corrige avec ⋯.</p>`;
}

function betCard(b, st) {
  const ret = betReturn(b, st);
  const pill = { wait: "En cours", won: "Gagné", lost: "Perdu", void: "Remboursé" }[st];
  const legs = b.legs.map((l) => {
    const ls = legState(l), r = S.res[l.key];
    return `<li class="leg ${ls}"><div class="lmain">${crests(l.hc, l.ac)}<div><span class="lsel">${esc(l.label)}</span>
      <small>${flagOf(l.comp)} ${esc(l.match)} · ${r ? `<b>${r[0]}-${r[1]}</b>` : fmtWhen(l.date)}</small></div></div>
      <span class="lst">${{ won: "✓", lost: "✗", void: "–", wait: "" }[ls]}</span></li>`;
  }).join("");
  const money = st === "wait" ? `<span>Gain possible</span><b>${euro(b.stake * b.odds)}</b>`
    : st === "won" ? `<span>Gagné</span><b class="pos">+${euro(ret - b.stake)}</b>`
    : st === "lost" ? `<span>Perdu</span><b class="neg">−${euro(b.stake)}</b>` : `<span>Remboursé</span><b>${euro(b.stake)}</b>`;
  return `<article class="bet ${st}" data-id="${b.id}">
    <header><span class="pill ${st}">${pill}${b.manual ? " · corrigé" : ""}</span><span class="src">${esc(srcName(b.src))}</span></header>
    <ul class="legs">${legs}</ul>
    <div class="slip">
      <div><span>Mise · cote</span><span><b>${euro(b.stake)}</b> <span class="obadge">${n2(b.odds)}</span></span></div>
      <div>${money}</div>
    </div>
    <div class="bfoot"><span class="src">${esc(b.book)} · joué ${new Date(b.at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span><button class="more" data-act="more" aria-label="Corriger">⋯</button></div>
    <div class="bact"><button data-act="won">Gagné</button><button data-act="lost">Perdu</button><button data-act="void">Remboursé</button>
      ${b.manual ? '<button data-act="auto">Automatique</button>' : ""}<button data-act="del" class="danger">Supprimer</button></div>
  </article>`;
}

function onBetAction(e) {
  const btn = e.target.closest("[data-act]"); if (!btn) return;
  const card = btn.closest(".bet"), b = S.bets.find((x) => x.id === card.dataset.id); if (!b) return;
  const act = btn.dataset.act;
  if (act === "more") { card.classList.toggle("open"); return; }
  if (act === "del") {
    if (!btn.classList.contains("armed")) { btn.classList.add("armed"); btn.textContent = "Confirmer ?"; return; }
    S.bets = S.bets.filter((x) => x !== b); toast("Pari supprimé");
  } else b.manual = act === "auto" ? null : act;
  saveBets(); renderMP(); renderTickets();
}

const pctBar = (w, n) => `<span class="rate"><i style="width:${Math.round((w / n) * 100)}%"></i></span><b>${Math.round((w / n) * 100)} %</b><small>${w}/${n}</small>`;

function statsHTML() {
  const all = S.bets.map((b) => ({ b, st: betState(b) }));
  const done = all.filter((x) => x.st !== "wait");
  const staked = done.reduce((a, x) => a + x.b.stake, 0), back = done.reduce((a, x) => a + betReturn(x.b, x.st), 0);
  const won = done.filter((x) => x.st === "won").length, profit = back - staked;
  const byComp = {}, byType = {}, bySrc = {};
  for (const { b } of all) for (const l of b.legs) {
    const ls = legState(l); if (ls !== "won" && ls !== "lost") continue;
    for (const [o, k] of [[byComp, l.comp], [byType, SEL_TYPE[l.sel] || "Autre"]]) { o[k] = o[k] || [0, 0]; o[k][0]++; if (ls === "won") o[k][1]++; }
  }
  for (const { b, st } of done) {
    const o = (bySrc[b.src] = bySrc[b.src] || { n: 0, w: 0, st: 0, back: 0 });
    o.n++; o.st += b.stake; o.back += betReturn(b, st); if (st === "won") o.w++;
  }
  const rows = (o, lbl) => Object.entries(o).sort((a, b) => b[1][0] - a[1][0])
    .map(([k, [n, w]]) => `<div class="rrow"><span>${lbl(k)}</span>${pctBar(w, n)}</div>`).join("");
  const mine = !S.bets.length ? `<p class="src">Tu n'as encore rien enregistré : touche « Je l'ai joué » sous un ticket ou dans ton combiné.</p>`
    : `<div class="kpis k4">
        <div class="kpi"><div class="v">${euro(staked)}</div><div class="l">Misé (paris terminés)</div></div>
        <div class="kpi"><div class="v ${profit >= 0 ? "pos" : "neg"}">${profit >= 0 ? "+" : "−"}${euro(Math.abs(profit))}</div><div class="l">Bilan</div></div>
        <div class="kpi"><div class="v">${staked ? `${profit >= 0 ? "+" : ""}${Math.round((profit / staked) * 100)} %` : "–"}</div><div class="l">Rendement</div></div>
        <div class="kpi"><div class="v">${won}/${done.length}</div><div class="l">Paris gagnés</div></div>
      </div>
      ${all.length > done.length ? `<p class="src">${all.length - done.length} pari${all.length - done.length > 1 ? "s" : ""} en cours, pas encore compté${all.length - done.length > 1 ? "s" : ""}.</p>` : ""}
      ${Object.keys(byComp).length ? `<h3 class="day">Tes sélections par compétition</h3>${rows(byComp, (c) => `${flagOf(c)} ${esc((S.data && S.data.competitions[c] || { name: c }).name)}`)}` : ""}
      ${Object.keys(byType).length ? `<h3 class="day">Tes sélections par type de pari</h3>${rows(byType, esc)}` : ""}
      ${Object.keys(bySrc).length ? `<h3 class="day">Par ticket</h3>${Object.entries(bySrc).map(([k, o]) => {
        const p = o.back - o.st;
        return `<div class="rrow"><span>${esc(srcName(k))}</span><b class="${p >= 0 ? "pos" : "neg"}">${p >= 0 ? "+" : "−"}${euro(Math.abs(p))}</b><small>${o.w}/${o.n} gagnés</small></div>`;
      }).join("")}` : ""}`;
  return `${appRatesHTML(true)}
    <h3 class="day">Ton bilan</h3>${mine}
    <div class="io"><button class="btn" id="bets-export">Copier mes paris</button><button class="btn" id="bets-import">Coller des paris</button></div>
    <p class="src">Tes paris sont gardés sur cet appareil. Pour les retrouver sur ton ordi ou ton téléphone : « Copier mes paris » ici, puis « Coller des paris » sur l'autre appareil.</p>
    ${disclaimer()}`;
}

function exportBets() {
  const code = "PRONOS1:" + btoa(unescape(encodeURIComponent(JSON.stringify(S.bets))));
  const done = () => toast("Code copié : colle-le sur l'autre appareil");
  if (navigator.clipboard) navigator.clipboard.writeText(code).then(done).catch(() => window.prompt("Copie ce code :", code));
  else window.prompt("Copie ce code :", code);
}
function importBets() {
  const code = (window.prompt("Colle ici le code copié sur l'autre appareil :") || "").trim();
  if (!code) return;
  try {
    const list = JSON.parse(decodeURIComponent(escape(atob(code.replace(/^PRONOS1:/, "")))));
    if (!Array.isArray(list)) throw new Error();
    const have = new Set(S.bets.map((b) => b.id));
    const add = list.filter((b) => b && b.id && Array.isArray(b.legs) && b.stake > 0 && b.odds > 1 && !have.has(b.id));
    S.bets = S.bets.concat(add).sort((a, b) => (a.at < b.at ? 1 : -1));
    saveBets(); renderMP(); renderTickets(); toast(`${add.length} pari${add.length > 1 ? "s" : ""} ajouté${add.length > 1 ? "s" : ""}`);
  } catch { toast("Code illisible"); }
}

// ------------------------------------------------------------------ où l'app vise juste
const MK = [["fav", "Favori"], ["dc", "Double chance"], ["sure", "Favori ≥ 60 %"], ["o25", "± 2,5 buts"], ["btts", "Les 2 marquent"]];
const MK_LONG = { fav: "le favori de l'app (1N2)", dc: "la double chance", sure: "le favori quand l'app le donne à 60 % ou plus",
  o25: "plus/moins de 2,5 buts", btts: "« les 2 équipes marquent » oui/non" };
function appRates() {
  const P = S.perf; if (!P || !S.data) return [];
  const live = (P.live && P.live.markets) || {}, bt = (P.backtest && P.backtest.markets) || {};
  const rows = [];
  for (const [c, info] of Object.entries(S.data.competitions)) {
    const lv = (live.by_comp || {})[c] || {}, bv = (bt.by_comp || {})[c] || {};
    const useLive = (lv.fav && lv.fav.n >= 60) || !(bv.fav && bv.fav.n);
    const src = useLive ? lv : bv;
    if (src.fav && src.fav.n >= 10) rows.push({ c, info, src, live: useLive });
  }
  return rows;
}
function appRatesHTML(compact) {
  const rows = appRates();
  const head = `<h3 class="day">Où l'app vise juste</h3>`;
  if (!rows.length) return head + '<p class="src">Pas encore assez de matchs vérifiés pour comparer les compétitions.</p>';
  const cell = (v) => {
    if (!v || v.n < 10) return '<td class="na">–</td>';
    const h = v.hit >= 0.75 ? 3 : v.hit >= 0.62 ? 2 : v.hit >= 0.52 ? 1 : 0;
    return `<td class="heat h${h}"><b>${Math.round(v.hit * 100)}</b><small>${v.n}</small></td>`;
  };
  // le meilleur endroit pour chaque type de pari, puis les 3 plus hauts (sinon la double chance prendrait toute la place)
  const best = MK.map(([k]) => rows.map((r) => ({ r, k, v: r.src[k] })).filter((x) => x.v && x.v.n >= 25)
    .sort((a, b) => b.v.hit - a.v.hit)[0]).filter(Boolean).sort((a, b) => b.v.hit - a.v.hit).slice(0, 3);
  const P = S.perf, since = P.live && P.live.markets && P.live.markets.since;
  return `${head}
    <p class="src" style="margin-bottom:8px">% de fois où le choix de l'app est passé, par compétition et par type de pari (petit chiffre = nombre de matchs).</p>
    ${best.length ? `<div class="best">${best.map((x, i) => `<div><span class="bn">${i + 1}</span><span>${cap(MK_LONG[x.k])} en ${x.r.info.flag} ${esc(x.r.info.name)}</span>
      <b>${Math.round(x.v.hit * 100)} %</b><small>annoncé ${Math.round(x.v.said * 100)} % · ${x.v.n} matchs</small></div>`).join("")}</div>` : ""}
    <div class="rt-wrap"><table class="rt"><tr><th></th>${MK.map(([, l]) => `<th>${l}</th>`).join("")}</tr>
      ${rows.map((r) => `<tr><td>${r.info.flag} ${esc(r.info.name)}${r.live ? "" : '<sup>*</sup>'}</td>${MK.map(([k]) => cell(r.src[k])).join("")}</tr>`).join("")}
    </table></div>
    <p class="src" style="margin-top:6px">* test sur les 12 dernières semaines (modèle seul, sans les cotes). Sans astérisque : pronos réels de l'app${since ? ` suivis depuis le ${new Date(since).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""}.</p>
    <p class="note">${compact ? "" : "⚠ "}Un % élevé ne veut pas dire rentable : la double chance passe souvent mais paie peu (souvent 1,20 à 1,50). Ce qui compte, c'est que la cote paie plus que la chance réelle.</p>`;
}

// ------------------------------------------------------------------ fiabilité
function calChart(cal) {
  if (!cal || cal.length < 2) return '<p class="src">Pas encore assez de matchs pour la courbe.</p>';
  const W = 330, H = 220, P = 40, x = (v) => P + v * (W - P - 10), y = (v) => H - P - v * (H - P - 10);
  const pts = cal.map((c) => `<circle cx="${x(c.pred)}" cy="${y(c.real)}" r="${Math.min(3 + Math.sqrt(c.n) / 2, 9)}" fill="#ffd60a" fill-opacity=".8"/>`).join("");
  const line = cal.map((c, i) => `${i ? "L" : "M"}${x(c.pred)},${y(c.real)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => `<text x="${x(t)}" y="${H - 10}" fill="#5f6a88" font-size="10" text-anchor="middle">${t * 100}%</text><text x="${P - 6}" y="${y(t) + 3}" fill="#5f6a88" font-size="10" text-anchor="end">${t * 100}%</text>`).join("");
  return `<svg class="cal" viewBox="0 0 ${W} ${H}"><line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="#263052" stroke-dasharray="4 4"/>
    <path d="${line}" fill="none" stroke="#ffd60a" stroke-opacity=".5"/>${pts}${ticks}</svg>
    <p class="src" style="margin-top:6px">Axe horizontal : proba annoncée. Vertical : fréquence réelle. Plus les points collent à la diagonale, plus les % sont fiables.</p>`;
}

function kpis(m, ref) {
  if (!m) return '<p class="src">Pas encore de matchs vérifiés.</p>';
  return `<div class="metric-row">
    <div class="kpi"><div class="v">${Math.round(m.accuracy * 100)} %</div><div class="l">Bon résultat 1N2</div></div>
    <div class="kpi"><div class="v">${m.logloss}</div><div class="l">Log loss${ref ? ` (réf. ${ref.logloss})` : ""}</div></div>
    <div class="kpi"><div class="v">${m.n}</div><div class="l">Matchs</div></div></div>`;
}

function renderPerf() {
  const P = S.perf, live = P.live, bt = P.backtest, meta = S.meta;
  const res = (live.recent || []).map((r) => {
    const [hg, ag] = r.result, o = hg > ag ? 0 : hg === ag ? 1 : 2, pk = r.p.indexOf(Math.max(...r.p));
    return `<div class="res"><span>${esc(r.home)} ${hg}-${ag} ${esc(r.away)}</span><span class="${pk === o ? "ok" : "ko"}">${["1", "N", "2"][pk]} ${pct(r.p[pk])} ${pk === o ? "✓" : "✗"}</span></div>`;
  }).join("");
  const src = meta ? meta.sources : {};
  const ok = (b) => (b ? "✅" : "⛔");
  $("#perf").innerHTML = `
    ${appRatesHTML(false)}
    <h3 class="day">En conditions réelles</h3>
    <p class="src" style="margin-bottom:8px">Pronos figés avant le coup d'envoi, puis comparés au score final.</p>
    ${kpis(live.all, live.market_only)}
    ${live.market_only ? `<p class="src" style="margin-top:8px">Les bookmakers seuls font ${Math.round(live.market_only.accuracy * 100)} % (log loss ${live.market_only.logloss}). Plus la log loss est basse, mieux c'est.</p>` : ""}
    ${live.over25_hit != null ? `<p class="src" style="margin-top:4px">Plus/moins de 2,5 buts : ${Math.round(live.over25_hit * 100)} % de bons choix.</p>` : ""}
    ${live.all ? calChart(live.all.calibration) : ""}

    <h3 class="day">Test sur les 12 dernières semaines</h3>
    <p class="src" style="margin-bottom:8px">Le modèle est recalculé semaine par semaine avec seulement les infos de l'époque, puis on regarde ce qu'il aurait dit.</p>
    ${kpis(bt && bt.all, bt && bt.baseline)}
    ${bt && bt.baseline ? `<p class="src" style="margin-top:8px">Référence = prono naïf qui donne toujours les fréquences moyennes (${Math.round(bt.baseline.accuracy * 100)} % de réussite). Le modèle doit faire mieux pour valoir quelque chose.</p>` : ""}
    ${bt && bt.all ? calChart(bt.all.calibration) : ""}

    ${tuningHTML()}

    ${res ? `<h3 class="day">Derniers résultats</h3>${res}` : ""}

    <h3 class="day">Sources de données</h3>
    <ul class="src">
      <li>${ok(src.football_data)} Résultats & calendrier (football-data.org)</li>
      <li>${ok(src.understat || src.shots_xg)} xG ${src.understat ? "(Understat)" : src.shots_xg ? "approchés par les tirs (football-data.co.uk) : Understat bloque les robots" : "indisponibles"}</li>
      <li>${ok(src.clubelo || src.elo_local)} Elo ${src.clubelo ? "(ClubElo)" : src.elo_local ? "calculé par l'app sur les résultats : ClubElo injoignable" : "indisponible"}</li>
      <li>${ok(src.scorers)} Buteurs ${src.scorers === "football-data" ? "(football-data.org)" : src.scorers === "maxifoot" ? "(Maxifoot, 1 fois par jour)" : "indisponibles"}</li>
      <li>${ok(src.odds)} Cotes FR (The Odds API)${src.odds_credits_left != null ? ` · ${src.odds_credits_left} crédits restants ce mois` : ""}</li>
      <li>${ok(src.absences)} Absences (API-Football)</li>
    </ul>
    ${meta && meta.warnings.length ? `<details style="margin-top:10px"><summary class="src">Journal technique (${meta.warnings.length})</summary><ul class="src">${meta.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""}
    ${disclaimer()}`;
}

function tuningHTML() {
  const w = (S.perf && S.perf.weights) || W(), bt = S.perf && S.perf.backtest;
  const half = Math.round(Math.log(2) / w.xi);
  const grid = bt && bt.grid && bt.grid.length ? `<table style="margin-top:8px"><tr><th>xG</th><th>Mémoire</th><th>Elo</th><th>Log loss</th><th>1N2</th></tr>
    ${bt.grid.slice(0, 5).map((g) => `<tr><td>${Math.round(g.xg * 100)} %</td><td>${Math.round(Math.log(2) / g.xi)} j</td><td>${Math.round(g.elo * 100)} %</td><td>${g.logloss}</td><td>${pct(g.accuracy)}</td></tr>`).join("")}</table>` : "";
  return `<h3 class="day">Réglages automatiques</h3>
    <p class="src">Chaque semaine, l'app teste plusieurs réglages sur les 12 dernières semaines et garde le meilleur, seulement s'il fait nettement mieux.</p>
    <ul class="src" style="margin-top:6px">
      <li>Part des xG : <b>${Math.round(w.xg * 100)} %</b> (le reste = vrais buts)</li>
      <li>Mémoire du modèle : un match compte moitié moins après <b>${half} jours</b></li>
      <li>Part de l'Elo : <b>${Math.round(w.elo * 100)} %</b></li>
      <li>Part du marché dans la proba finale : <b>${Math.round(w.market * 100)} %</b>${w.market_tuned ? " (appris sur tes pronos vérifiés)" : " (réglage de départ, ajusté dès 150 matchs vérifiés)"}</li>
    </ul>${grid}`;
}

function staleBanner() {
  const m = S.meta;
  if (!m || !m.stale_since) return "";
  return `<p class="note stale">⚠ La source des matchs ne répond plus depuis ${relTime(m.stale_since)} : tu vois les pronos du dernier calcul réussi (${relTime(S.data.generated)}).</p>`;
}

function disclaimer() {
  return `<p class="disclaimer">Probabilités, pas certitudes : aucun gain n'est garanti. Joue avec ce que tu peux te permettre de perdre.<br><a href="https://www.joueurs-info-service.fr" target="_blank" rel="noopener">joueurs-info-service.fr</a> · 09 74 75 13 13</p>`;
}

init();
