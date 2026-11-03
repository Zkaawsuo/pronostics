# Pronos

Appli perso de pronostics foot. Tout tourne seul sur GitHub, gratuitement :
GitHub Actions recalcule les pronos 4 fois par jour, GitHub Pages sert l'appli.

## Ce que fait le modèle

1. **Dixon-Coles** ajusté sur 2 saisons par championnat, matchs récents pondérés plus fort.
   La cible mélange vrais buts (45 %) et **xG Understat** (55 %), plus stables que les buts.
2. **Elo ClubElo** (toutes les équipes européennes) : 30 % du résultat en championnat,
   base principale en coupe d'Europe.
3. **Fatigue** : moins de 4 jours de repos = léger malus.
4. **Absences** (API-Football) pondérées par la part du joueur dans les xG + passes décisives attendues de l'équipe.
5. **Cotes FR** (Betclic, Winamax, Unibet, PMU, Parions Sport, NetBet via The Odds API), marge retirée.
   Proba finale = 60 % marché + 40 % modèle.

Suivi de fiabilité : chaque prono est figé avant le match puis comparé au score,
et un test glissant sur 12 semaines est refait chaque semaine.

## Les 3 secrets (Settings → Secrets and variables → Actions)

| Nom        | Où le trouver                              | Obligatoire |
|------------|--------------------------------------------|-------------|
| `FD_KEY`   | football-data.org, mail d'inscription      | Oui         |
| `ODDS_KEY` | the-odds-api.com, offre gratuite           | Recommandé  |
| `AF_KEY`   | dashboard.api-football.com → My Access     | Optionnel   |

## Réglages

Tout est dans `pipeline/config.py` (poids des xG, de l'Elo, du marché, horizon...).

Les pronostics sont des probabilités. Aucun gain n'est garanti.
