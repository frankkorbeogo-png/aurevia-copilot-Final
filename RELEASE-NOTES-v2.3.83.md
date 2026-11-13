# AUREVIA COPILOT V2.3.83 — Liaison Telegram individuelle

## Règle de liaison
- Un compte Telegram ne peut être lié qu’à un compte AUREVIA.
- Un compte AUREVIA ne peut avoir qu’un compte Telegram lié.
- Une nouvelle liaison ne remplace jamais l’ancienne automatiquement.
- Pour déplacer une liaison, l’utilisateur doit d’abord déconnecter Telegram depuis les paramètres du compte AUREVIA actuellement associé, puis générer un nouveau code.
- Les contraintes SQL `UNIQUE(chat_id)` et `UNIQUE(user_id)` de la production constituent la dernière protection contre les doublons et les courses concurrentes.

## Comportement du bot
Le bot explique clairement le conflit et indique où déconnecter l’ancienne liaison. Les conflits d’unicité inattendus sont traités sans annoncer une connexion réussie.

## Validation
Deux tests dédiés vérifient le refus dans les deux sens. Aucun changement de schéma n’est requis : les deux contraintes d’unicité sont déjà présentes dans la base Supabase de production.

Aucun déploiement Netlify n’est effectué par cette livraison locale.
