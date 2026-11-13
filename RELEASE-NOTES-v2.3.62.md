# AUREVIA COPILOT V2.3.62 — Fiabilisation des actions de compte

## Correctifs
- Remplacement des confirmations natives `confirm()` / `prompt()` pour la déliaison Telegram et la suppression du compte par une boîte de dialogue intégrée, utilisable sur mobile et PWA.
- Suppression Telegram vérifiée côté serveur après la requête DELETE ; l’API ne confirme plus la déconnexion sur la seule base d’un code HTTP réussi.
- Nettoyage des codes de liaison Telegram temporaires ; les éventuels échecs de nettoyage sont signalés explicitement.
- L’interface vérifie que le serveur confirme `unlinked: true` et relit l’état de liaison avant d’afficher « déconnecté ».
- Suppression du compte : exige une confirmation intégrée, vérifie `deleted: true`, arrête le heartbeat, invalide l’état local et ferme la session locale sans toucher au compte Google.
- Version du cache PWA incrémentée pour forcer le chargement des fichiers corrigés.

## Sécurité et périmètre
- La déliaison supprime uniquement l’association Telegram de l’utilisateur connecté.
- La suppression vise uniquement l’identité et les données AUREVIA ; elle ne supprime pas le compte Google.
- Aucun ordre broker n’est exécuté.

## Validation
- Validation locale : 201 tests réussis, 0 échec ; build de production réussi.
- Les tests locaux ne remplacent pas un test réel sur téléphone/tablette ni la validation des secrets et services du projet Netlify/Supabase.

\n## Correctif complémentaire V2.3.62a — TradingView\n\n- Le calendrier TradingView est désormais affiché directement, sans devoir ouvrir un accordéon.\n- Le calendrier économique structuré multi-devises reste conservé avec ses filtres et sa source indépendante.\n- TradingView reste un complément visuel et ne remplace pas les données du moteur d’analyse.\n- Le widget est présenté sur fond noir et s'adapte à la largeur disponible.\n