"""Maillots dessinés pour les silhouettes de buteurs : couleurs et motif du club, drapeau de la sélection.

Motifs connus tenus à la main (rayures, cerceaux, moitiés...), sinon les couleurs officielles du club
fournies par football-data (clubColors). Aucun trait physique de joueur : juste le maillot.
"""
from names import norm

COLOR = {
    "navy blue": "#1b2a5c", "sky blue": "#6cabdd", "light blue": "#7ec3ef", "royal blue": "#1d4ed8",
    "dark blue": "#13285e", "dark green": "#0d5e2a", "red": "#d71920", "white": "#f4f4f6", "black": "#15151a",
    "navy": "#1b2a5c", "blue": "#1e5bc6", "yellow": "#ffd200", "gold": "#d4a72c", "green": "#148a3c",
    "orange": "#f58220", "purple": "#5b2a86", "violet": "#6d3fa8", "claret": "#7a1d3b", "maroon": "#6b1b2b",
    "bordeaux": "#6b1b2b", "burgundy": "#6b1b2b", "garnet": "#7a1525", "grey": "#8a8f99", "gray": "#8a8f99",
    "silver": "#b9bec7", "amber": "#ffbf00", "pink": "#f285b3", "brown": "#6b3e26", "turquoise": "#19b3b1",
    "cyan": "#22b8d6", "lime": "#a3d13a", "cream": "#efe6cf", "magenta": "#c2185b", "teal": "#0f766e",
}

W, K, R = "#f4f4f6", "#15151a", "#d71920"
# nom normalisé -> (motif, couleurs). Motifs : plain, stripes, hoops, halves, diag, band, sleeves, sash, chest
KITS = {
    "juventus": ("stripes", [K, W]), "inter": ("stripes", ["#1e3fa0", K]), "milan": ("stripes", [R, K]),
    "atalanta": ("stripes", ["#1e3fa0", K]), "udinese": ("stripes", [K, W]), "bologna": ("stripes", ["#a51d2d", "#1b2a5c"]),
    "genoa": ("halves", ["#a51d2d", "#1b2a5c"]), "cagliari": ("halves", ["#a51d2d", "#1b2a5c"]),
    "lecce": ("stripes", ["#ffd200", R]), "sassuolo": ("stripes", ["#148a3c", K]), "napoli": ("plain", ["#12a0d7", W]),
    "roma": ("plain", ["#8e1f2f", "#f0bc42"]), "lazio": ("plain", ["#87d8f7", W]), "fiorentina": ("plain", ["#5b2a86", W]),
    "torino": ("plain", ["#7a1d2b", W]), "como": ("plain", ["#1e5bc6", W]),
    "atletico": ("stripes", [R, W]), "atleti": ("stripes", [R, W]), "bilbao": ("stripes", [R, W]),
    "athletic": ("stripes", [R, W]), "barcelona": ("stripes", ["#a50044", "#004d98"]), "barca": ("stripes", ["#a50044", "#004d98"]),
    "real madrid": ("plain", [W, "#1c2a5b"]), "girona": ("stripes", [R, W]), "betis": ("stripes", ["#0bb363", W]),
    "espanyol": ("stripes", ["#1e5bc6", W]), "sociedad": ("stripes", ["#1e5bc6", W]), "levante": ("stripes", ["#1b2a5c", "#a51d2d"]),
    "malaga": ("stripes", ["#1e5bc6", W]), "rayo": ("sash", [W, R]), "granada": ("hoops", [R, W]),
    "sevilla": ("plain", [W, R]), "valencia": ("plain", [W, K]), "villarreal": ("plain", ["#ffe667", "#005187"]),
    "celta": ("plain", ["#8ac3ee", W]), "osasuna": ("plain", ["#d91a21", "#0a346f"]), "mallorca": ("plain", ["#e20613", K]),
    "getafe": ("plain", ["#1e5bc6", W]),
    "newcastle": ("stripes", [K, W]), "brentford": ("stripes", [R, W]), "sunderland": ("stripes", [R, W]),
    "brighton": ("stripes", ["#0057b8", W]), "southampton": ("stripes", [R, W]), "crystal palace": ("stripes", ["#1b458f", "#c4122e"]),
    "bournemouth": ("stripes", [R, K]), "arsenal": ("sleeves", ["#ef0107", W]), "aston villa": ("sleeves", ["#670e36", "#95bfe5"]),
    "west ham": ("sleeves", ["#7a263a", "#1bb1e7"]), "burnley": ("sleeves", ["#6c1d45", "#99d6ea"]),
    "man city": ("plain", ["#6cabdd", "#1c2c5b"]), "man united": ("plain", ["#da291c", W]), "liverpool": ("plain", ["#c8102e", W]),
    "chelsea": ("plain", ["#034694", W]), "tottenham": ("plain", [W, "#132257"]), "everton": ("plain", ["#003399", W]),
    "wolves": ("plain", ["#fdb913", "#231f20"]), "fulham": ("plain", [W, K]), "forest": ("plain", ["#dd0000", W]),
    "nottingham": ("plain", ["#dd0000", W]), "leeds": ("plain", [W, "#1d428a"]),
    "paris sg": ("band", ["#1b2a5c", R, W]), "marseille": ("plain", [W, "#2faee0"]), "lyon": ("plain", [W, "#1b2a5c"]),
    "monaco": ("diag", [R, W]), "nice": ("stripes", [R, K]), "lens": ("stripes", ["#ffd200", R]), "angers": ("stripes", [K, W]),
    "le havre": ("halves", ["#6cabdd", "#1b2a5c"]), "rennes": ("plain", [R, K]), "lille": ("plain", ["#e01e13", "#1b2a5c"]),
    "toulouse": ("plain", ["#5b2a86", W]), "nantes": ("plain", ["#ffd200", "#148a3c"]), "strasbourg": ("plain", ["#1e5bc6", W]),
    "lorient": ("plain", ["#f58220", K]), "brest": ("plain", [R, W]), "auxerre": ("plain", [W, "#1e5bc6"]),
    "bayern": ("plain", ["#dc052d", W]), "dortmund": ("plain", ["#fde100", K]), "leverkusen": ("plain", ["#e32221", K]),
    "leipzig": ("plain", [W, "#dd0741"]), "frankfurt": ("plain", [K, "#e1000f"]), "stuttgart": ("chest", [W, R]),
    "wolfsburg": ("plain", ["#65b32e", W]), "werder": ("plain", ["#1d9053", W]), "mainz": ("plain", ["#c3141e", W]),
    "union berlin": ("plain", ["#eb1923", W]), "gladbach": ("plain", [W, K]), "hoffenheim": ("plain", ["#1c63b7", W]),
    "st pauli": ("plain", ["#5c3a21", W]),
    "psv": ("stripes", [R, W]), "brugge": ("stripes", ["#0072ce", K]), "porto": ("stripes", ["#1e5bc6", W]),
    "sporting": ("hoops", ["#148a3c", W]), "celtic": ("hoops", ["#148a3c", W]), "olympiakos": ("stripes", [R, W]),
    "olympiacos": ("stripes", [R, W]), "feyenoord": ("halves", [R, W]), "ajax": ("band", [W, R, R]),
    "fenerbahce": ("stripes", ["#ffd200", "#1b2a5c"]), "galatasaray": ("halves", ["#a90432", "#fdb912"]),
    "besiktas": ("stripes", [K, W]), "benfica": ("plain", ["#e83030", W]), "crvena zvezda": ("stripes", [R, W]),
    "red star": ("stripes", [R, W]), "union sg": ("plain", ["#ffd200", "#1e3fa0"]), "salzburg": ("plain", [W, R]),
    "anderlecht": ("plain", ["#4c2a85", W]), "slavia praha": ("halves", [W, R]), "paok": ("stripes", [K, W]),
    "aek": ("plain", ["#ffd200", K]), "panathinaikos": ("plain", ["#148a3c", W]), "braga": ("plain", [R, W]),
    "young boys": ("plain", ["#ffd200", K]), "basel": ("halves", [R, "#1e3fa0"]), "bodo glimt": ("plain", ["#ffd200", K]),
}

FLAG_CODE = {
    "england": "ENG", "scotland": "SCO", "wales": "WAL", "northern ireland": "GB", "france": "FR", "spain": "ES",
    "germany": "DE", "italy": "IT", "portugal": "PT", "netherlands": "NL", "belgium": "BE", "brazil": "BR",
    "argentina": "AR", "uruguay": "UY", "colombia": "CO", "chile": "CL", "ecuador": "EC", "paraguay": "PY", "peru": "PE",
    "venezuela": "VE", "mexico": "MX", "united states": "US", "usa": "US", "canada": "CA", "norway": "NO", "sweden": "SE",
    "denmark": "DK", "finland": "FI", "iceland": "IS", "poland": "PL", "czech republic": "CZ", "czechia": "CZ",
    "slovakia": "SK", "slovenia": "SI", "croatia": "HR", "serbia": "RS", "bosnia and herzegovina": "BA",
    "bosnia-herzegovina": "BA", "montenegro": "ME", "north macedonia": "MK", "albania": "AL", "kosovo": "XK",
    "greece": "GR", "turkey": "TR", "türkiye": "TR", "austria": "AT", "switzerland": "CH", "hungary": "HU",
    "romania": "RO", "bulgaria": "BG", "ukraine": "UA", "russia": "RU", "georgia": "GE", "armenia": "AM",
    "ireland": "IE", "republic of ireland": "IE", "israel": "IL", "morocco": "MA", "algeria": "DZ", "tunisia": "TN",
    "egypt": "EG", "senegal": "SN", "ivory coast": "CI", "côte d'ivoire": "CI", "cote d'ivoire": "CI", "ghana": "GH",
    "nigeria": "NG", "cameroon": "CM", "mali": "ML", "guinea": "GN", "burkina faso": "BF", "gabon": "GA",
    "dr congo": "CD", "congo dr": "CD", "congo": "CG", "angola": "AO", "cape verde": "CV", "gambia": "GM",
    "south africa": "ZA", "japan": "JP", "korea republic": "KR", "south korea": "KR", "australia": "AU",
    "new zealand": "NZ", "jamaica": "JM", "costa rica": "CR", "panama": "PA", "honduras": "HN", "haiti": "HT",
    "luxembourg": "LU", "iran": "IR", "uzbekistan": "UZ", "suriname": "SR", "curacao": "CW", "curaçao": "CW",
    "zambia": "ZM", "zimbabwe": "ZW", "benin": "BJ", "togo": "TG", "comoros": "KM", "mozambique": "MZ",
    "guinea-bissau": "GW", "equatorial guinea": "GQ", "central african republic": "CF", "madagascar": "MG",
}
SUBDIV = {"ENG": "gbeng", "SCO": "gbsct", "WAL": "gbwls"}


def flag(nat):
    """Drapeau emoji de la sélection (vide si inconnue)."""
    code = FLAG_CODE.get((nat or "").strip().lower())
    if not code:
        return ""
    if code in SUBDIV:
        tag = "".join(chr(0xE0000 + ord(c)) for c in SUBDIV[code])
        return "\U0001F3F4" + tag + "\U000E007F"
    if code == "XK":
        return "\U0001F1FD\U0001F1F0"
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in code)


def parse_colors(s):
    out = []
    for part in (s or "").replace("&", "/").split("/"):
        p = part.strip().lower()
        hit = next((COLOR[k] for k in sorted(COLOR, key=len, reverse=True) if k in p), None)
        if hit and hit not in out:
            out.append(hit)
    return out[:3]


def kit_for(name, club_colors=""):
    """{"p": motif, "c": [couleur maillot, couleur secondaire, (3e)]} ou None si on ne sait rien."""
    n = norm(name or "")
    if n in KITS:
        p, c = KITS[n]
        return {"p": p, "c": c}
    toks = set(n.split())
    for k in sorted(KITS, key=lambda x: -len(x)):
        if set(k.split()) <= toks:
            p, c = KITS[k]
            return {"p": p, "c": c}
    cols = parse_colors(club_colors)
    if not cols:
        return None
    if len(cols) == 1:
        cols.append(W if cols[0] != W else K)
    return {"p": "plain", "c": cols}
