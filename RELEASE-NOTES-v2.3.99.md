# AUREVIA COPILOT V2.3.99 — suppression de compte unifiée

- La suppression par l'utilisateur et celle par l'administrateur utilisent désormais le même nettoyage applicatif.
- La fonction partagée révoque explicitement toutes les sessions AUREVIA avant de purger les données et de supprimer l'identité Supabase Auth.
- Ajout de la migration `20261113100000_shared_account_deletion_session_revocation.sql` (à appliquer sur Supabase avant déploiement).
- Si la révocation échoue, la suppression s'arrête sans purger les données ni supprimer l'identité.
- La suppression ne crée aucune liste noire d'e-mails ou d'identités Google : une nouvelle inscription explicite reste possible.

Cette archive n'est pas publiée sur Netlify. Appliquer la migration Supabase puis déployer la version après vérifications.
