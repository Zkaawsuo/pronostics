"""Rapprochement des noms d'équipes entre sources (football-data, Understat, ClubElo, cotes...)."""
import re
import unicodedata
from difflib import SequenceMatcher

STOP = {"fc", "cf", "afc", "ac", "as", "sc", "ssc", "us", "ss", "club", "calcio", "bc", "rc", "ogc",
        "vfl", "vfb", "tsg", "sv", "fsv", "1", "cd", "ud", "sd", "rcd", "ca", "de", "del", "la", "le", "sfp", "pae",
        "the", "and", "1899", "1846", "1907", "1909", "1910", "1913", "04", "05", "96", "hsc", "losc", "fk"}

# formes longues -> forme courte commune
ALIASES = {
    "manchester united": "man united", "manchester utd": "man united", "man utd": "man united",
    "manchester city": "man city",
    "tottenham hotspur": "tottenham", "spurs": "tottenham",
    "wolverhampton wanderers": "wolves", "wolverhampton": "wolves",
    "nottingham forest": "forest", "nottm forest": "forest", "nott m forest": "forest",
    "newcastle united": "newcastle", "west ham united": "west ham", "brighton hove albion": "brighton",
    "leeds united": "leeds", "sheffield united": "sheffield utd", "leicester city": "leicester",
    "ipswich town": "ipswich", "luton town": "luton", "afc bournemouth": "bournemouth",
    "paris saint germain": "paris sg", "paris": "paris sg", "psg": "paris sg",
    "olympique marseille": "marseille", "olympique de marseille": "marseille",
    "olympique lyonnais": "lyon", "olympique lyon": "lyon",
    "stade rennais": "rennes", "stade de reims": "reims", "stade brestois 29": "brest", "brestois": "brest",
    "lille osc": "lille", "osc lille": "lille", "rc lens": "lens", "racing club de lens": "lens",
    "as monaco": "monaco", "ogc nice": "nice", "rc strasbourg alsace": "strasbourg",
    "racing strasbourg": "strasbourg", "toulouse fc": "toulouse", "fc nantes": "nantes",
    "montpellier hsc": "montpellier", "aj auxerre": "auxerre", "angers sco": "angers",
    "le havre ac": "le havre", "havre": "le havre", "fc lorient": "lorient", "paris fc": "paris fc",
    "fc metz": "metz", "saint etienne": "st etienne", "as saint etienne": "st etienne",
    "fc bayern munchen": "bayern", "bayern munchen": "bayern", "bayern munich": "bayern",
    "borussia dortmund": "dortmund", "bayer 04 leverkusen": "leverkusen", "bayer leverkusen": "leverkusen",
    "borussia monchengladbach": "gladbach", "monchengladbach": "gladbach", "m gladbach": "gladbach",
    "rb leipzig": "leipzig", "rasenballsport leipzig": "leipzig",
    "eintracht frankfurt": "frankfurt", "vfb stuttgart": "stuttgart", "sc freiburg": "freiburg",
    "tsg hoffenheim": "hoffenheim", "tsg 1899 hoffenheim": "hoffenheim", "1 fsv mainz 05": "mainz",
    "fsv mainz": "mainz", "mainz 05": "mainz", "vfl wolfsburg": "wolfsburg", "werder bremen": "werder",
    "sv werder bremen": "werder", "fc augsburg": "augsburg", "1 fc union berlin": "union berlin",
    "union berlin": "union berlin", "1 fc heidenheim 1846": "heidenheim", "fc st pauli": "st pauli",
    "fc st pauli 1910": "st pauli", "1 fc koln": "koln", "fc koln": "koln", "cologne": "koln",
    "hamburger sv": "hamburg", "vfl bochum": "bochum", "holstein kiel": "kiel",
    "fc internazionale milano": "inter", "internazionale": "inter", "inter milan": "inter",
    "ac milan": "milan", "juventus fc": "juventus", "ssc napoli": "napoli", "as roma": "roma",
    "ss lazio": "lazio", "atalanta bc": "atalanta", "acf fiorentina": "fiorentina",
    "bologna fc 1909": "bologna", "torino fc": "torino", "udinese calcio": "udinese",
    "genoa cfc": "genoa", "hellas verona": "verona", "parma calcio 1913": "parma",
    "us lecce": "lecce", "cagliari calcio": "cagliari", "como 1907": "como", "us sassuolo": "sassuolo",
    "atletico madrid": "atletico", "club atletico de madrid": "atletico", "atletico de madrid": "atletico",
    "real madrid cf": "real madrid", "fc barcelona": "barcelona", "athletic club": "bilbao",
    "athletic bilbao": "bilbao", "real sociedad de futbol": "sociedad", "real sociedad": "sociedad",
    "real betis balompie": "betis", "real betis": "betis", "sevilla fc": "sevilla",
    "villarreal cf": "villarreal", "valencia cf": "valencia", "rc celta de vigo": "celta",
    "celta vigo": "celta", "ca osasuna": "osasuna", "rayo vallecano de madrid": "rayo",
    "rayo vallecano": "rayo", "getafe cf": "getafe", "girona fc": "girona", "rcd mallorca": "mallorca",
    "deportivo alaves": "alaves", "rcd espanyol de barcelona": "espanyol", "espanyol": "espanyol",
    "ud las palmas": "las palmas", "cd leganes": "leganes", "real valladolid cf": "valladolid",
    "elche cf": "elche", "levante ud": "levante", "real oviedo": "oviedo",
    # noms de clubs à la française (Maxifoot, presse)
    "fc barcelone": "barcelona", "barcelone": "barcelona", "naples": "napoli", "ssc naples": "napoli",
    "as rome": "roma", "rome": "roma", "lazio rome": "lazio", "juventus turin": "juventus", "inter milan": "inter",
    "atalanta bergame": "atalanta", "bologne": "bologna", "genes": "genoa", "parme": "parma", "verone": "verona",
    "pise": "pisa", "come": "como", "turin": "torino", "fribourg": "freiburg", "sc fribourg": "freiburg",
    "francfort": "frankfurt", "eintracht francfort": "frankfurt", "hambourg": "hamburg", "mayence": "mainz",
    "augsbourg": "augsburg", "werder breme": "werder", "breme": "werder", "saint pauli": "st pauli",
    "bayern munich": "bayern", "valence": "valencia", "majorque": "mallorca", "gerone": "girona",
    "seville": "sevilla", "fc seville": "sevilla", "betis seville": "betis", "real betis seville": "betis",
    "espanyol barcelone": "espanyol", "benfica lisbonne": "benfica", "sport lisboa e benfica": "benfica",
    "sporting portugal": "sporting", "sporting lisbonne": "sporting", "fc porto": "porto",
    "ath madrid": "atletico", "ath bilbao": "bilbao", "espanol": "espanyol", "vallecano": "rayo",
    "ein frankfurt": "frankfurt", "la coruna": "coruna", "deportivo coruna": "coruna", "rc deportivo": "coruna", "sp gijon": "sporting gijon",
    "sporting cp": "sporting", "sporting clube de portugal": "sporting", "sporting clube portugal": "sporting",
    "sporting braga": "braga", "sc braga": "braga", "glasgow rangers": "rangers",
    "aek athens": "aek", "aek athens fc": "aek", "aek athenes": "aek", "paok thessaloniki": "paok",
    "union saint gilloise": "union sg", "royale union saint gilloise": "union sg", "union st gilloise": "union sg",
    "red star belgrade": "crvena zvezda", "etoile rouge de belgrade": "crvena zvezda",
    "olympiacos": "olympiakos", "olympiacos piraeus": "olympiakos", "olympiakos piraeus": "olympiakos", "celtic glasgow": "celtic", "sporting lisbon": "sporting", "sl benfica": "benfica",
    "fc porto": "porto", "psv eindhoven": "psv", "afc ajax": "ajax", "feyenoord rotterdam": "feyenoord",
    "club brugge kv": "brugge", "club brugge": "brugge", "celtic fc": "celtic", "rangers fc": "rangers",
    "galatasaray sk": "galatasaray", "fenerbahce sk": "fenerbahce", "red bull salzburg": "salzburg",
    "fc salzburg": "salzburg", "shakhtar donetsk": "shakhtar", "dinamo zagreb": "zagreb",
    "gnk dinamo zagreb": "zagreb", "crvena zvezda": "crvena zvezda", "red star belgrade": "crvena zvezda",
}


def _plain(name: str) -> str:
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def norm(name: str) -> str:
    s = _plain(name)
    if s in ALIASES:
        return ALIASES[s]
    core = " ".join(t for t in s.split() if t not in STOP and not t.isdigit()) or s
    return ALIASES.get(core, core)


# mots trop courants pour identifier une équipe à eux seuls ("Sporting" ne dit pas si c'est Lisbonne ou Braga)
GENERIC = {"sporting", "real", "athletic", "atletico", "union", "inter", "olympique", "dynamo", "dinamo",
           "racing", "sport", "city", "united", "deportivo", "stade", "red", "star", "royal", "young", "boys",
           "paris", "saint", "st", "san", "fk", "nk", "sk", "if", "bk", "aik", "al"}


def _score(a: str, b: str) -> float:
    if a == b:
        return 1.0
    ta, tb = set(a.split()), set(b.split())
    small = ta if len(ta) <= len(tb) else tb
    if ta and tb and (ta <= tb or tb <= ta) and small - GENERIC:
        return 0.92
    # ressemblance d'orthographe (Koeln/Koln, Olympiacos/Olympiakos) : même initiale exigée,
    # sinon "Rangers" ressemble à "Angers"
    if not a or not b or a[0] != b[0]:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


class Matcher:
    """Associe un nom quelconque à une liste de noms cibles (une source)."""

    def __init__(self, targets):
        self.targets = list(dict.fromkeys(targets))
        self.normed = {t: norm(t) for t in self.targets}
        self.cache = {}

    def find(self, name, threshold=0.80):
        if name in self.cache:
            return self.cache[name]
        n = norm(name)
        best, best_s = None, 0.0
        for t, tn in self.normed.items():
            s = _score(n, tn)
            if s > best_s:
                best, best_s = t, s
        res = best if best_s >= threshold else None
        self.cache[name] = res
        return res
