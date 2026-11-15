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

## Contrôles supplémentaires
- Le fichier `market-catalog.js` est inclus dans le build web : les imports des modules client ne seront pas absents du dossier de production.
- Les cinq actions US ont des horaires de séance NYSE/Nasdaq (09:30–16:00 America/New_York) et un blocage des week-ends et principaux jours fériés US.
- Vérifications syntaxiques effectuées sur les modules client, fonctions serveur et worker.
- Tests ciblés des horaires exécutés sur les fonctions pures : ouverture/clôture actions US, Thanksgiving, week-end Forex et fonctionnement crypto 24/7.
- Un workflow GitHub Actions exécute désormais `npm test` et `npm run build`. Aucune exécution CI n'a encore été remontée pour ce commit.
- La variable secrète `TWELVEDATA_API_KEY` est présente dans la configuration Netlify (valeurs masquées). Les requêtes réelles de prix/OHLC n'ont pas encore été exécutées avec une session utilisateur authentifiée ; l'accès effectif au plan et à chaque symbole reste à confirmer avant activation finale.
