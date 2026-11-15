# AUREVIA COPILOT — Priorité 2 : couverture multi-actifs

## Ajouts
- Catalogue central partagé entre l'interface, les fonctions Netlify, l'analyse et le suivi interne.
- Forex : ajout de EUR/AUD, EUR/CHF, GBP/AUD et AUD/JPY.
- Crypto : ajout de SOL/USD et XRP/USD.
- Énergie : ajout du WTI/USD.
- Actions américaines : ajout de AAPL, MSFT, NVDA, TSLA et AMZN.
- Les cotations, l'historique OHLC, le moteur IA et le suivi interne utilisent le même catalogue.
- Les graphiques TradingView utilisent les symboles de visualisation distincts des symboles Twelve Data.
- Les indices US30, NAS100 et SPX500 restent désactivés pour l'analyse automatique : Twelve Data indique que ses données d'indices ne sont pas encore disponibles. Ils ne sont pas présentés comme pris en charge par le moteur.
- Les symboles non confirmés (platine/palladium) ont été retirés du catalogue actif.

## Limites à vérifier avant activation en production
- La disponibilité effective de chaque flux et de chaque intervalle dépend de la couverture et des droits de la clé Twelve Data configurée.
- Le suivi WebSocket et le suivi planifié doivent être validés sur des positions de test pour chaque nouvelle classe d'actifs.
- Les actions américaines utilisent les horodatages OHLC fournis par Twelve Data, normalisés par la fonction de données avant validation de fraîcheur.
- Aucun ordre n'est transmis à un broker.

## Tests
- Ajout d'un test de cohérence du catalogue partagé, des sélecteurs et des listes d'autorisation.
- Les tests automatisés complets et les tests réels avec la clé Twelve Data restent à exécuter avant le déploiement final.
