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
