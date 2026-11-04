"""Telegram : tickets du jour, alertes de tickets réglés, et aide pour trouver son identifiant.

- Seul TELEGRAM_TOKEN existe : le bot répond à ton /start en t'envoyant ton identifiant (à mettre dans
  le secret TELEGRAM_CHAT_ID). Rien n'est enregistré dans le dépôt, qui est public.
- Les deux secrets existent : un message par jour au premier calcul après 7 h (heure de Paris), le tout
  premier tout de suite pour vérifier, puis une alerte quand un ticket suivi est gagné ou perdu.
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


def id_message(chat_id):
    return (f"👋 Salut ! Ton identifiant Telegram est : <code>{int(chat_id)}</code>\n\n"
            "Pour recevoir tes pronos ici, ajoute-le sur GitHub : ton dépôt → Settings → Secrets and variables → "
            "Actions → New repository secret. Nom : <b>TELEGRAM_CHAT_ID</b>, valeur : le nombre ci-dessus.\n\n"
            "Ensuite tu auras les tickets chaque matin et une alerte quand un ticket suivi est gagné ou perdu.")


def settled_message(tickets, formulas, url):
    e = html.escape
    out = ["<b>🔔 Tickets réglés</b>", ""]
    for t in tickets:
        fm = formulas.get(t.get("formula"), {})
        name = f"{fm.get('emoji', '')} {fm.get('name', 'Ticket')}".strip()
        if t["status"] == "won":
            out.append(f"✅ <b>{e(name)} gagné</b> · cote {_n2(t.get('paid', t['odds']))}")
        else:
            out.append(f"❌ <b>{e(name)} perdu</b> · cote {_n2(t['odds'])}")
        for l in t["legs"]:
            r = l.get("result")
            score = f"{r[0]}-{r[1]}" if r else "annulé"
            out.append(f"   • {e(l['label'])} ({e(l['match'])}, {score})")
        out.append("")
    out.append(f'<a href="{e(url)}">Voir le suivi</a>')
    return "\n".join(out)


def value_message(vals, book, url):
    e = html.escape
    out = [f"<b>💎 Bonne cote chez {e(book)}</b>", "La cote paie plus que la vraie chance estimée par l'appli :", ""]
    for v in vals[:6]:
        out.append(f"• <b>{e(v['label'])}</b> @{_n2(v['odd'])} ({e(v['match'])}, {_when(v['date'])})")
        out.append(f"   {round(v['p'] * 100)} % de chances · rendement estimé +{v['ev']:.0f} %".replace(".", ","))
    out += ["", f'<a href="{e(url)}">Ouvrir l\'appli</a>', "<i>Vérifie la cote avant de jouer : elle bouge vite.</i>"]
    return "\n".join(out)


def weekly_message(hist, formulas, live, comps, now, url):
    from datetime import timedelta
    e = html.escape
    since = (now - timedelta(days=7)).isoformat()
    week = [t for t in hist if t.get("first", "") >= since and t["status"] in ("won", "lost")]
    out = ["<b>📅 Bilan de la semaine</b>", ""]
    if week:
        for fid, fm in formulas.items():
            ts = [t for t in week if t.get("formula") == fid]
            if not ts:
                continue
            won = [t for t in ts if t["status"] == "won"]
            roi = (sum(t.get("paid", t["odds"]) for t in won) - len(ts)) / len(ts)
            out.append(f"{fm['emoji']} {e(fm['name'])} : {len(won)}/{len(ts)} gagnés · {roi * 100:+.0f} % pour 1 € par ticket")
    else:
        out.append("Aucun ticket suivi réglé cette semaine.")
    rates = ((live or {}).get("markets") or {}).get("by_comp") or {}
    best = sorted(((c, r["fav"]) for c, r in rates.items() if r.get("fav") and r["fav"]["n"] >= 10), key=lambda x: -x[1]["hit"])[:3]
    if best:
        out += ["", "<b>Où l'app vise juste (favori)</b>"]
        out += [f"• {e(comps[c]['name'])} : {round(v['hit'] * 100)} % sur {v['n']} matchs" for c, v in best]
    out += ["", f'<a href="{e(url)}">Ton bilan perso est dans Mes paris</a>']
    return "\n".join(out)


def get_updates(token, offset=None):
    """Messages reçus par le bot (24 h max chez Telegram). Renvoie (liste ou None, détail sans le jeton)."""
    params = {"timeout": 0, "allowed_updates": '["message"]'}
    if offset:
        params["offset"] = offset
    try:
        r = requests.get(f"https://api.telegram.org/bot{token}/getUpdates", params=params, timeout=20)
    except requests.RequestException as ex:
        return None, type(ex).__name__
    if r.status_code != 200:
        try:
            desc = str(r.json().get("description", ""))[:80]
        except ValueError:
            desc = ""
        return None, f"HTTP {r.status_code} {desc}".strip()
    try:
        return list(r.json().get("result", [])), "ok"
    except ValueError:
        return None, "réponse illisible"


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
