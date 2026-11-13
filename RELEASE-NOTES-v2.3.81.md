# AUREVIA COPILOT V2.3.81 — Connexion Telegram depuis l’accueil

## Nouveauté
L’écran d’accueil présente une notification visible tant que le compte utilisateur n’est pas associé à Telegram. Elle invite à connecter AUREVIA au bot officiel et explique l’intérêt de cette liaison : alertes, confirmations de scénarios et notifications de suivi, y compris lorsque l’application n’est pas ouverte.

Le bouton « Connecter Telegram » ouvre directement la page Notifications Telegram. L’état est vérifié auprès de Supabase : la notification disparaît uniquement si une liaison Telegram existe, et réapparaît après déliaison. Si la vérification échoue, un message de contrôle s’affiche.

## Compatibilité
- Fonctionne après authentification AUREVIA.
- Ne bloque pas les autres fonctions de l’application.
- Aucun token Telegram n’est exposé dans le navigateur.
- Responsive téléphone, tablette et ordinateur.
- Cache PWA mis à jour : `aurevia-shell-v2.3.81`.

## Validation
- Build : réussi.
- Tests automatisés : 250 réussis, 0 échec.
