"""Récupération des données. Chaque source est optionnelle : si elle tombe, le reste continue."""
import csv
import io
import json
import re
import time
from datetime import datetime, timedelta, timezone

import requests

import config

UA = {"User-Agent": "pronostics-perso/2.0"}
LOG = []  # avertissements remontés dans l'app (meta.json)


def log(msg):
    print("[!]", msg)
    LOG.append(msg)


def season_start(d=None):
    d = d or datetime.now(timezone.utc)
    return d.year if d.month >= 7 else d.year - 1


def _get(url, **kw):
    kw.setdefault("timeout", 30)
    headers = {**UA, **kw.pop("headers", {})}
    for attempt in range(3):
        try:
            r = requests.get(url, headers=headers, **kw)
            if r.status_code == 429:
                time.sleep(20 * (attempt + 1))
                continue
            return r
        except requests.RequestException as e:
            if attempt == 2:
                log(f"Réseau KO sur {url.split('?')[0]} : {e}")
            time.sleep(5)
    return None


# ---------------------------------------------------------------- football-data.org
class FootballData:
    BASE = "https://api.football-data.org/v4"

    def __init__(self, key):
        self.key = key
        self.last = 0.0

    def matches(self, code, season):
        if not self.key:
            return []
        wait = 6.5 - (time.time() - self.last)  # 10 requêtes/minute max
        if wait > 0:
            time.sleep(wait)
        r = _get(f"{self.BASE}/competitions/{code}/matches", params={"season": season},
                 headers={"X-Auth-Token": self.key})
        self.last = time.time()
        if r is None or r.status_code != 200:
            log(f"football-data {code} {season} : {getattr(r, 'status_code', 'réseau')}")
            return []
        out = []
        for m in r.json().get("matches", []):
            sc = m.get("score") or {}
            ft = sc.get("fullTime") or {}
            # les paris se règlent sur 90 min : on ignore prolongation et tirs au but
            if sc.get("duration") in ("EXTRA_TIME", "PENALTY_SHOOTOUT") and sc.get("regularTime"):
                ft = sc["regularTime"]
            out.append({
                "fd_id": m["id"], "date": m["utcDate"], "status": m["status"],
                "stage": m.get("stage"), "matchday": m.get("matchday"),
                "home": m["homeTeam"].get("name") or "", "away": m["awayTeam"].get("name") or "",
                "home_short": m["homeTeam"].get("shortName") or m["homeTeam"].get("name") or "",
                "away_short": m["awayTeam"].get("shortName") or m["awayTeam"].get("name") or "",
                "home_crest": m["homeTeam"].get("crest") or "", "away_crest": m["awayTeam"].get("crest") or "",
                "hg": ft.get("home"), "ag": ft.get("away"),
            })
        return out


# ---------------------------------------------------------------- ClubElo
def clubelo_ratings(day=None, quiet=False):
    day = (day or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    r = _get(f"http://api.clubelo.com/{day}")
    if r is None or r.status_code != 200 or "Club" not in r.text[:200]:
        if not quiet:
            log("ClubElo indisponible : Elo neutre utilisé")
        return {}
    ratings = {}
    for row in csv.DictReader(io.StringIO(r.text)):
        try:
            ratings[row["Club"]] = {"elo": float(row["Elo"]), "country": row["Country"]}
        except (KeyError, ValueError):
            continue
    return ratings


# ---------------------------------------------------------------- Understat (xG)
def understat_league(league, season):
    """Renvoie {"dates": [...], "players": [...]} ou {}."""
    r = _get(f"https://understat.com/getLeagueData/{league}/{season}",
             headers={"X-Requested-With": "XMLHttpRequest",
                      "Referer": f"https://understat.com/league/{league}/{season}"})
    if r is not None and r.status_code == 200:
        try:
            data = r.json()
            if data.get("dates"):
                return data
        except ValueError:
            pass
    # repli : ancienne page avec JSON intégré
    r = _get(f"https://understat.com/league/{league}/{season}")
    if r is not None and r.status_code == 200:
        out = {}
        for var, key in (("datesData", "dates"), ("playersData", "players")):
            m = re.search(var + r"\s*=\s*JSON\.parse\('(.+?)'\)", r.text)
            if m:
                try:
                    out[key] = json.loads(m.group(1).encode().decode("unicode_escape"))
                except ValueError:
                    pass
        if out.get("dates"):
            return out
    log(f"Understat {league} {season} indisponible : buts réels seuls")
    return {}


# ---------------------------------------------------------------- The Odds API (cotes + calendrier coupes)
class Odds:
    BASE = "https://api.the-odds-api.com/v4/sports"

    def __init__(self, key):
        self.key = key
        self.remaining = None

    def _call(self, path, **params):
        if not self.key:
            return None
        r = _get(f"{self.BASE}/{path}", params={"apiKey": self.key, **params})
        if r is None:
            return None
        rem = r.headers.get("x-requests-remaining")
        if rem is not None:
            try:
                self.remaining = int(float(rem))
            except ValueError:
                pass
        if r.status_code != 200:
            log(f"Cotes {path.split('/')[0]} : HTTP {r.status_code}")
            return None
        return r.json()

    def events(self, sport):  # gratuit, ne consomme pas de crédit
        return self._call(f"{sport}/events") or []

    def odds(self, sport, hours, markets="h2h,totals"):
        """Coût = nb de marchés x nb de régions, quel que soit le nombre de matchs renvoyés."""
        to = (datetime.now(timezone.utc) + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:%M:%SZ")
        return self._call(f"{sport}/odds", regions="fr", markets=markets, oddsFormat="decimal",
                          commenceTimeTo=to) or []

    def scores(self, sport, days=3):  # coûte 2 crédits
        return self._call(f"{sport}/scores", daysFrom=days) or []


# ---------------------------------------------------------------- API-Football (absences)
def af_injuries(key, league_id, season, day):
    if not key:
        return []
    r = _get("https://v3.football.api-sports.io/injuries",
             params={"league": league_id, "season": season, "date": day},
             headers={"x-apisports-key": key})
    if r is None or r.status_code != 200:
        return []
    js = r.json()
    if js.get("errors"):
        errs = js["errors"]
        msg = "; ".join(f"{v}" for v in (errs.values() if isinstance(errs, dict) else errs))
        log(f"Absences indisponibles ({msg[:90]})")
        return None  # None = arrêter d'appeler pour ce run
    out = []
    for it in js.get("response", []):
        p = it.get("player") or {}
        out.append({"team": (it.get("team") or {}).get("name", ""), "player": p.get("name", ""),
                    "type": p.get("type", ""), "reason": p.get("reason", "")})
    return out
