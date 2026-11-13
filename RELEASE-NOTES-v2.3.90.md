# AUREVIA COPILOT V2.3.90

## Annonces générales et ciblées
- L’administrateur choisit entre une annonce générale (tous les utilisateurs) et une annonce ciblée (sélection de comptes).
- La sélection des destinataires reprend les comptes affichés dans la recherche et la page courantes de la gestion des utilisateurs.
- Confirmation avant publication, validation serveur des comptes et rattachement des destinataires avant publication.
- Les annonces ciblées ne sont visibles que par les comptes destinataires grâce à la politique RLS Supabase.
- Telegram cible uniquement les destinataires sélectionnés qui ont lié leur compte et activé les annonces produit ; les annonces générales restent envoyées aux abonnés concernés.
- Le suivi des lectures reste individuel et l’administrateur continue de recevoir les annonces générales.

## Migration requise
Appliquer `supabase/migrations/20261113170000_targeted_announcements.sql` sur le projet Supabase avant le déploiement de cette version.
