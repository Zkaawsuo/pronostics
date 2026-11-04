"""Envoie les tickets du jour sur Telegram en images, capturées dans l'appli elle-même.

Lancé par GitHub Actions après le calcul, seulement si build.py a préparé tg_daily.json.
En cas de souci (navigateur, réseau), le message texte part à la place.
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
TOKEN = os.getenv("TELEGRAM_TOKEN", "").strip()
CHAT = os.getenv("TELEGRAM_CHAT_ID", "").strip()
API = "https://api.telegram.org/bot{}/{}"


def send_text(text):
    requests.post(API.format(TOKEN, "sendMessage"), timeout=20,
                  data={"chat_id": CHAT, "text": text, "parse_mode": "HTML", "disable_web_page_preview": "true"})


def capture():
    from playwright.sync_api import sync_playwright
    srv = subprocess.Popen([sys.executable, "-m", "http.server", "8790", "--bind", "127.0.0.1", "-d", str(ROOT / "site")],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    shots = []
    try:
        with sync_playwright() as p:
            br = p.chromium.launch()
            pg = br.new_page(viewport={"width": 420, "height": 1600}, device_scale_factor=2, locale="fr-FR",
                             timezone_id="Europe/Paris")
            pg.add_init_script("try{localStorage.setItem('book','\"Betclic\"');localStorage.setItem('tcomp','\"ALL\"')}catch(e){}")
            pg.goto("http://127.0.0.1:8790/", wait_until="networkidle")
            pg.click(".tabs button[data-view='tickets']")
            pg.add_style_tag(content=".tact,.advice,.note{display:none!important}*{animation:none!important}")
            pg.wait_for_timeout(2500)
            for i, el in enumerate(pg.query_selector_all(".formula .trail > .slipt:first-child")[:4]):
                f = ROOT / f"tg_ticket_{i}.png"
                el.screenshot(path=str(f))
                shots.append(f)
            br.close()
    finally:
        srv.terminate()
    return shots


def main():
    job = ROOT / "tg_daily.json"
    if not (TOKEN and CHAT and job.exists()):
        return
    msg = json.loads(job.read_text())
    try:
        shots = capture()
    except Exception as ex:   # navigateur indisponible : on n'empêche pas le message de partir
        print("captures impossibles :", type(ex).__name__)
        shots = []
    if not shots:
        send_text(msg["text"])
        return
    caption = f'<b>⚽ Tickets du jour · Betclic</b>\n<a href="{msg["url"]}">Ouvrir l\'appli</a> · Probabilités, pas certitudes : joue petit.'
    media = [{"type": "photo", "media": f"attach://p{i}", **({"caption": caption, "parse_mode": "HTML"} if i == 0 else {})}
             for i in range(len(shots))]
    files = {f"p{i}": (f.name, f.read_bytes(), "image/png") for i, f in enumerate(shots)}
    r = requests.post(API.format(TOKEN, "sendMediaGroup"), data={"chat_id": CHAT, "media": json.dumps(media)},
                      files=files, timeout=60)
    if r.status_code != 200:
        print("envoi des images refusé :", r.status_code)
        send_text(msg["text"])


if __name__ == "__main__":
    main()
