"""Envoi quotidien des tickets sur Telegram.

Actif seulement si les secrets TELEGRAM_TOKEN et TELEGRAM_CHAT_ID existent sur GitHub.
Un message par jour, au premier calcul après 7 h (heure de Paris). Le tout premier message part
dès que les secrets sont en place, pour vérifier que ça marche.
"""
import html
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

PARIS = ZoneInfo("Europe/Paris")


def _n2(x):
    return f"{x:.2f}".replace(".", ",")


def _when(iso):
    d = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(PARIS)
    jours = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."]
    return f"{jours[d.weekday()]} {d:%H:%M}"


def message(tk, url):
    e = html.escape
    book = tk.get("track_book") or (tk["books"][0] if tk.get("books") else "")
    out = [f"<b>⚽ Pronos du jour</b> · {e(book)}", ""]
    any_ticket = False
    for fid, fm in tk.get("formulas", {}).items():
        t = (tk.get("by_book", {}).get(book) or {}).get(fid)
        if not t:
            continue
        any_ticket = True
        out.append(f"{fm['emoji']} <b>{e(fm['name'])}</b> · cote <b>{_n2(t['odds'])}</b> · {round(t['p'] * 100)} % de chances")
        for l in t["legs"]:
            out.append(f"   • {e(l['label'])} ({e(l['match'])}, {_when(l['date'])}) @{'≈' if l['est'] else ''}{_n2(l['odd'])}")
        out.append(f"   <i>rendement moyen {round(t['ev'] * 100):+d} %</i>")
        out.append("")
    if not any_ticket:
        out += ["Pas de ticket crédible aujourd'hui.", ""]
    if tk.get("combis"):
        out.append("🎯 <b>Combis du jour</b> (à comparer dans MyCombi)")
        out += [f"   • {e(c['label'])} ({e(c['match'])}) : {round(c['p'] * 100)} % → cote juste {_n2(c['fair'])}"
                for c in tk["combis"][:3]]
        out.append("")
    if tk.get("buteurs"):
        out.append("⚽ <b>Buteurs du jour</b> (vérifie la compo)")
        out += [f"   • {e(b['name'])} ({e(b['team'])}) : {round(b['p'] * 100)} % → cote juste {_n2(b['fair'])}"
                for b in tk["buteurs"][:3]]
        out.append("")
    out.append(f'<a href="{e(url)}">Ouvrir l\'appli</a>')
    out.append("<i>Probabilités, pas certitudes : joue petit.</i>")
    return "\n".join(out)


def send(token, chat_id, text):
    """Renvoie (ok, détail). Jamais le jeton dans le détail : il est dans l'URL de l'API."""
    try:
        r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage", timeout=20,
                          data={"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                                "disable_web_page_preview": "true"})
    except requests.RequestException as ex:
        return False, type(ex).__name__
    if r.status_code == 200:
        return True, "ok"
    try:
        desc = str(r.json().get("description", ""))[:80]
    except ValueError:
        desc = ""
    return False, f"HTTP {r.status_code} {desc}".strip()
