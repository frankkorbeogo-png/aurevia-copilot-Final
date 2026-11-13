# AUREVIA COPILOT V2.3.96 — Correctif de démarrage et authentification

## Correctif
- Le script de build copie désormais `fx-conversion.js` dans `dist/`.
- Cette omission provoquait une erreur de résolution de module lors du chargement de `app.js`; l'initialisation générale et le branchement des boutons d'authentification pouvaient donc ne jamais s'exécuter.

## Vérifications réalisées
- Build `node scripts/build.mjs` exécuté.
- Contrôle des imports relatifs des modules JavaScript dans `dist/` : aucun import manquant.
- Suite de tests `node --test` : 276 réussis, 0 échec.

## Limite
Ces vérifications portent sur le code et le build local. Le parcours Google OAuth réel doit encore être confirmé sur le site publié après déploiement, avec la configuration Supabase/Google autorisant l'URL de redirection de production.
