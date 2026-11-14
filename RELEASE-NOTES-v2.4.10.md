# AUREVIA COPILOT v2.4.10 — Entrée après mitigation M5/M1

- La surveillance M15 existante détecte toujours l'arrivée du prix dans la zone d'opportunité.
- Après mitigation, le worker exige maintenant une confirmation directionnelle sur une bougie M5 clôturée, puis une confirmation sur une bougie M1 clôturée.
- Les bougies M5/M1 trop anciennes ou insuffisantes ne peuvent pas déclencher une proposition d'entrée.
- La notification Telegram est envoyée uniquement après cette double confirmation et conserve le parcours de validation manuelle du lot.
- Le scénario peut toujours être invalidé par son niveau d'invalidation/SL ou arrêté manuellement.
- Aucun accès broker, aucune exécution automatique et aucun déploiement Netlify ne sont ajoutés.

Les tests vérifient les cas BUY, SELL, confirmation incomplète et données périmées. Ils ne remplacent pas un test réel de marché avec les clés de production.
