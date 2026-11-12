# AUREVIA COPILOT v2.3.41

## Ajouts
- Chaîne d'analyse technique limitée à M30 (structure), M15 (confrontation/zone) et M5 (confirmation unique). M1 et H4 ne sont plus requis par le moteur d'analyse.
- Confrontation IA / trader basée sur le dernier résultat technique réellement calculé, sans fabriquer une conclusion WAIT.
- Synthèse de confrontation éditable avant enregistrement.
- Enregistrement direct d'un scénario IA identifié, ou enregistrement de la synthèse modifiée.
- Enregistrement des scénarios dans Supabase avec statut et historique.
- Surveillance serveur planifiée chaque minute : prix courant pour détecter la zone, bougies M5 clôturées pour le contrôle de déclenchement.
- Notifications Telegram à l'enregistrement, à l'atteinte de zone et à la confirmation M5 (selon les préférences Telegram de l'utilisateur).
- Arrêt manuel côté serveur ; une surveillance arrêtée n'envoie plus de nouvelles alertes et ne ferme aucune position ouverte.
- Invalidation automatique lorsque le niveau SL enregistré est atteint.

## Mise en service obligatoire
1. Appliquer le fichier `supabase/migrations/20261112200000_analysis_scenario_monitoring.sql` au projet Supabase avant le déploiement.
2. Déployer cette version sur Netlify avec les variables existantes `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `TWELVEDATA_API_KEY` et `TELEGRAM_BOT_TOKEN`.
3. Vérifier dans Netlify que la fonction planifiée `scenario-watch` est publiée et s'exécute chaque minute.
4. Connecter Telegram et activer les notifications de signaux pour recevoir les alertes.

## Limites explicites
- AUREVIA ne se connecte à aucun broker et n'envoie aucun ordre.
- Le déclencheur M5 actuellement implémenté est une bougie M5 clôturée dans le sens du scénario, clôturant au-delà de l'extrême de la bougie précédente. Ce n'est pas une détection complète de CHoCH/BOS multi-structures.
- La disponibilité du contrôle dépend du fournisseur Twelve Data, de ses quotas, de la fraîcheur des bougies et de l'exécution du cron Netlify.
- Le score de confirmation n'est pas une probabilité statistique.
