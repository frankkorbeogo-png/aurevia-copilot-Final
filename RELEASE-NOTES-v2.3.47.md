# AUREVIA COPILOT V2.3.47

## Correctifs
- Calendrier économique USD servi par `/.netlify/functions/economic-calendar`, protégé par la session AUREVIA. Le navigateur n’appelle plus directement le fournisseur externe.
- Les deux emplacements du calendrier consomment la même réponse serveur ; les horaires sont affichés en heure du Burkina Faso.
- En cas d’indisponibilité, un message clair et un bouton de nouvelle tentative sont présentés.
- Dans « Ajouter un trade clôturé », la croix ferme explicitement la fenêtre sans enregistrer, le clic sur le fond ferme aussi la fenêtre, et le formulaire est réinitialisé après fermeture.

## Validation
- Tests automatisés : 162/162 réussis.
- Build Netlify : à exécuter après génération du ZIP.
- Le fonctionnement réel du calendrier dépend de la disponibilité de ShowMyTrades et de la configuration de l’authentification de production.
- Aucun déploiement Netlify n’a été effectué.
