# AUREVIA COPILOT V2.3.98 — Suppression définitive des comptes

## Règle de suppression
- La suppression par l’utilisateur ou par l’administrateur efface les données AUREVIA associées au compte avant de supprimer l’identité Supabase Auth.
- Sont visés : profil, préférences, liaison Telegram, journal, groupes de positions, positions, clôtures, scénarios surveillés, événements d’alerte, lectures et destinataires d’annonces ciblées.
- La session AUREVIA est révoquée ; les jetons de session Supabase ne peuvent plus être renouvelés après suppression de l’identité.
- Les données locales personnelles sont supprimées sur l’appareil courant. Sur un autre appareil, la comparaison de l’identifiant utilisateur efface les anciennes données locales lorsqu’un compte réinscrit avec une nouvelle identité s’y connecte.
- Aucun blocage permanent de l’adresse e-mail ou de l’identité Google : la personne peut choisir « Créer un compte » et repartir de zéro.

## Vérification
- Tests automatisés : 283 tests attendus ; résultat à confirmer dans la sortie de validation.
- Build : à confirmer dans la sortie de validation.
- Cette archive n’est pas déployée en production.
