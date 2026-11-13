# AUREVIA COPILOT V2.4.3 — Diagnostic IA visible

## Objectif
Faire remonter dans l'interface les diagnostics individuels déjà renvoyés par le routeur IA serveur, au lieu de ne montrer que le message générique « tous les fournisseurs ont échoué ».

## Changements
- Le client lit `providerDiagnostics.attempts` dans la réponse HTTP d'erreur.
- Affiche pour chaque fournisseur son nom, code diagnostic, statut HTTP, durée et message technique expurgé.
- Renomme les variables internes de Groq vers AUREVIA pour refléter le routage multi-fournisseurs (la fonction de compatibilité historique est conservée).
- Augmente le délai d'attente côté navigateur à 40 secondes pour couvrir le budget serveur de 34 secondes.
- Aucun secret, jeton, prompt ou corps brut du fournisseur n'est affiché.
- Les fonctions serveur, l'ordre Gemini → Cloudflare → SambaNova → Groq et les règles M15/TP/SL ne sont pas modifiés.

## Validation
- Tests : 288/288 réussis.
- Build : réussi.
- Les appels réels aux API ne sont pas simulés ni revendiqués ; ils devront être testés après déploiement.
