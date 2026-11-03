"""Moteur statistique : Dixon-Coles pondéré dans le temps, buts attendus Elo, matrice de scores."""
import numpy as np
from scipy.optimize import minimize
from scipy.special import gammaln

MAXG = 10
_K = np.arange(MAXG)
_FACT = np.array([float(np.prod(np.arange(1, k + 1))) for k in range(MAXG)])


def _pois(lam):
    """Loi de Poisson sur 0..MAXG-1 (bien plus rapide que scipy.stats pour un petit vecteur)."""
    return np.exp(-lam) * np.power(lam, _K) / _FACT


# ---------------------------------------------------------------- Dixon-Coles
def _tau(hg, ag, lam, mu, rho):
    t = np.ones_like(lam)
    m00 = (hg == 0) & (ag == 0)
    m10 = (hg == 1) & (ag == 0)
    m01 = (hg == 0) & (ag == 1)
    m11 = (hg == 1) & (ag == 1)
    t[m00] = 1 - lam[m00] * mu[m00] * rho
    t[m10] = 1 + mu[m10] * rho
    t[m01] = 1 + lam[m01] * rho
    t[m11] = 1 - rho
    return np.clip(t, 1e-6, None)


class DixonColes:
    """Force offensive/défensive par équipe + avantage domicile, ajustés par maximum de vraisemblance.

    Cible : mélange buts réels / xG (Poisson accepte une cible non entière).
    Les matchs récents pèsent plus (décroissance exponentielle). Petite pénalité L2 pour
    stabiliser les équipes avec peu de matchs (promus).
    """

    def __init__(self, ridge=0.6):
        self.ridge = ridge

    def fit(self, home, away, yh, ya, weights, hg_int=None, ag_int=None):
        teams = sorted(set(home) | set(away))
        self.teams = teams
        idx = {t: i for i, t in enumerate(teams)}
        hi = np.array([idx[t] for t in home])
        ai = np.array([idx[t] for t in away])
        yh, ya, w = np.asarray(yh, float), np.asarray(ya, float), np.asarray(weights, float)
        n = len(teams)
        const = w * (gammaln(yh + 1) + gammaln(ya + 1))

        def unpack(p):
            att = p[:n] - p[:n].mean()
            dfn = p[n:2 * n] - p[n:2 * n].mean()
            return att, dfn, p[2 * n], p[2 * n + 1]

        def nll(p):
            att, dfn, home_adv, base = unpack(p)
            lh = base + home_adv + att[hi] + dfn[ai]
            la = base + att[ai] + dfn[hi]
            el, ea = np.exp(lh), np.exp(la)
            ll = w * (yh * lh - el + ya * la - ea) - const
            pen = self.ridge * (np.sum(att ** 2) + np.sum(dfn ** 2))
            rh, ra = w * (yh - el), w * (ya - ea)
            g_att = np.bincount(hi, rh, n) + np.bincount(ai, ra, n)
            g_def = np.bincount(ai, rh, n) + np.bincount(hi, ra, n)
            g_att = g_att - g_att.mean() - 2 * self.ridge * att
            g_def = g_def - g_def.mean() - 2 * self.ridge * dfn
            grad = np.concatenate([g_att, g_def, [rh.sum(), rh.sum() + ra.sum()]])
            return -(ll.sum() - pen), -grad

        p0 = np.zeros(2 * n + 2)
        p0[2 * n] = 0.25
        p0[2 * n + 1] = np.log(max(np.average(np.concatenate([yh, ya]),
                                              weights=np.concatenate([w, w])), 0.3))
        res = minimize(nll, p0, jac=True, method="L-BFGS-B")
        att, dfn, self.home_adv, self.base = unpack(res.x)
        self.att = dict(zip(teams, att))
        self.dfn = dict(zip(teams, dfn))

        # rho estimé sur les vrais scores entiers
        self.rho = -0.05
        if hg_int is not None:
            hg_i, ag_i = np.asarray(hg_int), np.asarray(ag_int)
            lam = np.exp(self.base + self.home_adv + att[hi] + dfn[ai])
            mu = np.exp(self.base + att[ai] + dfn[hi])
            best = None
            for rho in np.linspace(-0.25, 0.10, 36):
                v = np.sum(w * np.log(_tau(hg_i, ag_i, lam, mu, rho)))
                if best is None or v > best[0]:
                    best = (v, rho)
            self.rho = float(best[1])
        return self

    def rates(self, home, away, neutral=False):
        a_h, d_h = self.att.get(home, 0.0), self.dfn.get(home, 0.0)
        a_a, d_a = self.att.get(away, 0.0), self.dfn.get(away, 0.0)
        ha = 0.0 if neutral else self.home_adv
        return float(np.exp(self.base + ha + a_h + d_a)), float(np.exp(self.base + a_a + d_h))

    def goal_env(self, team):
        """>1 = équipe impliquée dans des matchs à buts, <1 = matchs fermés."""
        return float(np.exp((self.att.get(team, 0.0) + self.dfn.get(team, 0.0)) / 2))

    def known(self, team):
        return team in self.att


# ---------------------------------------------------------------- matrice de scores
def score_matrix(lam, mu, rho=-0.05):
    m = np.outer(_pois(lam), _pois(mu))
    m[0, 0] *= max(1 - lam * mu * rho, 1e-6)
    m[1, 0] *= max(1 + mu * rho, 1e-6)
    m[0, 1] *= max(1 + lam * rho, 1e-6)
    m[1, 1] *= max(1 - rho, 1e-6)
    return m / m.sum()


def markets_from_matrix(m):
    tot = np.add.outer(np.arange(MAXG), np.arange(MAXG))
    p = {
        "home": float(np.tril(m, -1).sum()),
        "draw": float(np.trace(m)),
        "away": float(np.triu(m, 1).sum()),
        "btts": float(m[1:, 1:].sum()),
    }
    for line in (1.5, 2.5, 3.5):
        p[f"over_{line}"] = float(m[tot > line].sum())
    flat = np.argsort(m, axis=None)[::-1][:3]
    p["top_scores"] = [{"score": f"{i // MAXG}-{i % MAXG}", "p": round(float(m.flat[i]), 3)} for i in flat]
    # score le plus probable DANS chaque issue : le 1-1 est souvent le score le plus probable tout court,
    # même quand une équipe est nettement favorite (les victoires se répartissent sur 1-0, 2-0, 2-1...)
    i, j = np.indices(m.shape)
    p["by_outcome"] = {}
    for name, mask in (("home", i > j), ("draw", i == j), ("away", i < j)):
        k = int(np.argmax(np.where(mask, m, -1.0)))
        p["by_outcome"][name] = {"score": f"{k // MAXG}-{k % MAXG}", "p": round(float(m.flat[k]), 3)}
    return p


def combos(m, final):
    """Combinaisons sur un même match (type MyCombi de Betclic).

    La partie « résultat » est calée sur la proba finale (modèle + marché) ; la partie « buts » vient
    de la matrice de scores du modèle, sachant ce résultat. Les deux sont liées : une victoire de
    favori s'accompagne plus souvent de buts, c'est pour ça qu'on ne multiplie pas simplement.
    """
    i, j = np.indices(m.shape)
    tot = i + j
    btts = (i > 0) & (j > 0)
    out = []
    for side, region, nil in (("home", i > j, j == 0), ("away", i < j, i == 0)):
        mass = m[region].sum()
        if mass <= 1e-9:
            continue
        for cond, mask in (("over_1.5", tot > 1.5), ("over_2.5", tot > 2.5), ("btts", btts), ("nil", nil)):
            out.append({"side": side, "cond": cond, "p": float(final[side] * m[region & mask].sum() / mass)})
    out.append({"side": None, "cond": "btts_over_2.5", "p": float(m[btts & (tot > 2.5)].sum())})
    return out


# ---------------------------------------------------------------- Elo -> buts attendus
def _expected_share(lam, mu, rho=-0.05):
    m = score_matrix(lam, mu, rho)
    return float(np.tril(m, -1).sum() + 0.5 * np.trace(m))


def elo_rates(elo_h, elo_a, total=2.7, home_adv=60, neutral=False):
    """Trouve les buts attendus (total fixé) qui reproduisent l'espérance Elo."""
    dr = elo_h - elo_a + (0 if neutral else home_adv)
    target = 1 / (1 + 10 ** (-dr / 400))
    lo, hi = -total + 0.2, total - 0.2
    for _ in range(40):
        s = (lo + hi) / 2
        if _expected_share((total + s) / 2, (total - s) / 2) < target:
            lo = s
        else:
            hi = s
    s = (lo + hi) / 2
    return (total + s) / 2, (total - s) / 2


# ---------------------------------------------------------------- cotes -> probas
def devig(prices):
    """Probas implicites sans la marge du bookmaker (normalisation proportionnelle)."""
    inv = [1 / p for p in prices if p and p > 1]
    if len(inv) != len(prices):
        return None
    s = sum(inv)
    return [x / s for x in inv], s - 1


# ---------------------------------------------------------------- Elo maison (si ClubElo ne répond pas)
LEAGUE_PRIOR = {"PL": 1620, "PD": 1600, "BL1": 1580, "SA": 1580, "FL1": 1540}


def local_elo(matches, snapshots=(), home_adv=60):
    """Elo calculé sur nos propres résultats, toutes compétitions football-data confondues.

    matches : [(date, comp, home, away, hg, ag, neutral)]. Les matchs de Ligue des champions
    relient les championnats entre eux. Renvoie (notes finales, {date de cliché: notes}).
    """
    ms = sorted(matches, key=lambda m: m[0])
    prior = {}
    for _, comp, h, a, *_ in ms:
        if comp in LEAGUE_PRIOR:
            prior.setdefault(h, LEAGUE_PRIOR[comp])
            prior.setdefault(a, LEAGUE_PRIOR[comp])
    r, out = {}, {}
    snaps = sorted(snapshots)
    si = 0
    for d, comp, h, a, hg, ag, neutral in ms:
        while si < len(snaps) and snaps[si] <= d:
            out[snaps[si]] = dict(r)
            si += 1
        rh, ra = r.setdefault(h, prior.get(h, 1500)), r.setdefault(a, prior.get(a, 1500))
        e = 1 / (1 + 10 ** (-(rh - ra + (0 if neutral else home_adv)) / 400))
        s = 1.0 if hg > ag else 0.5 if hg == ag else 0.0
        gd = abs(hg - ag)
        g = 1.0 if gd <= 1 else 1.5 if gd == 2 else (11 + gd) / 8
        k = (30 if comp in ("CL", "EL", "ECL") else 20) * g
        r[h] = rh + k * (s - e)
        r[a] = ra - k * (s - e)
    while si < len(snaps):
        out[snaps[si]] = dict(r)
        si += 1
    return r, out


# ---------------------------------------------------------------- xG approchés par les tirs
def shots_coefs(rows):
    """Taux de conversion appris sur le championnat : buts ~ a x tirs cadrés + b x tirs non cadrés."""
    X, y = [], []
    for r in rows:
        for g, s, st in ((r["hg"], r["hs"], r["hst"]), (r["ag"], r["as"], r["ast"])):
            X.append((st, max(s - st, 0)))
            y.append(g)
    if len(y) < 100:
        return 0.30, 0.03
    coef = np.linalg.lstsq(np.array(X, float), np.array(y, float), rcond=None)[0]
    return float(np.clip(coef[0], 0.15, 0.45)), float(np.clip(coef[1], 0.0, 0.10))


# ---------------------------------------------------------------- buteurs
def scorer_prob(goals, matches, team_ratio, prev_goals=0, prev_matches=0, prior=0.40, k=8, avail=1.0):
    """Chance qu'un joueur marque au moins un but dans le match.

    - rythme du joueur : ses buts par match, saison en cours + moitié de la précédente, tiré vers
      0,40 but/match (k matchs fictifs) pour ne pas s'emballer sur une série de 10 matchs ;
    - ajusté par les buts attendus de son équipe ce jour-là par rapport à sa moyenne ;
    - proba « s'il joue » : chez les bookmakers français, un pari buteur est en général remboursé
      si le joueur ne participe pas (avail permet de baisser si besoin).
    """
    g = goals + 0.5 * prev_goals + prior * k
    m = matches + 0.5 * prev_matches + k
    rate = max(g / max(m, 1), 0.01) * min(max(team_ratio, 0.6), 1.6)
    return avail * (1 - np.exp(-rate))
