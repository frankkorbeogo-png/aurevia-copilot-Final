# AUREVIA COPILOT V2.3.1 — état de livraison

## Vérifications locales réalisées
- Compilation de production : `npm run build` réussie.
- Tests automatisés : 106/106 réussis (Node.js `node --test`).
- Les fichiers publiés sont générés dans `dist/`.
- L'analyse reste manuelle au clic ; aucune rafale d'appels OHLC au démarrage.
- Les requêtes d'analyse identiques sont mutualisées et une réponse HTTP 429 provoque une temporisation locale de 15 secondes.
- Le score affiché est explicitement un score de confirmation technique, pas une probabilité statistique.
- La surveillance des positions est strictement interne à AUREVIA ; aucun broker, MT5 ou Exness n'est connecté et aucun ordre broker n'est envoyé.

## Intégrations qui nécessitent encore un environnement réel
Ces points ne peuvent pas être déclarés validés par des tests locaux sans secrets, projet Supabase, domaine OAuth et comptes fournisseurs :
1. Twelve Data : définir `TWELVEDATA_API_KEY`, vérifier les quotas du plan et exécuter les scénarios 429/502 sur le domaine de préproduction.
2. IA : définir `GROQ_API_KEY` et vérifier les réponses réelles, les limites et les scénarios BUY/SELL/WAIT avec des données de marché réelles.
3. Supabase : appliquer toutes les migrations de ce ZIP dans l'ordre, vérifier RLS, restauration multi-appareils, sessions uniques, journal, suppressions et modifications avec deux comptes réels.
4. Telegram : définir `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` et `INTERNAL_NOTIFY_SECRET`, lier un chat, puis vérifier les notifications et les reprises après panne.
5. OAuth Google : configurer les URL autorisées Supabase/Google sur le domaine de préproduction et tester connexion, déconnexion et remplacement de session sur deux appareils.
6. `trade-watch` : vérifier dans les journaux Netlify que la tâche planifiée s'exécute chaque minute et valider les événements TP/SL sur des positions de test. Les notifications et changements de statut ne sont pas une exécution broker.
7. Calendrier macroéconomique : les informations externes dépendent du fournisseur embarqué et de sa disponibilité. Aucun flux macro complet autonome n'est déclaré validé dans cette version.

## Contrôles manuels toujours requis
- Rejouer les 177 tests initiaux sur téléphone, tablette et ordinateur ; les tests automatisés ne remplacent pas ces parcours.
- Vérifier les 14 instruments, les types d'ordres, les deux modes de gestion, les clôtures partielles, les calculs P/L avec les spécifications contractuelles exactes et le journal lié.
- Comparer les résultats financiers à un relevé de référence ; si la taille de contrat, conversion ou frais sont inconnus, le résultat doit être considéré comme une estimation.

## Politique de livraison
Cette archive est une version candidate vérifiée localement, pas une certification de production. Aucun déploiement Netlify ni aucune migration distante n'a été exécuté depuis cette session.

## Ajout V2.3.2 — clôtures partielles cloud
- L'enregistrement d'une clôture partielle/complète passe désormais par une fonction SQL transactionnelle, avec verrouillage de la position et idempotence par UUID d'événement.
- Le serveur recalcule volume restant, P/L cumulé, statut de position, journal lié et statut du groupe dans une même transaction.
- Test local statique du contrat RPC ajouté ; il ne remplace pas un test d'intégration sur Supabase.
- Migration requise : `20261112100000_atomic_position_close_v232.sql`.
