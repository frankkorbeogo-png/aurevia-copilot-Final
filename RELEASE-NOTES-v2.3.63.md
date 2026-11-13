# AUREVIA COPILOT V2.3.63 — moteur de décision M15

## Refonte du moteur d'analyse
- Retrait de l'appel au moteur IA Groq dans le parcours d'analyse utilisateur.
- L'ancien endpoint `/api/ai-analysis` est conservé temporairement en mode retrait (HTTP 410) pour les anciens clients.
- Le moteur déterministe `aurevia-m15-deterministic-v1` produit désormais les scénarios BUY/SELL à partir des seules bougies et indicateurs M15.
- Le score /100 est une confluence technique explicable, pas une probabilité statistique.
- Les niveaux Entry, zone, SL et TP1/TP2/TP3 sont construits à partir de la structure, des zones techniques et de l'ATR M15.
- M15 est la seule unité obligatoire pour la décision. H4/H1/M30 sont du contexte ; M5/M1 servent uniquement à affiner le timing et ne modifient pas le score ni les niveaux principaux.
- Les données M15 périmées ou non horodatées restent bloquantes ; les unités optionnelles périmées sont exclues du calcul.
- Les scénarios restent indicatifs et aucune exécution broker n'est ajoutée.

## Validation locale
- `npm test` : 194 tests réussis.
- `npm run build` : build réussi.

## Limites
- Les propositions dépendent toujours de la disponibilité et de la fraîcheur du flux OHLC Twelve Data.
- Les seuils du score sont des règles techniques explicables ; ils ne représentent pas une probabilité de gain calibrée.
- Le ZIP n'est pas déployé sur Netlify et le rendu réel sur téléphone/tablette doit être vérifié après déploiement.
