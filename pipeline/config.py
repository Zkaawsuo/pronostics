"""Réglages centraux du pipeline. Tout ce qui est ajustable est ici."""
import os

FD_KEY = os.getenv("FD_KEY", "")          # football-data.org
AF_KEY = os.getenv("AF_KEY", "")          # api-football (blessures)
ODDS_KEY = os.getenv("ODDS_KEY", "")      # the-odds-api.com (cotes)

# code interne -> infos par source
COMPETITIONS = {
    "PL":  {"name": "Premier League",  "flag": "🏴󠁧󠁢󠁥󠁮󠁧󠁿", "fd": "PL",  "us": "EPL",        "af": 39,  "odds": "soccer_epl",                          "domestic": True},
    "PD":  {"name": "La Liga",         "flag": "🇪🇸", "fd": "PD",  "us": "La_liga",    "af": 140, "odds": "soccer_spain_la_liga",                "domestic": True},
    "SA":  {"name": "Serie A",         "flag": "🇮🇹", "fd": "SA",  "us": "Serie_A",    "af": 135, "odds": "soccer_italy_serie_a",                "domestic": True},
    "BL1": {"name": "Bundesliga",      "flag": "🇩🇪", "fd": "BL1", "us": "Bundesliga", "af": 78,  "odds": "soccer_germany_bundesliga",           "domestic": True},
    "FL1": {"name": "Ligue 1",         "flag": "🇫🇷", "fd": "FL1", "us": "Ligue_1",    "af": 61,  "odds": "soccer_france_ligue_one",             "domestic": True},
    "CL":  {"name": "Ligue des champions", "flag": "⭐", "fd": "CL", "us": None,       "af": 2,   "odds": "soccer_uefa_champs_league",           "domestic": False},
    "EL":  {"name": "Europa League",   "flag": "🟠", "fd": None,  "us": None,         "af": 3,   "odds": "soccer_uefa_europa_league",           "domestic": False},
    "ECL": {"name": "Conference League", "flag": "🟢", "fd": None, "us": None,        "af": 848, "odds": "soccer_uefa_europa_conference_league", "domestic": False},
}

HORIZON_DAYS = 8            # matchs affichés jusqu'à J+8
TIME_DECAY_XI = 0.0030      # décroissance temporelle Dixon-Coles (demi-vie ~230 jours)
XG_WEIGHT = 0.55            # part des xG dans la cible (le reste = vrais buts)
ELO_WEIGHT_DOMESTIC = 0.30  # part de l'Elo dans les buts attendus en championnat
ELO_HOME_ADV = 60           # avantage domicile en points Elo
MARKET_WEIGHT = 0.60        # part du marché dans la proba finale quand les cotes existent
ODDS_MIN_HOURS = 20         # intervalle mini entre deux relevés de cotes (économise le quota)
ODDS_WINDOW_H = 40          # on ne relève les cotes que pour les matchs dans les 40 h
