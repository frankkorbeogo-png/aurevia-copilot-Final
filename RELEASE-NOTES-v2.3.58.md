# AUREVIA COPILOT V2.3.58

## Correctifs inclus

- Restauration de l'ancien calendrier TradingView pour l'affichage de la page Calendrier économique.
- Le moteur conserve ses flux économiques structurés côté serveur ; le widget visuel n'est pas présenté comme une API exploitable par l'IA.
- Scénarios BUY et SELL chiffrés calculés à partir des OHLC et de l'ATR : zone/entrée indicative, ordre potentiel, SL et trois TP.
- Les plans faibles restent visibles sous le statut WATCH, avec avertissement explicite ; ils ne sont pas des entrées validées.
- Le score affiché reste un score de confluence sur 100. Aucune probabilité de gain non calibrée n'est affichée.
- Reconnexion Telegram : réactivation des contrôles après déliaison et vérification de la liaison après génération du code.
- Texte de suppression de compte clarifié : le compte Google personnel n'est pas supprimé.

## Validation

- Tests automatisés : 183/183 réussis après ajout des tests de régression.
- Build : à confirmer lors de la compilation finale.
- Non validé dans cette livraison : suppression réelle d'un compte en production, appairage Telegram réel, disponibilité effective du widget TradingView sur le domaine Netlify et exactitude des données marché en direct.
