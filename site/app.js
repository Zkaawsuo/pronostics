"use strict";
const $ = (s, el = document) => el.querySelector(s);
const pct = (x) => (x == null ? "–" : Math.round(x * 100) + " %");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const S = { data: null, perf: null, meta: null, tickets: null, comp: store.get("comp", "ALL"), day: "all", conf: 0,
  combo: store.get("combo", []), book: store.get("book", null), stake: store.get("stake", "5") };
const fmtWhen = (iso) => { const d = new Date(iso); return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); };
const n2 = (x) => Number(x).toFixed(2).replace(".", ",");
const dec = (x) => String(x).replace(".", ",");
const euro = (x) => x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 1800); }

async function getJSON(path) {
  const r = await fetch(path + "?t=" + Date.now());
  if (!r.ok) throw new Error(path);
  return r.json();
}

async function init() {
  bindUI();
  $("#match-list").innerHTML = '<div class="skeleton"></div>'.repeat(4);
  try {
    [S.data, S.perf, S.meta, S.tickets] = await Promise.all([getJSON("data/matches.json"), getJSON("data/performance.json"),
      getJSON("data/meta.json").catch(() => null), getJSON("data/tickets.json").catch(() => null)]);
  } catch {
    $("#match-list").innerHTML = '<p class="empty">Pas encore de données. Le premier calcul automatique arrive dans quelques minutes.</p>';
    $("#updated").textContent = "En attente";
    return;
  }
  $("#updated").textContent = "Mis à jour " + relTime(S.data.generated);
  renderChips(); renderMatches(); renderTickets(); renderCombo(); renderPerf();
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
}

// ------------------------------------------------------------------ liste
function renderChips() {
  const comps = S.data.competitions;
  const present = new Set(S.data.matches.map((m) => m.comp));
  const items = [["ALL", "Tout"]].concat(Object.entries(comps).filter(([k]) => present.has(k)).map(([k, v]) => [k, `${v.flag} ${v.name}`]));
  if (S.comp !== "ALL" && !present.has(S.comp)) S.comp = "ALL";
  $("#comp-chips").innerHTML = items.map(([k, l]) => `<button class="chip ${S.comp === k ? "on" : ""}" data-k="${k}">${esc(l)}</button>`).join("");
  $("#comp-chips").onclick = (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    S.comp = b.dataset.k; store.set("comp", S.comp); renderChips(); renderMatches();
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
  $("#match-list").innerHTML = html + disclaimer();
  $("#match-list").onclick = (e) => { const c = e.target.closest(".card"); if (c) openSheet(c.dataset.key); };
}

function bar(p, pick) {
  const seg = (k, cls) => `<div class="${cls} ${pick === k ? "pick" : ""}" style="flex:${Math.max(p[k], 0.06)}">${Math.round(p[k] * 100)}</div>`;
  return `<div class="bar">${seg("home", "h")}${seg("draw", "d")}${seg("away", "a")}</div>`;
}

function cardHTML(m) {
  const c = S.data.competitions[m.comp], f = m.final;
  const time = new Date(m.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const confTxt = ["", "Incertain", "Moyen", "Fort"][m.confidence];
  const gap = m.market && Math.abs(m.model.home - m.market.home) >= 0.08;
  return `<article class="card" data-key="${esc(m.key)}">
    <div class="meta"><span>${c.flag} ${esc(c.name)}</span><span>${time}</span></div>
    <div class="teams">
      <div class="team">${crest(m.home.crest, m.home.name)}<span>${esc(m.home.name)}</span></div>
      <div class="score-guess">${esc(m.scores[0].score)}</div>
      <div class="team r">${crest(m.away.crest, m.away.name)}<span>${esc(m.away.name)}</span></div>
    </div>
    ${bar(f, m.pick)}
    <div class="bar-legend"><span>1</span><span>N</span><span>2</span></div>
    <div class="tags">
      <span class="tag conf${m.confidence}">● ${confTxt}</span>
      <span class="tag">+2,5 <b>${pct(f["over_2.5"])}</b></span>
      <span class="tag">BTTS <b>${pct(f.btts)}</b></span>
      ${m.best_odds ? `<span class="tag">Cote ${m.pick === "home" ? "1" : m.pick === "draw" ? "N" : "2"} <b>${n2(m.best_odds[m.pick[0]].odd)}</b></span>` : ""}
      ${gap ? '<span class="tag gap">Écart modèle / marché</span>' : ""}
    </div>
  </article>`;
}

// ------------------------------------------------------------------ fiche
function openSheet(key) {
  const m = S.data.matches.find((x) => x.key === key); if (!m) return;
  const c = S.data.competitions[m.comp], f = m.final, mo = m.model, mk = m.market;
  const d = new Date(m.date);
  const row = (lbl, k) => `<tr><td>${lbl}</td><td>${pct(mo[k])}</td><td>${mk ? pct(mk[k]) : "–"}</td><td class="hl">${pct(f[k])}</td></tr>`;
  const form = (t) => t.form.length ? `<div class="form">${t.form.map((x) => `<span class="fb ${x.r}" title="${esc(x.opp)}">${x.s}</span>`).join("")}</div>` : '<span class="src">–</span>';
  const xg = (t) => t.xg ? `${t.xg.for} créés · ${t.xg.against} concédés` : "–";
  const abs = (t) => t.absences.length ? t.absences.map((a) => `${esc(a.player)}${a.doubt ? " (incertain)" : ""}`).join(", ") : "Aucune signalée";
  const inC = (sel) => S.combo.some((x) => x.id === m.key + "|" + sel) ? "in" : "";
  const addBtn = (sel, lbl, p) => `<button class="add ${inC(sel)}" data-sel="${sel}">${lbl}<b>${pct(p)}</b></button>`;

  $("#sheet").innerHTML = `<div class="grab"></div><button class="close" aria-label="Fermer">×</button>
    <div class="meta"><span>${c.flag} ${esc(c.name)}</span><span>${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} · ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span></div>
    <div class="big-teams">
      <div>${crest(m.home.crest, m.home.name)}<div class="n">${esc(m.home.name)}</div><div class="elo">${m.home.elo ? "Elo " + m.home.elo : ""}</div></div>
      <div class="xgline">${dec(m.xg[0])} – ${dec(m.xg[1])}<small>buts attendus</small></div>
      <div>${crest(m.away.crest, m.away.name)}<div class="n">${esc(m.away.name)}</div><div class="elo">${m.away.elo ? "Elo " + m.away.elo : ""}</div></div>
    </div>
    ${bar(f, m.pick)}

    <h3>L'analyse</h3>
    <ul class="why">${m.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
    ${m.quality.map((q) => `<p class="note">⚠ ${esc(q)}</p>`).join("")}

    <h3>Probabilités</h3>
    <table><tr><th></th><th>Modèle</th><th>Marché</th><th>Finale</th></tr>
      ${row(esc(m.home.name), "home")}${row("Nul", "draw")}${row(esc(m.away.name), "away")}${row("+2,5 buts", "over_2.5")}
      <tr><td>Les 2 marquent</td><td>${pct(mo.btts)}</td><td>–</td><td class="hl">${pct(f.btts)}</td></tr>
      <tr><td>+1,5 / +3,5 buts</td><td>${pct(mo["over_1.5"])} / ${pct(mo["over_3.5"])}</td><td>–</td><td></td></tr>
    </table>
    <p class="src" style="margin-top:6px">Finale = ${mk ? `${Math.round(W().market * 100)} % marché + ${100 - Math.round(W().market * 100)} % modèle` : "modèle seul (pas de cotes)"}. Scores les plus probables : ${m.scores.map((s) => `${s.score} (${pct(s.p)})`).join(", ")}</p>

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
    const b = e.target.closest(".add"); if (!b) return;
    toggleCombo(m, b.dataset.sel); b.classList.toggle("in");
  };
  $("#sheet").classList.add("on"); $("#sheet-bg").classList.add("on"); $("#sheet").scrollTop = 0;
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
    S.book = c.dataset.b; store.set("book", S.book); renderTickets();
  };
  const res = T.by_book[S.book] || {};
  $("#tickets").innerHTML = Object.entries(T.formulas).map(([fid, fm]) => ticketHTML(fid, fm, res[fid])).join("") +
    `<p class="src tnote">Rendement moyen = ce que le ticket rapporte en moyenne par euro misé, d'après les probas de l'app. Négatif = la marge du bookmaker l'emporte : c'est le cas le plus fréquent. Les cotes marquées ≈ (double chance) sont estimées : vérifie-les chez ${esc(S.book)}.</p>`;
  $("#tickets").onclick = (e) => {
    const b = e.target.closest(".copy"); if (!b) return;
    copyTicket(b.dataset.f);
  };
  $("#tickets-track").innerHTML = trackHTML();
}

function ticketHTML(fid, fm, t) {
  const head = (odds) => `<header><span class="tname">${fm.emoji} ${esc(fm.name)}</span>${odds ? `<span class="todds">${n2(odds)}</span>` : ""}</header><p class="tpitch">${esc(fm.pitch)}</p>`;
  if (!t) return `<article class="ticket t-${fid}">${head()}<p class="src">Pas de combinaison crédible dans cette fourchette de cote avec les matchs à venir chez ${esc(S.book)}.</p></article>`;
  const now = Date.now();
  const started = t.legs.some((l) => new Date(l.date) <= now);
  const stake = parseFloat(String(S.stake).replace(",", ".")) || 0;
  const flag = (c) => (S.data && S.data.competitions[c] ? S.data.competitions[c].flag : "");
  const legs = t.legs.map((l) => `<li class="${new Date(l.date) <= now ? "past" : ""}">
      <div><span class="lsel">${esc(l.label)}</span><small>${flag(l.comp)} ${esc(l.match)} · ${fmtWhen(l.date)}</small></div>
      <div class="lright"><b>${l.est ? "≈" : ""}${n2(l.odd)}</b><small>${pct(l.p)}</small></div></li>`).join("");
  const ev = Math.round(t.ev * 100);
  return `<article class="ticket t-${fid}">${head(t.odds)}
    <div class="tstats">
      <div><b>${pct(t.p)}</b><small>de chances</small></div>
      <div><b>1 sur ${Math.max(1, Math.round(1 / t.p))}</b><small>passe environ</small></div>
      <div><b class="${ev >= 0 ? "pos" : "neg"}">${ev >= 0 ? "+" : ""}${ev} %</b><small>rendement moyen</small></div>
    </div>
    <ul class="legs">${legs}</ul>
    ${started ? '<p class="note">⚠ Un match a déjà commencé : ce ticket n\'est plus jouable tel quel. Il sera remplacé au prochain calcul.</p>' : ""}
    ${t.window_h > 48 ? `<p class="src">Pas assez de matchs dans les 48 h : ticket élargi aux ${t.window_h} h.</p>` : ""}
    <div class="tfoot"><span class="src">${stake ? `${euro(stake)} → <b>${euro(stake * t.odds)}</b> si ça passe` : "Indique une mise"}</span>
      <button class="copy" data-f="${fid}">Copier</button></div>
  </article>`;
}

function copyTicket(fid) {
  const T = S.tickets, fm = T.formulas[fid], t = (T.by_book[S.book] || {})[fid];
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

function renderCombo() {
  const live = S.combo.map((s) => ({ ...s, m: S.data && S.data.matches.find((x) => x.key === s.key) })).filter((s) => s.m);
  if (S.data && live.length !== S.combo.length) { S.combo = live.map(({ m, ...s }) => s); store.set("combo", S.combo); }
  const badge = $("#combo-badge"); badge.textContent = live.length; badge.classList.toggle("on", live.length > 0);
  if (!live.length) { $("#combo").innerHTML = '<p class="empty">Aucune sélection.<br>Ouvre un match et touche une issue pour l\'ajouter.</p>'; return; }
  const sameMatch = new Set(live.map((s) => s.key)).size < live.length;
  const p = live.reduce((a, s) => a * selProb(s.m, s.sel), 1);
  const fair = 1 / p;
  const saved = store.get("combo_odd", "");
  $("#combo").innerHTML = `
    ${live.map((s) => `<div class="sel"><div>${esc(SEL_LBL[s.sel])}<small>${esc(s.label)}</small></div><div style="display:flex;align-items:center;gap:8px"><span class="pct" style="font-size:20px;font-weight:700">${pct(selProb(s.m, s.sel))}</span><button class="x" data-id="${esc(s.id)}">×</button></div></div>`).join("")}
    <div class="kpis">
      <div class="kpi"><div class="v">${p >= 0.01 ? Math.round(p * 1000) / 10 + " %" : "< 1 %"}</div><div class="l">Chance que tout passe</div></div>
      <div class="kpi"><div class="v">${n2(fair)}</div><div class="l">Cote « juste » (sans marge)</div></div>
    </div>
    <div class="input"><span class="src">Cote proposée</span><input id="odd-in" inputmode="decimal" placeholder="ex : 12,50" value="${esc(saved)}"></div>
    <div id="verdict"></div>
    ${sameMatch ? '<p class="note">⚠ Plusieurs sélections sur le même match : elles sont liées, le calcul les traite comme indépendantes et devient approximatif.</p>' : ""}
    <p class="src" style="margin-top:12px">Ce combiné passe environ 1 fois sur ${Math.max(1, Math.round(fair))}. Chaque sélection ajoutée cumule la marge du bookmaker, c'est pour ça que les gros combinés sont rarement rentables.</p>
    <button class="btn" id="combo-clear">Vider le combiné</button>`;
  const verdict = () => {
    const v = parseFloat(($("#odd-in").value || "").replace(",", "."));
    store.set("combo_odd", $("#odd-in").value);
    if (!v || v <= 1) { $("#verdict").innerHTML = ""; return; }
    const ev = p * v - 1;
    $("#verdict").innerHTML = `<div class="verdict ${ev >= 0 ? "ok" : "bad"}">Espérance : <b>${ev >= 0 ? "+" : ""}${Math.round(ev * 100)} %</b> par euro misé.
      ${ev < 0 ? `En moyenne, tu perds ${Math.abs(Math.round(ev * 100))} centimes par euro sur ce type de pari.` : "La cote paie plus que la chance estimée, mais ça reste une estimation : garde des mises raisonnables."}</div>`;
  };
  $("#odd-in").addEventListener("input", verdict); verdict();
  $("#combo").onclick = (e) => {
    const x = e.target.closest(".x");
    if (x) { S.combo = S.combo.filter((s) => s.id !== x.dataset.id); store.set("combo", S.combo); renderCombo(); }
    if (e.target.id === "combo-clear") { S.combo = []; store.set("combo", []); renderCombo(); }
  };
}

// ------------------------------------------------------------------ fiabilité
function calChart(cal) {
  if (!cal || cal.length < 2) return '<p class="src">Pas encore assez de matchs pour la courbe.</p>';
  const W = 330, H = 220, P = 40, x = (v) => P + v * (W - P - 10), y = (v) => H - P - v * (H - P - 10);
  const pts = cal.map((c) => `<circle cx="${x(c.pred)}" cy="${y(c.real)}" r="${Math.min(3 + Math.sqrt(c.n) / 2, 9)}" fill="#d9ff4a" fill-opacity=".8"/>`).join("");
  const line = cal.map((c, i) => `${i ? "L" : "M"}${x(c.pred)},${y(c.real)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => `<text x="${x(t)}" y="${H - 10}" fill="#5c7468" font-size="10" text-anchor="middle">${t * 100}%</text><text x="${P - 6}" y="${y(t) + 3}" fill="#5c7468" font-size="10" text-anchor="end">${t * 100}%</text>`).join("");
  return `<svg class="cal" viewBox="0 0 ${W} ${H}"><line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="#22382d" stroke-dasharray="4 4"/>
    <path d="${line}" fill="none" stroke="#d9ff4a" stroke-opacity=".5"/>${pts}${ticks}</svg>
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

function disclaimer() {
  return `<p class="disclaimer">Probabilités, pas certitudes : aucun gain n'est garanti. Joue avec ce que tu peux te permettre de perdre.<br><a href="https://www.joueurs-info-service.fr" target="_blank" rel="noopener">joueurs-info-service.fr</a> · 09 74 75 13 13</p>`;
}

init();
