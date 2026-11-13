# AUREVIA COPILOT V2.3.61

## Correctifs

- Le calendrier économique structuré est maintenant chargé dans les deux emplacements de l'application via `/api/economic-calendar`.
- Ajout de la redirection Netlify manquante vers la fonction serveur authentifiée `economic-calendar`.
- Filtres interactifs par devise, niveau d'impact et période ; affichage de l'heure du Burkina Faso, des chiffres précédent/prévision/réel, de la source et d'une action de nouvelle tentative.
- TradingView reste accessible comme widget complémentaire repliable sur fond noir ; il n'est pas utilisé comme source de données du moteur d'analyse.
- Le flux macro utilisé par le moteur IA reste indépendant et inchangé.
- Le service OHLC retente une fois les erreurs fournisseur transitoires et peut utiliser un cache récent explicitement signalé comme périmé ; les bougies continuent d'être contrôlées par leur horodatage.
- L'analyse supporte les défaillances partielles : M30 et M15 sont obligatoires ; H4/H1 peuvent manquer avec avertissement ; M5 manquant interdit toute confirmation d'entrée et laisse le résultat en WAIT.
- Le service worker change de version pour invalider le cache PWA précédent.

## Validation locale

- Tests automatisés : 196/196 réussis.
- Build de production : réussi (`dist/` généré).
- Vérification mobile réelle, navigateur réel et PWA installée : à effectuer après déploiement ; non revendiquée dans cette livraison locale.

## Sécurité et périmètre

- Aucun lien broker Exness/MT5 ni aucune exécution d'ordre externe n'a été ajouté.
- Les positions restent suivies uniquement dans AUREVIA COPILOT.
