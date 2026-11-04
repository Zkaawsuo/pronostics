# Pronos

Appli perso de pronostics foot. Tout tourne seul sur GitHub, gratuitement :
GitHub Actions recalcule les pronos 4 fois par jour, GitHub Pages sert l'appli.

## Ce que fait le modèle

1. **Dixon-Coles** ajusté sur 2 saisons par championnat, matchs récents pondérés plus fort.
   La cible mélange vrais buts et **xG** : Understat si le site répond, sinon des xG approchés
   par les tirs et tirs cadrés (football-data.co.uk). La part des xG est choisie par l'auto-réglage,
   qui peut aussi décider de s'en passer.
2. **Elo ClubElo** (toutes les équipes européennes), ou à défaut un **Elo calculé par l'app**
   sur les résultats football-data (les matchs de Ligue des champions relient les championnats).
   Sa part est choisie par l'auto-réglage.
3. **Fatigue** : moins de 4 jours de repos = léger malus.
4. **Absences** (API-Football) pondérées par la part du joueur dans les xG + passes décisives attendues de l'équipe.
5. **Cotes FR** (Betclic, Winamax, Unibet, PMU, Parions Sport, NetBet via The Odds API), marge retirée.
   Proba finale = 60 % marché + 40 % modèle.

Suivi de fiabilité : chaque prono est figé avant le match puis comparé au score,
et un test glissant sur 12 semaines est refait chaque semaine.

## Auto-réglage

Chaque semaine, le test glissant essaie 36 variantes (part des xG, mémoire du modèle, part de l'Elo)
et garde la meilleure, seulement si elle bat nettement le réglage en cours.
Le poids du marché est appris sur les pronos vérifiés dès 150 matchs.

## Les 3 tickets

Construits à chaque calcul avec les vraies cotes de chaque bookmaker (Betclic par défaut) :

| Formule      | Cote totale | Proba mini par sélection |
|--------------|-------------|--------------------------|
| 🟢 Solide    | 1,45 – 1,85 | 68 %                     |
| 🟡 Équilibré | 2,30 – 3,40 | 50 %                     |
| 🔴 Audacieux | 4,80 – 8,50 | 36 %                     |

Dans chaque fourchette, l'app choisit la combinaison qui rapporte le plus en moyenne,
une sélection par match, en écartant les sélections où modèle et marché divergent trop.
Chaque ticket est figé au coup d'envoi de son 1er match puis réglé : le bilan réel est affiché.

Tickets spéciaux par compétition (LDC, Ligue 1...) : mêmes règles, sur les matchs de la compétition,
jusqu'à la semaine si rien n'est jouable dans les 4 jours.

## Telegram (facultatif)

Chaque matin vers 7 h 30, les 3 tickets, les combis et les buteurs du jour arrivent sur Telegram.
1. Sur Telegram, écris à @BotFather → /newbot → choisis un nom → il te donne un jeton.
2. Écris /start à ton nouveau bot (sinon il n'a pas le droit de t'écrire).
3. Écris /start à @userinfobot : il te répond ton identifiant (Id).
4. Ajoute 2 secrets GitHub : `TELEGRAM_TOKEN` (le jeton) et `TELEGRAM_CHAT_ID` (l'identifiant).
Le premier message part au calcul suivant, pour vérifier que tout marche.

## Combis du match (type MyCombi)

Pour chaque match, la matrice de scores donne la vraie chance de deux paris liés
(victoire + plus de 2,5 buts, victoire sans encaisser, les 2 marquent + plus de 2,5...).
Betclic ne publie pas ces cotes dans nos sources : l'app affiche la cote juste,
la combi n'est intéressante que si MyCombi paie plus.

Pas de buteurs : il faudrait des stats de joueurs de la saison en cours (offres payantes).

## Cotes : économie de crédits

Un relevé couvre toute la semaine pour le même coût. Les compétitions avec un match dans les 30 h
sont rafraîchies toutes les 11 h, les autres tous les ~3 jours. Sous 40 crédits restants,
seuls les matchs proches sont relevés ; sous 10, plus rien.

## Les 3 secrets (Settings → Secrets and variables → Actions)

| Nom        | Où le trouver                              | Obligatoire |
|------------|--------------------------------------------|-------------|
| `FD_KEY`   | football-data.org, mail d'inscription      | Oui         |
| `ODDS_KEY` | the-odds-api.com, offre gratuite           | Recommandé  |
| `AF_KEY`   | dashboard.api-football.com → My Access     | Optionnel   |

## Réglages

Tout est dans `pipeline/config.py` (poids de départ, fourchettes des tickets, politique de cotes...).

## Ordi et téléphone

Même adresse partout : https://zkaawsuo.github.io/pronostics/
Sur ordi (Chrome ou Edge), l'icône d'installation dans la barre d'adresse en fait une appli.

Les pronostics sont des probabilités. Aucun gain n'est garanti.
