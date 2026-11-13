# AUREVIA COPILOT V2.3.95 — Correction de l’authentification

- Les boutons « Se connecter avec Google » et « Créer un compte » sont maintenant liés dès l’initialisation de l’écran, avant la restauration de session Supabase.
- Une restauration de session lente ou en échec ne laisse plus les boutons inactifs.
- Le chargement du client Supabase est relancé au clic si nécessaire.
- Les erreurs OAuth et de chargement sont affichées à l’écran et le bouton est réactivé après échec.
- Protection contre le double branchement des événements.

Validation locale : build réussi ; 276 tests automatisés réussis.

Important : les deux boutons utilisent toujours Google OAuth (pas de formulaire e-mail/mot de passe dans cette version). Le déploiement en production reste à effectuer et les parcours doivent être testés sur le site publié.
