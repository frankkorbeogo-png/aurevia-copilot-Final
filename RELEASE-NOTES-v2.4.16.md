# AUREVIA COPILOT — Priorité 2 : couverture multi-actifs

## Ajouts
- Catalogue central partagé entre l'interface, les fonctions Netlify, l'analyse et le suivi interne.
- Forex : ajout de EUR/AUD, EUR/CHF, GBP/AUD et AUD/JPY.
- Crypto : ajout de SOL/USD et XRP/USD.
- Énergie : WTI/USD conservé comme candidat mais désactivé tant que l’accès matières premières du plan Twelve Data n’est pas vérifié.
- Actions américaines : ajout de AAPL, MSFT, NVDA, TSLA et AMZN.
- Les cotations, l'historique OHLC, le moteur IA et le suivi interne utilisent le même catalogue.
- Les graphiques TradingView utilisent les symboles de visualisation distincts des symboles Twelve Data.
- Les indices US30, NAS100 et SPX500 restent désactivés : la page produit Twelve Data affiche encore « Indices coming soon » malgré une présentation générale de couverture mondiale. Sans confirmation par l'API et le plan de la clé, ils ne sont pas présentés comme pris en charge par le moteur.
- Les symboles non confirmés (platine/palladium) ont été retirés du catalogue actif.

## Limites à vérifier avant activation en production
- La disponibilité effective de chaque flux et de chaque intervalle dépend de la couverture et des droits de la clé Twelve Data configurée.
- Le suivi WebSocket et le suivi planifié doivent être validés sur des positions de test pour chaque nouvelle classe d'actifs.
- Les actions américaines utilisent les horodatages OHLC fournis par Twelve Data, normalisés par la fonction de données avant validation de fraîcheur.
- Aucun ordre n'est transmis à un broker.

## Tests
- Ajout d'un test de cohérence du catalogue partagé, des sélecteurs et des listes d'autorisation.
- Le build CI passe ; le jeu complet conserve 13 échecs préexistants identiques à la branche de référence. Les tests ciblés multi-actifs ajoutés passent. Les appels réels Twelve Data restent à valider avec une session AUREVIA authentifiée.

## Contrôles supplémentaires
- Le fichier `market-catalog.js` est inclus dans le build web : les imports des modules client ne seront pas absents du dossier de production.
- Les cinq actions US ont des horaires de séance NYSE/Nasdaq (09:30–16:00 America/New_York) et un blocage des week-ends et principaux jours fériés US.
- Vérifications syntaxiques effectuées sur les modules client, fonctions serveur et worker.
- Tests ciblés des horaires exécutés sur les fonctions pures : ouverture/clôture actions US, Thanksgiving, week-end Forex et fonctionnement crypto 24/7.
- Un workflow GitHub Actions exécute désormais `npm test` et `npm run build`. Le build de production et la présence de `dist/market-catalog.js` ont réussi. Les 13 échecs du jeu complet sont identiques à ceux observés sur la branche de référence issue de `main` (302/315 sur la référence, 308/321 sur la branche multi-actifs).
- La documentation Twelve Data indique que les matières premières nécessitent un plan Grow/Venture ; le niveau exact de la clé configurée n'est pas visible. WTI/USD reste donc désactivé jusqu'à vérification de l'accès réel.
- La variable secrète `TWELVEDATA_API_KEY` est présente dans la configuration Netlify (valeurs masquées). Les requêtes réelles de prix/OHLC n'ont pas encore été exécutées avec une session utilisateur authentifiée ; l'accès effectif au plan et à chaque symbole reste à confirmer avant activation finale.
