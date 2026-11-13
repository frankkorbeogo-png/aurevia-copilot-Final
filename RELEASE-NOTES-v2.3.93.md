# AUREVIA COPILOT V2.3.93

## Correction du ciblage des annonces
- Le formulaire administrateur transmet désormais explicitement le mode `all` ou `selected` à l’API.
- Le mode ciblé permet de sélectionner des comptes dans la page courante de gestion des utilisateurs, avec conservation des sélections lors des changements de page et des recherches.
- Le formulaire bloque une annonce ciblée sans destinataire et limite la sélection à 100 comptes, conformément à l’API.
- Le message de confirmation précise si l’annonce est générale ou ciblée et indique le nombre de destinataires.
- Le mode général envoie une liste de destinataires vide afin que l’annonce soit accessible à tous les comptes.

La migration SQL des destinataires est déjà présente dans le projet et la structure correspondante existe dans Supabase ; aucune nouvelle migration n’est requise pour cette correction.
