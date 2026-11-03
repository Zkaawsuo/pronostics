"""Les 3 formules de tickets, construites avec les vraies cotes d'un bookmaker.

Principe : pour chaque formule, on fixe une fourchette de cote totale (donc un niveau de risque)
et on cherche, parmi les sélections crédibles, la combinaison qui rapporte le plus en moyenne
(produit des proba x cotes). À cote égale, c'est aussi celle qui passe le plus souvent.

Garde-fous :
- une seule sélection par match (pas de sélections liées entre elles) ;
- chaque sélection doit avoir une proba minimale (pas de "petit miracle" caché dans le ticket) ;
- on écarte les sélections où modèle et marché divergent fortement : c'est souvent qu'il manque
  une info (compo, blessure de dernière minute), pas une bonne affaire.
"""
import math
from datetime import timedelta

import config as C

FORMULAS = {
    "solide": {"name": "Solide", "emoji": "🟢", "band": (1.45, 1.85), "kmin": 1, "kmax": 3, "pmin": 0.52, "pt": 0.50,
               "pitch": "Le plus probable : petite cote, mais c'est celui qui passe le plus souvent."},
    "equilibre": {"name": "Équilibré", "emoji": "🟡", "band": (2.30, 3.40), "kmin": 2, "kmax": 4, "pmin": 0.50, "pt": 0.25,
                  "pitch": "Un vrai gain possible en gardant de bonnes chances."},
    "audacieux": {"name": "Audacieux", "emoji": "🔴", "band": (4.80, 8.50), "kmin": 2, "kmax": 5, "pmin": 0.36, "pt": 0.10,
                  "pitch": "Meilleur rendement, avec uniquement des sélections crédibles."},
}

LABELS = {"home": "{h} gagne", "draw": "Match nul", "away": "{a} gagne", "1N": "{h} ou nul",
          "N2": "Nul ou {a}", "12": "Pas de match nul", "over": "Plus de 2,5 buts", "under": "Moins de 2,5 buts"}


def leg_won(sel, hg, ag):
    return {"home": hg > ag, "draw": hg == ag, "away": hg < ag, "1N": hg >= ag, "N2": hg <= ag,
            "12": hg != ag, "over": hg + ag > 2.5, "under": hg + ag < 2.5}[sel]


def _dc(o1, o2):
    """Cote double chance estimée à partir des cotes 1N2 du même bookmaker (même marge, -2 % par prudence)."""
    return round(0.98 / (1 / o1 + 1 / o2), 2)


def candidates(cards, book, now, window_h):
    out = []
    t_min = now + timedelta(minutes=C.TICKET_MIN_LEAD_MIN)
    t_max = now + timedelta(hours=window_h)
    from build_utils import dt  # import local : évite une dépendance circulaire
    for c in cards:
        when = dt(c["date"])
        if not (t_min <= when <= t_max):
            continue
        if any("incertain" in q for q in c["quality"]):
            continue
        bk = next((b for b in c["books"] if b["book"] == book), None)
        if not bk:
            continue
        f, mo, mk = c["final"], c["model"], c["market"] or {}
        h, d, a = bk["h"], bk["d"], bk["a"]
        opts = [
            ("home", f["home"], mo["home"], mk.get("home"), h, False),
            ("draw", f["draw"], mo["draw"], mk.get("draw"), d, False),
            ("away", f["away"], mo["away"], mk.get("away"), a, False),
            ("1N", f["home"] + f["draw"], mo["home"] + mo["draw"],
             mk.get("home", 0) + mk.get("draw", 0) if mk else None, _dc(h, d), True),
            ("N2", f["draw"] + f["away"], mo["draw"] + mo["away"],
             mk.get("draw", 0) + mk.get("away", 0) if mk else None, _dc(d, a), True),
            ("12", f["home"] + f["away"], mo["home"] + mo["away"],
             mk.get("home", 0) + mk.get("away", 0) if mk else None, _dc(h, a), True),
        ]
        tb = next((t for t in c.get("totals_books", []) if t["book"] == book), None)
        if tb and tb.get("over") and tb.get("under"):
            pko = mk.get("over_2.5")
            opts += [("over", f["over_2.5"], mo["over_2.5"], pko, tb["over"], False),
                     ("under", 1 - f["over_2.5"], 1 - mo["over_2.5"], None if pko is None else 1 - pko,
                      tb["under"], False)]
        for sel, p, pm, pk, odd, est in opts:
            if not odd or odd < 1.04 or p is None:
                continue
            if pk is not None and abs(pm - pk) > C.TICKET_MAX_GAP:
                continue
            out.append({"key": c["key"], "comp": c["comp"], "date": c["date"],
                        "match": f"{c['home']['name']} – {c['away']['name']}",
                        "hc": c["home"].get("crest") or "", "ac": c["away"].get("crest") or "",
                        "sel": sel, "label": LABELS[sel].format(h=c["home"]["name"], a=c["away"]["name"]),
                        "p": round(p, 3), "odd": round(odd, 2), "est": est})
    return out


def search(cands, fm, per_bucket=6, width=0.04):
    """Recherche par paliers de cote : garde les meilleures combinaisons pour chaque niveau de cote."""
    lo, hi = fm["band"]
    L, H = math.log(lo), math.log(hi)
    pool = [c for c in cands if c["p"] >= fm["pmin"] and c["odd"] <= hi and c["p"] * c["odd"] >= C.TICKET_MIN_LEG_RETURN]
    pool.sort(key=lambda c: c["p"] * c["odd"], reverse=True)
    pool = pool[:150]
    lr = [math.log(c["p"] * c["odd"]) for c in pool]
    lo_ = [math.log(c["odd"]) for c in pool]
    lp = [math.log(c["p"]) for c in pool]
    P_MIN, EV_MIN = math.log(fm["pt"]), math.log(1 + C.TICKET_MIN_EV)
    best = None
    frontier = [((), 0.0, 0.0, frozenset(), 0.0)]
    for depth in range(1, fm["kmax"] + 1):
        buckets = {}
        for legs, s_lr, s_lo, used, s_lp in frontier:
            start = legs[-1] + 1 if legs else 0
            for j in range(start, len(pool)):
                if pool[j]["key"] in used:
                    continue
                n_lo = s_lo + lo_[j]
                n_lp = s_lp + lp[j]
                if n_lo > H + 1e-9 or n_lp < P_MIN:   # trop de cote, ou plus assez de chances : inutile d'aller plus loin
                    continue
                n_lr = s_lr + lr[j]
                st = (legs + (j,), n_lr, n_lo, used | {pool[j]["key"]}, n_lp)
                if (depth >= fm["kmin"] and n_lo >= L - 1e-9 and n_lr >= EV_MIN
                        and (best is None or n_lr > best[1])):
                    best = st
                b = buckets.setdefault(int(n_lo / width), [])
                b.append(st)
        frontier = []
        for b in buckets.values():
            b.sort(key=lambda s: s[1], reverse=True)
            frontier += b[:per_bucket]
        if not frontier:
            break
    if not best:
        return None
    legs = sorted((dict(pool[j]) for j in best[0]), key=lambda x: x["date"])
    odds = math.prod(l["odd"] for l in legs)
    p = math.prod(l["p"] for l in legs)
    return {"legs": legs, "odds": round(odds, 2), "p": round(p, 3), "ev": round(p * odds - 1, 3),
            "first": legs[0]["date"]}


def _formulas(cards, book, now, windows):
    res = {}
    for fid, fm in FORMULAS.items():
        t = None
        for win in windows:
            t = search(candidates(cards, book, now, win), fm)
            if t:
                t["window_h"] = win
                break
        res[fid] = t
    return res


def combis_du_jour(cards, now, n=3):
    """Les combis sur un même match les plus probables, cote juste entre 2 et 5,5 (une par match)."""
    from build_utils import dt
    t_min = now + timedelta(minutes=C.TICKET_MIN_LEAD_MIN)
    for win in (C.TICKET_WINDOW_H, C.TICKET_WINDOW_H * 2):
        pool = []
        for c in cards:
            if not (t_min <= dt(c["date"]) <= now + timedelta(hours=win)) or not c.get("market"):
                continue
            for cb in c.get("combos", []):
                if 2.0 <= cb["fair"] <= 5.5:
                    pool.append({**cb, "key": c["key"], "comp": c["comp"], "date": c["date"],
                                 "match": f"{c['home']['name']} – {c['away']['name']}",
                                 "hc": c["home"].get("crest") or "", "ac": c["away"].get("crest") or ""})
                    break   # la meilleure combi du match suffit
        if len(pool) >= n:
            break
    pool.sort(key=lambda x: -x["p"])
    return pool[:n]


def buteurs_du_jour(cards, now, n=5):
    """Les joueurs les plus susceptibles de marquer dans les prochains matchs (un par équipe)."""
    from build_utils import dt
    t_min = now + timedelta(minutes=C.TICKET_MIN_LEAD_MIN)
    for win in (C.TICKET_WINDOW_H, C.TICKET_WINDOW_H * 2):
        pool = []
        for c in cards:
            if not (t_min <= dt(c["date"]) <= now + timedelta(hours=win)) or not c.get("market"):
                continue
            seen = set()
            for s in c.get("scorers", []):
                if s["side"] in seen:
                    continue
                seen.add(s["side"])
                team = c[s["side"]]
                pool.append({**s, "key": c["key"], "comp": c["comp"], "date": c["date"], "team": team["name"],
                             "crest": team.get("crest") or "", "match": f"{c['home']['name']} – {c['away']['name']}"})
        if len(pool) >= n:
            break
    pool.sort(key=lambda x: -x["p"])
    return pool[:n]


def build_all(cards, now):
    books = {}
    for c in cards:
        for b in c["books"]:
            books[b["book"]] = books.get(b["book"], 0) + 1
    order = sorted(books, key=lambda b: (b != C.TRACK_BOOK, -books[b]))
    comps = sorted({c["comp"] for c in cards})
    by_book, by_comp = {}, {}
    for book in order:
        by_book[book] = _formulas(cards, book, now, (C.TICKET_WINDOW_H, C.TICKET_WINDOW_H * 2))
        # tickets spéciaux par compétition : on va chercher jusqu'à la semaine si besoin (ex. LDC le week-end)
        by_comp[book] = {comp: _formulas([c for c in cards if c["comp"] == comp], book, now,
                                         (C.TICKET_WINDOW_H, C.TICKET_WINDOW_H * 2, C.HORIZON_DAYS * 24))
                         for comp in comps}
    return {"books": order, "coverage": books, "by_book": by_book, "by_comp": by_comp, "comps": comps,
            "combis": combis_du_jour(cards, now), "buteurs": buteurs_du_jour(cards, now),
            "formulas": {k: {kk: vv for kk, vv in v.items() if kk != "band"} | {"band": list(v["band"])}
                         for k, v in FORMULAS.items()}}


def track(pending, hist, current, now, results):
    """Gèle chaque ticket au coup d'envoi de son 1er match, puis le règle avec les scores.

    pending : {formule: ticket affiché}, hist : liste des tickets gelés, current : tickets du run,
    results : {clé match: [buts dom, buts ext]}.
    """
    from build_utils import dt
    for fid in FORMULAS:
        cur = pending.get(fid)
        if cur and dt(cur["first"]) <= now:
            hist.append({**cur, "status": "pending"})
        new = current.get(fid)
        if new:
            pending[fid] = {**new, "formula": fid, "created": now.isoformat()}
        else:
            pending.pop(fid, None)
    for t in hist:
        if t["status"] != "pending":
            continue
        states = []
        for l in t["legs"]:
            r = results.get(l["key"])
            if r and None not in r:
                l["result"] = r
                states.append("won" if leg_won(l["sel"], *r) else "lost")
            elif (now - dt(l["date"])).days >= 4:
                states.append("void")   # match reporté : la sélection est annulée
            else:
                states.append("wait")
        if "lost" in states:
            t["status"] = "lost"
        elif "wait" not in states:
            t["status"] = "won"
            t["paid"] = round(math.prod(l["odd"] for l, s in zip(t["legs"], states) if s == "won"), 2)
    del hist[:-400]
    return pending, hist


def stats(hist):
    out = {}
    for fid in FORMULAS:
        done = [t for t in hist if t.get("formula") == fid and t["status"] in ("won", "lost")]
        if not done:
            out[fid] = None
            continue
        won = [t for t in done if t["status"] == "won"]
        out[fid] = {"n": len(done), "won": len(won), "hit": round(len(won) / len(done), 3),
                    "expected": round(sum(t["p"] for t in done) / len(done), 3),
                    "roi": round((sum(t.get("paid", t["odds"]) for t in won) - len(done)) / len(done), 3)}
    recent = sorted(hist, key=lambda t: t["first"], reverse=True)[:15]
    return {"by_formula": out, "recent": recent}
