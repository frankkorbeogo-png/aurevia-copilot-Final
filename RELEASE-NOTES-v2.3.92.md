# AUREVIA COPILOT V2.3.92 — Devise de compte centralisée

## Changements
- La devise du compte se configure une seule fois dans Paramètres & profil.
- Elle est enregistrée dans `user_preferences.preferences.account_currency` pour le compte connecté.
- Une notification sur l’accueil invite à la renseigner lorsqu’elle est absente.
- Le formulaire de position ne redemande plus la devise ; chaque nouvelle position capture la devise du profil dans son snapshot contractuel.
- Le calculateur de risque réutilise la devise enregistrée et refuse de calculer si elle manque.
- Telegram récupère la devise enregistrée ; il ne la redemande plus à chaque trade et invite à configurer le profil si elle est absente.
- Les positions historiques conservent leur devise dans leur snapshot et ne sont pas réécrites lors d’un changement de préférence.

## Données et migration
Aucune migration SQL supplémentaire n’est nécessaire : la préférence est stockée dans la colonne JSONB `user_preferences.preferences` déjà utilisée par AUREVIA.

## Validation
- `npm test` : 266 tests réussis.
- `npm run build` : réussi.
