# AUREVIA COPILOT V2.3.64 — Groq analyste principal & surveillance M15

- Groq est rétabli comme analyste décisionnel principal via une fonction serveur authentifiée.
- Les propositions BUY/SELL/WAIT, zones d'entrée, SL, TP, raisonnement humain et estimation de réussite sont générés par Groq à partir des bougies et indicateurs M15 uniquement.
- H4/H1/M30 et le contexte macro sont transmis comme contexte explicatif seulement ; ils ne sont pas fusionnés dans les chiffres M15.
- Les réponses Groq sont contrôlées côté serveur : direction, zone, entrée, cohérence SL/TP, limites de risque de prix et probabilité bornée.
- La probabilité est explicitement marquée comme estimation IA non calibrée ; elle n'est pas présentée comme une statistique historique.
- Le clic d'enregistrement persiste le scénario, l'estimation, sa justification, le score de confirmation et le raisonnement.
- Le worker de surveillance récupère les bougies M15, vérifie la zone, la confirmation, l'invalidation et notifie Telegram. Il ne contacte pas Groq pendant la surveillance.
- Aucun broker, aucune exécution d'ordre, aucun accès MT5.
- Migration Supabase ajoutée : `20261113100000_groq_scenario_probability_and_reasoning.sql`.

## Configuration requise
- `GROQ_API_KEY` doit être définie dans les variables d'environnement Netlify (server-side uniquement).
- `TWELVEDATA_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_SERVICE_ROLE_KEY` restent nécessaires.
- Appliquer la nouvelle migration Supabase avant d'utiliser la sauvegarde des scénarios enrichis.
