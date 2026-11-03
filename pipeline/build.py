"""Pipeline complet : collecte -> auto-réglage -> modèle -> pronostics -> tickets -> suivi -> JSON pour l'app.

Lancé automatiquement par GitHub Actions. Écrit dans site/data/.
"""
import json
import math
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

import config as C
import sources as S
import tickets as T
from build_utils import dt
from model import DixonColes, devig, elo_rates, local_elo, markets_from_matrix, score_matrix, shots_coefs
from names import Matcher, norm

NOW = datetime.fromisoformat(os.environ["PRONOS_NOW"]) if os.getenv("PRONOS_NOW") else datetime.now(timezone.utc)
DATA = Path(__file__).resolve().parent.parent / "site" / "data"
DATA.mkdir(parents=True, exist_ok=True)


def load(name, default):
    p = DATA / name
    if p.exists():
        try:
            return json.loads(p.read_text())
        except ValueError:
            pass
    return default


def save(name, obj):
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))


S_COEF = {}   # taux de conversion des tirs par championnat


def mkey(comp, date, home, away):
    return f"{comp}:{date[:10]}:{norm(home)}:{norm(away)}"


def r3(x):
    return None if x is None else round(float(x), 3)


def book_name(title):
    return re.sub(r"\s*\((FR|EU)\)\s*$", "", title or "").strip()


def metrics(rows, key="p"):
    rows = [r for r in rows if r.get(key) and r.get("result")]
    if not rows:
        return None
    acc = ll = br = 0.0
    bins = [[0, 0.0, 0] for _ in range(10)]
    for r in rows:
        hg, ag = r["result"]
        o = 0 if hg > ag else 1 if hg == ag else 2
        p = [max(min(x, 0.999), 0.001) for x in r[key]]
        acc += int(np.argmax(p) == o)
        ll -= math.log(p[o])
        br += sum((p[i] - (i == o)) ** 2 for i in range(3))
        for i in range(3):
            b = min(int(p[i] * 10), 9)
            bins[b][0] += 1; bins[b][1] += p[i]; bins[b][2] += int(i == o)
    n = len(rows)
    return {"n": n, "accuracy": round(acc / n, 3), "logloss": round(ll / n, 4), "brier": round(br / n, 3),
            "calibration": [{"pred": round(b[1] / b[0], 3), "real": round(b[2] / b[0], 3), "n": b[0]}
                            for b in bins if b[0] >= 5]}


def blend_elo(lam, mu, elo_h, elo_a, w, neutral=False):
    if not w or elo_h is None or elo_a is None:
        return lam, mu
    el, em = elo_rates(elo_h, elo_a, lam + mu, C.ELO_HOME_ADV, neutral)
    return (math.exp((1 - w) * math.log(lam) + w * math.log(el)),
            math.exp((1 - w) * math.log(mu) + w * math.log(em)))


# ======================================================================== 1. collecte
state = load("state.json", {})
history = load("history.json", {})
tuned = state.setdefault("tuned", {})
fd = S.FootballData(C.FD_KEY)
odds_api = S.Odds(C.ODDS_KEY)
season = S.season_start(NOW)

fd_matches = {}      # comp -> liste
understat = {}       # comp -> {"dates": [...], "players": [...]}
for code, comp in C.COMPETITIONS.items():
    if not comp["fd"]:
        continue
    rows = fd.matches(comp["fd"], season) + fd.matches(comp["fd"], season - 1)
    fd_matches[code] = rows
    # Understat : si le site a refusé au dernier passage, on ne réessaie qu'une fois par jour
    skip_us = state.get("understat_retry_after") and NOW < dt(state["understat_retry_after"])
    if comp["us"] and not skip_us:
        cur = S.understat_league(comp["us"], season)
        prev = S.understat_league(comp["us"], season - 1) if cur else {}
        understat[code] = {"dates": cur.get("dates", []) + prev.get("dates", []),
                           "players": cur.get("players", [])}
if not skip_us:
    if any(u["dates"] for u in understat.values()):
        state.pop("understat_retry_after", None)
    else:
        state["understat_retry_after"] = (NOW + timedelta(hours=20)).isoformat()

# calendrier des coupes absentes de football-data (EL, ECL) via l'API cotes (gratuit)
cup_events = {}
for code, comp in C.COMPETITIONS.items():
    if comp["fd"] is None and C.ODDS_KEY:
        cup_events[code] = odds_api.events(comp["odds"])

# ======================================================================== 2. historique des équipes
team_games = defaultdict(list)   # nom FD -> matchs joués (toutes compétitions FD)
crests, shorts = {}, {}
for code in fd_matches:   # matchs de phase finale dont les équipes ne sont pas encore connues
    fd_matches[code] = [m for m in fd_matches[code] if m["home"] and m["away"]]
for code, rows in fd_matches.items():
    for m in rows:
        crests[m["home"]], crests[m["away"]] = m["home_crest"], m["away_crest"]
        shorts[m["home"]], shorts[m["away"]] = m["home_short"], m["away_short"]
        if m["status"] == "FINISHED" and m["hg"] is not None:
            for team, opp, gf, ga, venue in ((m["home"], m["away"], m["hg"], m["ag"], "D"),
                                             (m["away"], m["home"], m["ag"], m["hg"], "E")):
                team_games[team].append({"date": m["date"], "opp": shorts.get(opp, opp), "gf": gf,
                                         "ga": ga, "venue": venue, "comp": code})
for g in team_games.values():
    g.sort(key=lambda x: x["date"])
fd_team_match = Matcher(team_games.keys() | crests.keys())

all_fd = [(dt(m["date"]), code, m["home"], m["away"], m["hg"], m["ag"], (m.get("stage") or "") == "FINAL")
          for code, rows in fd_matches.items() for m in rows if m["status"] == "FINISHED" and m["hg"] is not None]
elo = S.clubelo_ratings(NOW)
elo_source = "clubelo" if elo else None
if not elo and all_fd:
    elo = {t: {"elo": v} for t, v in local_elo(all_fd)[0].items()}
    elo_source = "local"
elo_match = Matcher(elo.keys())

# ======================================================================== 3. xG Understat rattachés
xg_by_match = {}           # (comp, jour, nom FD dom, nom FD ext) -> (xg dom, xg ext)
team_xg = defaultdict(list)
player_share = defaultdict(dict)   # nom FD -> {joueur normalisé: part de la production offensive}
for code, us in understat.items():
    titles = {d["h"]["title"] for d in us["dates"]} | {d["a"]["title"] for d in us["dates"]}
    fd_names = {m["home"] for m in fd_matches.get(code, [])} | {m["away"] for m in fd_matches.get(code, [])}
    mt = Matcher(fd_names)
    to_fd = {t: mt.find(t, 0.78) for t in titles}
    miss = [t for t, v in to_fd.items() if v is None]
    if miss:
        S.log(f"xG non rattachés ({code}) : {', '.join(sorted(miss)[:6])}")
    for d in us["dates"]:
        if not d.get("isResult"):
            continue
        h, a = to_fd.get(d["h"]["title"]), to_fd.get(d["a"]["title"])
        if not h or not a:
            continue
        try:
            xh, xa = float(d["xG"]["h"]), float(d["xG"]["a"])
        except (TypeError, ValueError, KeyError):
            continue
        day = d["datetime"][:10]
        xg_by_match[(code, day, h, a)] = (xh, xa)
        team_xg[h].append((day, xh, xa))
        team_xg[a].append((day, xa, xh))
    tot = defaultdict(float)
    for p in us.get("players", []):
        team = to_fd.get((p.get("team_title") or "").split(",")[-1].strip())
        if team:
            v = float(p.get("xG") or 0) + float(p.get("xA") or 0)
            player_share[team][norm(p.get("player_name", ""))] = v
            tot[team] += v
    for team, ps in player_share.items():
        if tot.get(team):
            for k in ps:
                ps[k] = ps[k] / tot[team]
xg_source = {}
for code in understat:
    if any(k[0] == code for k in xg_by_match):
        xg_source[code] = "understat"
for code, comp in C.COMPETITIONS.items():
    if not comp["domestic"] or code in xg_source or code not in S.FDUK:
        continue
    rows = S.fduk_season(code, season) + S.fduk_season(code, season - 1)
    if not rows:
        continue
    a_sot, b_off = S_COEF[code] = shots_coefs(rows)
    fd_names = {m["home"] for m in fd_matches.get(code, [])} | {m["away"] for m in fd_matches.get(code, [])}
    mt = Matcher(fd_names)
    miss = set()
    for r in rows:
        h, a = mt.find(r["home"], 0.78), mt.find(r["away"], 0.78)
        if not h or not a:
            miss.update(x for x, y in ((r["home"], h), (r["away"], a)) if not y)
            continue
        xh = a_sot * r["hst"] + b_off * max(r["hs"] - r["hst"], 0)
        xa = a_sot * r["ast"] + b_off * max(r["as"] - r["ast"], 0)
        xg_by_match[(code, r["date"], h, a)] = (round(xh, 2), round(xa, 2))
        team_xg[h].append((r["date"], xh, xa))
        team_xg[a].append((r["date"], xa, xh))
    if miss:
        S.log(f"Tirs non rattachés ({code}) : {', '.join(sorted(miss)[:6])}")
    xg_source[code] = "tirs"
for v in team_xg.values():
    v.sort()


def xg_lookup(code, m):
    for dd in (0, -1, 1):
        d2 = (dt(m["date"]) + timedelta(days=dd)).strftime("%Y-%m-%d")
        hit = xg_by_match.get((code, d2, m["home"], m["away"]))
        if hit:
            return hit
    return None


# tables des matchs joués, préparées une fois (servent à l'ajustement et au test glissant)
league_table = {}
for code, rows in fd_matches.items():
    if not C.COMPETITIONS[code]["domestic"]:
        continue
    league_table[code] = [{"d": dt(m["date"]), "home": m["home"], "away": m["away"], "hg": m["hg"],
                           "ag": m["ag"], "x": xg_lookup(code, m)}
                          for m in rows if m["status"] == "FINISHED" and m["hg"] is not None]


def fit_league(code, cutoff=None, xg_w=None, xi=None):
    xg_w = tuned.get("xg_weight", C.XG_WEIGHT) if xg_w is None else xg_w
    xi = tuned.get("xi", C.TIME_DECAY_XI) if xi is None else xi
    ref = cutoff or NOW
    H, A, YH, YA, W, GH, GA = [], [], [], [], [], [], []
    for m in league_table.get(code, []):
        if m["d"] >= ref:
            continue
        yh, ya = float(m["hg"]), float(m["ag"])
        if m["x"]:
            yh = xg_w * m["x"][0] + (1 - xg_w) * yh
            ya = xg_w * m["x"][1] + (1 - xg_w) * ya
        H.append(m["home"]); A.append(m["away"]); YH.append(yh); YA.append(ya)
        W.append(math.exp(-xi * (ref - m["d"]).days)); GH.append(m["hg"]); GA.append(m["ag"])
    if len(H) < 60:
        return None
    return DixonColes().fit(H, A, YH, YA, W, GH, GA)


# ======================================================================== 4. calendrier à venir
horizon = NOW + timedelta(days=C.HORIZON_DAYS)
upcoming = []
for code, rows in fd_matches.items():
    for m in rows:
        if m["status"] in ("SCHEDULED", "TIMED") and NOW - timedelta(hours=2) <= dt(m["date"]) <= horizon:
            upcoming.append({"comp": code, "date": m["date"], "home": m["home"], "away": m["away"],
                             "home_name": m["home_short"], "away_name": m["away_short"],
                             "home_crest": m["home_crest"], "away_crest": m["away_crest"],
                             "stage": m.get("stage"), "fd_id": m["fd_id"]})
for code, evs in cup_events.items():
    for e in evs:
        if e.get("home_team") and e.get("away_team") and NOW - timedelta(hours=2) <= dt(e["commence_time"]) <= horizon:
            h = fd_team_match.find(e["home_team"], 0.82) or e["home_team"]
            a = fd_team_match.find(e["away_team"], 0.82) or e["away_team"]
            upcoming.append({"comp": code, "date": e["commence_time"], "home": h, "away": a,
                             "home_name": shorts.get(h, e["home_team"]), "away_name": shorts.get(a, e["away_team"]),
                             "home_crest": crests.get(h, ""), "away_crest": crests.get(a, ""),
                             "stage": None, "odds_id": e["id"]})
upcoming.sort(key=lambda x: x["date"])

# ======================================================================== 5. cotes (politique économe en crédits)
odds_cache = state.get("odds_cache", {})
last_by = state.get("odds_last_by_comp", {})
if C.ODDS_KEY:
    for code, comp in C.COMPETITIONS.items():
        ups = [u for u in upcoming if u["comp"] == code and dt(u["date"]) > NOW]
        if not ups:
            continue
        hot = any(dt(u["date"]) <= NOW + timedelta(hours=C.ODDS_HOT_H) for u in ups)
        age = (NOW - dt(last_by[code])).total_seconds() / 3600 if code in last_by else 1e9
        if not ((hot and age >= C.ODDS_HOT_REFRESH_H) or age >= C.ODDS_WARM_REFRESH_H):
            continue
        rem = odds_api.remaining
        if rem is not None and rem < C.ODDS_STOP_CREDITS:
            S.log("Quota de cotes presque épuisé : relevés suspendus jusqu'au renouvellement")
            break
        low = rem is not None and rem < C.ODDS_LOW_CREDITS
        if low and not hot:
            continue
        evs = odds_api.odds(comp["odds"], C.HORIZON_DAYS * 24, markets="h2h,totals" if (hot and not low) else "h2h")
        last_by[code] = NOW.isoformat()
        for e in evs:
            ed = dt(e["commence_time"])
            target = next((u for u in ups if u.get("odds_id") == e["id"]), None)
            if not target:
                for u in ups:
                    if abs((dt(u["date"]) - ed).total_seconds()) < 36 * 3600 and \
                            Matcher([u["home"], u["home_name"]]).find(e["home_team"], 0.75) and \
                            Matcher([u["away"], u["away_name"]]).find(e["away_team"], 0.75):
                        target = u
                        break
            if not target:
                continue
            books, totals = [], []
            for b in e.get("bookmakers", []):
                name = book_name(b.get("title"))
                for mk in b.get("markets", []):
                    oc = {o["name"]: o for o in mk.get("outcomes", [])}
                    if mk["key"] == "h2h" and "Draw" in oc:
                        ph = oc.get(e["home_team"], {}).get("price")
                        pa = oc.get(e["away_team"], {}).get("price")
                        if ph and pa:
                            books.append({"book": name, "h": ph, "d": oc["Draw"]["price"], "a": pa})
                    if mk["key"] == "totals":
                        ov = [o for o in mk["outcomes"] if o.get("point") == 2.5]
                        if len(ov) == 2:
                            o = {x["name"]: x["price"] for x in ov}
                            totals.append({"book": name, "over": o.get("Over"), "under": o.get("Under")})
            if books:
                k = mkey(target["comp"], target["date"], target["home"], target["away"])
                if not totals and k in odds_cache:   # relevé sans +/- 2,5 : on garde les anciens
                    totals = odds_cache[k].get("totals", [])
                odds_cache[k] = {"at": NOW.isoformat(), "h2h": books, "totals": totals}
    # résultats des coupes hors football-data (2 crédits par compétition, seulement si utile)
    last_sc = state.setdefault("scores_last_by_comp", {})
    for code, comp in C.COMPETITIONS.items():
        if comp["fd"] is not None:
            continue
        need = any(h["comp"] == code and not h.get("result") and
                   NOW - timedelta(days=3) < dt(h["date"]) < NOW - timedelta(hours=2) for h in history.values())
        age = (NOW - dt(last_sc[code])).total_seconds() / 3600 if code in last_sc else 1e9
        rem = odds_api.remaining
        if need and age >= 18 and (rem is None or rem >= C.ODDS_STOP_CREDITS):
            last_sc[code] = NOW.isoformat()
            for sc in odds_api.scores(comp["odds"], 3):
                if sc.get("completed") and sc.get("scores"):
                    sm = {s["name"]: int(s["score"]) for s in sc["scores"]}
                    state.setdefault("cup_results", {})[sc["id"]] = [sm.get(sc["home_team"]), sm.get(sc["away_team"])]
state["odds_last_by_comp"] = last_by
state["odds_cache"] = {k: v for k, v in odds_cache.items() if (NOW - dt(v["at"])).days < 6}
if odds_api.remaining is not None:
    state["odds_remaining"] = odds_api.remaining
state["cup_results"] = dict(list(state.get("cup_results", {}).items())[-600:])

# ======================================================================== 6. résultats des pronos passés
fd_results = {m["fd_id"]: (m["hg"], m["ag"]) for rows in fd_matches.values() for m in rows
              if m["status"] == "FINISHED" and m["hg"] is not None}
for h in history.values():
    if h.get("result"):
        continue
    res = fd_results.get(h.get("fd_id")) or tuple(state.get("cup_results", {}).get(h.get("odds_id") or "", []) or ()) or None
    if res and None not in res:
        h["result"] = list(res)
history = {k: v for k, v in history.items() if (NOW - dt(v["date"])).days < 400}

# ======================================================================== 7. auto-réglage
# 7a. test glissant hebdo : xG, mémoire du modèle et poids de l'Elo choisis sur 12 semaines réelles
bt = state.get("backtest")
if bt and bt.get("v") != 3:   # nouvelles sources (Elo maison, xG par les tirs) : on repart des réglages de départ
    for k in ("xg_weight", "xi", "elo_weight", "at"):
        tuned.pop(k, None)
if league_table and (not bt or bt.get("v") != 3 or (NOW - dt(bt["at"])).days >= 6):
    starts = [NOW - timedelta(days=7 * w) for w in range(12, 0, -1)]
    elo_hist = {}
    if elo_source == "clubelo":
        for st in starts:
            r = S.clubelo_ratings(st, quiet=True)
            elo_hist[st] = (r, Matcher(r.keys())) if r else None
    elif all_fd:
        snaps = local_elo(all_fd, starts)[1]
        for st in starts:
            r = {t: {"elo": v} for t, v in snaps[st].items()}
            elo_hist[st] = (r, Matcher(r.keys())) if r else None
    xg_grid = C.TUNE_XG if xg_by_match else [0.0]
    rows_by = defaultdict(list)
    for xg_w in xg_grid:
        for xi in C.TUNE_XI:
            for code, table in league_table.items():
                for st in starts:
                    week = [m for m in table if st <= m["d"] < st + timedelta(days=7)]
                    if not week:
                        continue
                    mdl = fit_league(code, cutoff=st, xg_w=xg_w, xi=xi)
                    if not mdl:
                        continue
                    eh = elo_hist.get(st)
                    for m in week:
                        if not (mdl.known(m["home"]) and mdl.known(m["away"])):
                            continue
                        l, u_ = mdl.rates(m["home"], m["away"])
                        eh_h = eh_a = None
                        if eh:
                            kh, ka = eh[1].find(m["home"], 0.8), eh[1].find(m["away"], 0.8)
                            if kh and ka:
                                eh_h, eh_a = eh[0][kh]["elo"], eh[0][ka]["elo"]
                        er = elo_rates(eh_h, eh_a, l + u_, C.ELO_HOME_ADV) if eh_h is not None else None
                        for ew in C.TUNE_ELO:
                            if er and ew:
                                lam = math.exp((1 - ew) * math.log(l) + ew * math.log(er[0]))
                                mu = math.exp((1 - ew) * math.log(u_) + ew * math.log(er[1]))
                            else:
                                lam, mu = l, u_
                            pr = markets_from_matrix(score_matrix(lam, mu, mdl.rho))
                            rows_by[(xg_w, xi, ew)].append({"comp": code, "p": [pr["home"], pr["draw"], pr["away"]],
                                                            "result": [m["hg"], m["ag"]]})
    scores = {k: metrics(v) for k, v in rows_by.items()}
    scores = {k: v for k, v in scores.items() if v}
    if scores:
        best_k = min(scores, key=lambda k: scores[k]["logloss"])
        current = (tuned.get("xg_weight", C.XG_WEIGHT), tuned.get("xi", C.TIME_DECAY_XI),
                   tuned.get("elo_weight", C.ELO_WEIGHT_DOMESTIC))
        cur_ll = scores[current]["logloss"] if current in scores else 9.0
        # on ne change de réglage que pour un gain net (évite de suivre le bruit d'une semaine à l'autre)
        if scores[best_k]["n"] >= C.TUNE_MIN_MATCHES and scores[best_k]["logloss"] < cur_ll - 0.002:
            tuned["xg_weight"], tuned["xi"], tuned["elo_weight"] = best_k
            tuned["at"] = NOW.isoformat()
    chosen = (tuned.get("xg_weight", C.XG_WEIGHT), tuned.get("xi", C.TIME_DECAY_XI),
              tuned.get("elo_weight", C.ELO_WEIGHT_DOMESTIC))
    rows_c = rows_by.get(chosen) or (rows_by[min(scores, key=lambda k: scores[k]["logloss"])] if scores else [])
    base = None
    if rows_c:   # référence naïve : toujours les fréquences moyennes 1/N/2
        freq = np.bincount([0 if r["result"][0] > r["result"][1] else 1 if r["result"][0] == r["result"][1] else 2
                            for r in rows_c], minlength=3) / len(rows_c)
        base = metrics([{"p": list(freq), "result": r["result"]} for r in rows_c])
    bt = {"v": 3, "at": NOW.isoformat(), "weeks": 12, "elo_source": elo_source, "xg_source": xg_source, "all": metrics(rows_c), "baseline": base,
          "by_comp": {c: metrics([r for r in rows_c if r["comp"] == c]) for c in league_table},
          "grid": sorted([{"xg": k[0], "xi": k[1], "elo": k[2], "logloss": v["logloss"],
                           "accuracy": v["accuracy"], "n": v["n"]} for k, v in scores.items()],
                         key=lambda g: g["logloss"])[:8]}
    state["backtest"] = bt

# 7b. poids du marché, appris sur nos propres pronos vérifiés
with_mkt = [h for h in history.values() if h.get("result") and h.get("pk") and h.get("pm")]
if len(with_mkt) >= C.TUNE_MIN_MATCHES:
    def ll_for(w):
        return metrics([{"p": [w * a + (1 - w) * b for a, b in zip(h["pk"], h["pm"])], "result": h["result"]}
                        for h in with_mkt])["logloss"]
    best_w = min(C.TUNE_MARKET, key=ll_for)
    if ll_for(best_w) < ll_for(tuned.get("market_weight", C.MARKET_WEIGHT)) - 0.002:
        tuned["market_weight"] = best_w

XG_W = tuned.get("xg_weight", C.XG_WEIGHT)
XI = tuned.get("xi", C.TIME_DECAY_XI)
ELO_W = tuned.get("elo_weight", C.ELO_WEIGHT_DOMESTIC)
MKT_W = tuned.get("market_weight", C.MARKET_WEIGHT)

# ======================================================================== 8. modèles du jour
models = {}
for code in league_table:
    mdl = fit_league(code)
    if mdl:
        models[code] = mdl
    else:
        S.log(f"Pas assez de matchs pour {code}")
team_model = {}   # nom FD -> modèle de son championnat (pour les coupes)
for code, mdl in models.items():
    for t in {m["home"] for m in fd_matches[code] if m["date"][:4] >= str(season)}:
        team_model[t] = mdl

# ======================================================================== 9. absences (API-Football)
absences = defaultdict(list)    # nom FD -> [{player, reason, doubt, share}]
if C.AF_KEY:
    soon = NOW + timedelta(days=3)
    stop = False
    for code, comp in C.COMPETITIONS.items():
        if stop or not comp["domestic"]:
            continue
        days = sorted({m["date"][:10] for m in fd_matches.get(code, [])
                       if m["status"] in ("SCHEDULED", "TIMED") and NOW <= dt(m["date"]) <= soon})
        for day in days:
            rows = S.af_injuries(C.AF_KEY, comp["af"], season, day)
            if rows is None:
                stop = True
                break
            for it in rows:
                team = fd_team_match.find(it["team"], 0.75)
                if not team:
                    continue
                shares = player_share.get(team, {})
                pn = norm(it["player"])
                share = shares.get(pn)
                if share is None:  # rapprochement par nom de famille
                    last = pn.split()[-1] if pn else ""
                    cands = [v for k, v in shares.items() if last and k.split()[-1:] == [last]]
                    share = cands[0] if len(cands) == 1 else 0.0
                w = 1.0 if "Missing" in it["type"] else 0.5
                if not any(x["player"] == it["player"] for x in absences[team]):
                    absences[team].append({"player": it["player"], "reason": it["reason"],
                                           "doubt": w < 1, "share": round(share * w, 3)})


# ======================================================================== 10. pronostics
def form_of(team, n=5):
    g = team_games.get(team, [])[-n:]
    return [{"r": "V" if x["gf"] > x["ga"] else "N" if x["gf"] == x["ga"] else "D",
             "s": f"{x['gf']}-{x['ga']}", "opp": x["opp"], "v": x["venue"]} for x in g]


def recent_xg(team, n=6):
    g = team_xg.get(team, [])[-n:]
    if len(g) < 3:
        return None
    return {"for": round(sum(x[1] for x in g) / len(g), 2), "against": round(sum(x[2] for x in g) / len(g), 2)}


def rest_days(team, before):
    past = [x for x in team_games.get(team, []) if dt(x["date"]) < before]
    return (before - dt(past[-1]["date"])).days if past else None


def elo_of(name):
    k = elo_match.find(name, 0.80)
    return (elo[k]["elo"], k) if k else (None, None)


def explain(u, p, ctx):
    hn, an = u["home_name"], u["away_name"]
    out = []
    if ctx["elo_h"] and ctx["elo_a"]:
        d = ctx["elo_h"] - ctx["elo_a"]
        if abs(d) >= 80:
            out.append(f"{hn if d > 0 else an} nettement plus fort sur la durée ({abs(round(d))} pts Elo d'écart)")
    for side, name in (("home", hn), ("away", an)):
        f = ctx[f"form_{side}"]
        if len(f) >= 4:
            w = sum(x["r"] == "V" for x in f)
            l = sum(x["r"] == "D" for x in f)
            if w >= 4:
                out.append(f"{name} en série ({w} victoires sur les {len(f)} derniers)")
            elif l >= 3:
                out.append(f"{name} en difficulté ({l} défaites sur les {len(f)} derniers)")
        x = ctx[f"xg_{side}"]
        if x and x["for"] - x["against"] >= 0.8:
            out.append(f"{name} domine ses matchs aux xG ({x['for']} créés pour {x['against']} concédés)")
        elif x and x["against"] - x["for"] >= 0.8:
            out.append(f"{name} subit beaucoup ({x['against']} xG concédés par match)")
        r = ctx[f"rest_{side}"]
        if r is not None and r <= 3:
            out.append(f"{name} n'a eu que {r} jours de repos")
        ab = [a for a in ctx[f"abs_{side}"] if a["share"] >= 0.08]
        if ab:
            out.append(f"{name} privé de {', '.join(a['player'] for a in ab[:2])} (gros apport offensif)")
    mk = ctx.get("market")
    if mk:
        gap = p["model"]["home"] - mk["home"]
        if abs(gap) >= 0.08:
            out.append(f"Le modèle {'croit plus' if gap > 0 else 'croit moins'} en {hn} que les bookmakers "
                       f"({round(p['model']['home'] * 100)} % contre {round(mk['home'] * 100)} %) : "
                       f"vérifie les compos, le marché sait souvent quelque chose")
    tot = p["lam"] + p["mu"]
    if tot >= 3.2:
        out.append(f"Match qui s'annonce ouvert ({tot:.1f} buts attendus)")
    elif tot <= 2.2:
        out.append(f"Match qui s'annonce fermé ({tot:.1f} buts attendus)")
    return out[:5] or ["Pas de signal marquant : match proche des moyennes"]


cards = []
for u in upcoming:
    code = u["comp"]
    comp = C.COMPETITIONS[code]
    when = dt(u["date"])
    neutral = (u.get("stage") or "") == "FINAL"
    elo_h, _ = elo_of(u["home"])
    elo_a, _ = elo_of(u["away"])
    quality = []

    if comp["domestic"] and code in models and models[code].known(u["home"]) and models[code].known(u["away"]):
        mdl = models[code]
        lam, mu = mdl.rates(u["home"], u["away"], neutral)
        rho = mdl.rho
        if elo_h and elo_a:
            lam, mu = blend_elo(lam, mu, elo_h, elo_a, ELO_W, neutral)
        else:
            quality.append("Elo manquant")
    else:
        mh, ma = team_model.get(u["home"]), team_model.get(u["away"])
        env = (mh.goal_env(u["home"]) if mh else 1.0) * (ma.goal_env(u["away"]) if ma else 1.0)
        total = 2.65 * math.sqrt(env)
        rho = -0.05
        if elo_h and elo_a:
            lam, mu = elo_rates(elo_h, elo_a, total, C.ELO_HOME_ADV, neutral)
        else:
            lam, mu = total / 2 + 0.15, total / 2 - 0.15
            quality.append("Elo manquant : prono très incertain")
        if not (mh and ma):
            quality.append("Une équipe hors top 5 : moins de données")

    # fatigue
    rh, ra = rest_days(u["home"], when), rest_days(u["away"], when)
    if rh is not None and rh <= 3:
        lam *= 0.96; mu *= 1.03
    if ra is not None and ra <= 3:
        mu *= 0.96; lam *= 1.03
    # absences offensives
    abs_h, abs_a = absences.get(u["home"], []), absences.get(u["away"], [])
    lam *= 1 - min(0.18, 0.7 * sum(a["share"] for a in abs_h))
    mu *= 1 - min(0.18, 0.7 * sum(a["share"] for a in abs_a))

    model_p = markets_from_matrix(score_matrix(lam, mu, rho))

    # marché
    key = mkey(code, u["date"], u["home"], u["away"])
    oc = odds_cache.get(key)
    market, best, books_out, totals_out = None, None, [], []
    if oc:
        probs, margins = [], []
        for b in oc["h2h"]:
            dv = devig([b["h"], b["d"], b["a"]])
            if dv:
                probs.append(dv[0]); margins.append(dv[1])
                books_out.append({"book": b["book"], "h": b["h"], "d": b["d"], "a": b["a"],
                                  "margin": round(dv[1] * 100, 1)})
        if probs:
            avg = np.mean(probs, axis=0)
            market = {"home": float(avg[0]), "draw": float(avg[1]), "away": float(avg[2]),
                      "margin": round(float(np.mean(margins)) * 100, 1), "at": oc["at"]}
            best = {}
            for side in ("h", "d", "a"):
                b = max((x for x in books_out if x.get(side)), key=lambda x: x[side])
                best[side] = {"odd": b[side], "book": b["book"]}
            totals_out = [t for t in oc.get("totals", []) if t.get("over") and t.get("under")]
            ov = [devig([t["over"], t["under"]]) for t in totals_out]
            ov = [x[0][0] for x in ov if x]
            if ov:
                market["over_2.5"] = float(np.mean(ov))

    final = dict(model_p)
    if market:
        for k in ("home", "draw", "away"):
            final[k] = MKT_W * market[k] + (1 - MKT_W) * model_p[k]
        if "over_2.5" in market:
            final["over_2.5"] = MKT_W * market["over_2.5"] + (1 - MKT_W) * model_p["over_2.5"]
    else:
        quality.append("Pas de cotes : modèle seul")

    top = max(("home", "draw", "away"), key=lambda k: final[k])
    conf_score = final[top] - 0.05 * len([q for q in quality if "incertain" in q or "hors" in q])
    confidence = 3 if conf_score >= 0.58 else 2 if conf_score >= 0.45 else 1

    ctx = {"elo_h": elo_h, "elo_a": elo_a, "form_home": form_of(u["home"]), "form_away": form_of(u["away"]),
           "xg_home": recent_xg(u["home"]), "xg_away": recent_xg(u["away"]),
           "rest_home": rh, "rest_away": ra, "abs_home": abs_h, "abs_away": abs_a, "market": market}

    value = None
    if best:
        evs = {s: final[k] * best[s]["odd"] - 1 for s, k in (("h", "home"), ("d", "draw"), ("a", "away"))}
        s = max(evs, key=evs.get)
        if evs[s] > 0.03:
            value = {"side": s, "ev": round(evs[s] * 100, 1), "odd": best[s]["odd"], "book": best[s]["book"]}

    cards.append({
        "key": key, "comp": code, "date": u["date"],
        "home": {"name": u["home_name"], "crest": u["home_crest"], "elo": elo_h and round(elo_h),
                 "form": ctx["form_home"], "xg": ctx["xg_home"], "rest": rh, "absences": abs_h},
        "away": {"name": u["away_name"], "crest": u["away_crest"], "elo": elo_a and round(elo_a),
                 "form": ctx["form_away"], "xg": ctx["xg_away"], "rest": ra, "absences": abs_a},
        "xg": [round(lam, 2), round(mu, 2)],
        "model": {k: r3(v) for k, v in model_p.items() if k != "top_scores"},
        "market": market and {k: (r3(v) if isinstance(v, float) else v) for k, v in market.items()},
        "final": {k: r3(v) for k, v in final.items() if k != "top_scores"},
        "scores": model_p["top_scores"], "best_odds": best, "books": books_out, "totals_books": totals_out,
        "value": value, "pick": top, "confidence": confidence, "quality": quality,
        "why": explain(u, {"model": model_p, "lam": lam, "mu": mu}, ctx),
    })

    # snapshot pour le suivi (on écrase jusqu'au coup d'envoi)
    if when > NOW:
        history[key] = {"comp": code, "date": u["date"], "home": u["home_name"], "away": u["away_name"],
                        "fd_id": u.get("fd_id"), "odds_id": u.get("odds_id"),
                        "p": [r3(final["home"]), r3(final["draw"]), r3(final["away"])],
                        "pm": [r3(model_p["home"]), r3(model_p["draw"]), r3(model_p["away"])],
                        "pk": market and [r3(market["home"]), r3(market["draw"]), r3(market["away"])],
                        "o25": r3(final["over_2.5"]), "btts": r3(final["btts"]),
                        "result": history.get(key, {}).get("result")}

# ======================================================================== 11. tickets
tk = T.build_all(cards, NOW)
track_book = tk["books"][0] if tk["books"] else None
results = {k: v["result"] for k, v in history.items() if v.get("result")}
tk_hist = load("tickets_history.json", [])
pending, tk_hist = T.track(state.get("tickets_pending", {}), tk_hist,
                           tk["by_book"].get(track_book, {}) if track_book else {}, NOW, results)
for t in pending.values():
    t["book"] = track_book
state["tickets_pending"] = pending
for t in tk_hist:
    t.setdefault("book", track_book)
tk["track_book"] = track_book
tk["generated"] = NOW.isoformat()
tk["tracking"] = T.stats(tk_hist)

# ======================================================================== 12. fiabilité
settled = [h for h in history.values() if h.get("result")]
live = {"all": metrics(settled), "model_only": metrics(settled, "pm"),
        "market_only": metrics([h for h in settled if h.get("pk")], "pk"),
        "by_comp": {c: metrics([h for h in settled if h["comp"] == c]) for c in C.COMPETITIONS},
        "recent": sorted([{"date": h["date"], "comp": h["comp"], "home": h["home"], "away": h["away"],
                           "p": h["p"], "result": h["result"]} for h in settled],
                         key=lambda x: x["date"], reverse=True)[:40]}
o25 = [int((h["result"][0] + h["result"][1] > 2.5) == (h["o25"] >= 0.5)) for h in settled if h.get("o25") is not None]
live["over25_hit"] = round(float(np.mean(o25)), 3) if o25 else None

weights = {"market": MKT_W, "xg": XG_W, "xi": XI, "elo": ELO_W, "tuned_at": tuned.get("at"),
           "market_tuned": "market_weight" in tuned}

# ======================================================================== 13. écriture
save("matches.json", {"generated": NOW.isoformat(), "matches": cards, "weights": weights,
                      "xg_source": "tirs" if "tirs" in xg_source.values() else ("understat" if xg_source else None),
                      "competitions": {k: {"name": v["name"], "flag": v["flag"]} for k, v in C.COMPETITIONS.items()}})
save("tickets.json", tk)
save("performance.json", {"generated": NOW.isoformat(), "live": live, "backtest": bt, "weights": weights})
save("meta.json", {"generated": NOW.isoformat(), "warnings": S.LOG[-30:],
                   "sources": {"football_data": bool(C.FD_KEY) and any(fd_matches.values()),
                               "understat": "understat" in xg_source.values(), "shots_xg": "tirs" in xg_source.values(),
                               "clubelo": elo_source == "clubelo", "elo_local": elo_source == "local",
                               "odds": bool(odds_cache),
                               "absences": any(absences.values()),
                               "odds_last": max(last_by.values()) if last_by else None,
                               "odds_credits_left": state.get("odds_remaining")},
                   "model": {"leagues_fitted": list(models), "xg_matches": len(xg_by_match), "xg_source": xg_source,
                             "shots_coefs": {k: [round(a, 3), round(b, 3)] for k, (a, b) in S_COEF.items()},
                             "rho": {k: round(m.rho, 3) for k, m in models.items()},
                             "home_adv": {k: round(math.exp(m.home_adv), 3) for k, m in models.items()}}})
save("history.json", history)
save("tickets_history.json", tk_hist)
save("state.json", state)
print(f"OK : {len(cards)} matchs, {len(settled)} pronos vérifiés, {len(tk_hist)} tickets suivis, "
      f"{len(S.LOG)} avertissements")
