# AUREVIA COPILOT V2.4.9 — Analyse multi-timeframes

## Évolution principale
- H4 : biais directeur et contexte de tendance.
- H1 : validation structurelle et ruptures.
- M30 : préparation du setup et lecture des zones/liquidités.
- M15 : timeframe décisionnel pour BUY/SELL/WAIT, entrée, invalidation, SL, TP et score.
- M5 : confirmation du déclencheur et affinage du timing ; ne peut pas inverser seul la direction M15.

## Données et résilience
- M15 reste chargé en premier et demeure le seul timeframe obligatoire pour produire un scénario.
- H4, H1, M30 et M5 sont chargés en parallèle après M15 ; leur indisponibilité ou fraîcheur insuffisante est signalée sans bloquer automatiquement le scénario.
- Les données OHLC, indicateurs, structures et figures des unités disponibles sont transmises au moteur IA sous forme compacte.
- Le prompt demande une synthèse explicite des accords, divergences et impacts par unité.
- Les unités manquantes ne sont jamais inventées.

## Limites assumées
- L’analyse M5 affine le timing mais ne garantit pas une entrée immédiate.
- La disponibilité des cinq unités dépend du quota et de la disponibilité Twelve Data. L’ajout de M5 entraîne un appel OHLC supplémentaire par analyse (quatre unités facultatives au total).
- Aucun ordre n’est exécuté automatiquement et aucune connexion broker n’est ajoutée.

## Vérification
- Syntaxe JavaScript vérifiée.
- Suite de tests : 295 réussis, 0 échec.
