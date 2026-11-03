"""Réglages centraux du pipeline. Tout ce qui est ajustable est ici."""
import os

# .strip() : une clé collée avec un retour à la ligne fait planter les requêtes
FD_KEY = os.getenv("FD_KEY", "").strip()          # football-data.org
AF_KEY = os.getenv("AF_KEY", "").strip()          # api-football (blessures)
ODDS_KEY = os.getenv("ODDS_KEY", "").strip()      # the-odds-api.com (cotes)

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

# Valeurs de départ. Les trois premières sont ré-ajustées automatiquement chaque semaine
# (test glissant) ou dès qu'il y a assez de matchs vérifiés (poids du marché).
XG_WEIGHT = 0.55            # part des xG dans la cible (le reste = vrais buts)
TIME_DECAY_XI = 0.0030      # décroissance temporelle Dixon-Coles (demi-vie ~230 jours)
ELO_WEIGHT_DOMESTIC = 0.30  # part de l'Elo dans les buts attendus en championnat
MARKET_WEIGHT = 0.60        # part du marché dans la proba finale quand les cotes existent
ELO_HOME_ADV = 60           # avantage domicile en points Elo

TUNE_XG = [0.0, 0.35, 0.55, 0.75]   # 0 = buts réels seuls : les xG doivent prouver leur utilité
TUNE_XI = [0.0020, 0.0030, 0.0045]
TUNE_ELO = [0.0, 0.15, 0.30, 0.45]
TUNE_MARKET = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
TUNE_MIN_MATCHES = 150      # en dessous, on garde les valeurs de départ

# Cotes : un relevé couvre toute la semaine pour le même coût. On rafraîchit plus souvent
# quand un match approche, et on lève le pied si le quota mensuel baisse.
ODDS_HOT_H = 30             # un match dans les 30 h = compétition "chaude"
ODDS_HOT_REFRESH_H = 11     # compétition chaude : relevé toutes les 11 h au plus
ODDS_WARM_REFRESH_H = 70    # sinon : tous les ~3 jours
ODDS_LOW_CREDITS = 40       # sous ce seuil : seulement les matchs proches, sans les +/- 2,5
ODDS_STOP_CREDITS = 10      # sous ce seuil : plus aucun relevé

# Tickets
TICKET_WINDOW_H = 48        # matchs des 48 prochaines heures (96 h si pas assez)
TICKET_MIN_LEAD_MIN = 25    # pas de match qui commence dans moins de 25 min
TICKET_MAX_GAP = 0.12       # on écarte une sélection si modèle et marché divergent de plus de 12 pts
TRACK_BOOK = "Betclic"      # bookmaker dont on suit les tickets (repli : le mieux couvert)
