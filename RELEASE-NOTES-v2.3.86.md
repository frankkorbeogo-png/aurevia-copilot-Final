# AUREVIA COPILOT V2.3.86 — Comptes mémorisés sans reconnexion Google

- Chaque compte mémorisé dispose maintenant d'une session locale distincte, conservée séparément de la liste des comptes.
- Après déconnexion du compte A, l'utilisateur peut sélectionner le compte B puis revenir au compte A sur le même appareil sans repasser par Google, tant que le jeton de renouvellement reste valide.
- Le bouton affiche « Utiliser ce compte » lorsqu'une session locale réutilisable existe.
- Si la session a expiré ou a été révoquée, AUREVIA demande une nouvelle authentification Google.
- Retirer un compte de la mémoire locale supprime aussi sa session locale mémorisée, sans supprimer le compte AUREVIA.
- Aucun changement au fonctionnement des comptes, aux données serveur, ni à l'authentification administrateur.
