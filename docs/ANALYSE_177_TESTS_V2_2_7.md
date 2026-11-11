# AUREVIA COPILOT — Analyse du bilan des 177 tests V2.2.7

Date de consolidation : 11 novembre 2026  
Périmètre : résultats communiqués par l'utilisateur pour V2.2.7. Les tests automatisés du projet V2.2.8 sont un jeu distinct et ne remplacent pas ces 177 essais fonctionnels.

## 1. Synthèse chiffrée

| État | Nombre | Part du total |
|---|---:|---:|
| Valide | 87 | 49,2 % |
| Non valide | 35 | 19,8 % |
| Non testé | 13 | 7,3 % |
| Non applicable | 42 | 23,7 % |
| **Total** | **177** | **100 %** |

Sur les 122 tests effectivement exécutés et applicables (87 valides + 35 non valides), 71,3 % sont valides et 28,7 % sont non valides. Les 13 non testés ne doivent être comptés ni comme réussis ni comme échoués. Les 42 non applicables sont exclus du taux de réussite.

## 2. Corrections classées par priorité

### P0 — Bloquants : marché, analyse et accès

1. **Twelve Data / quota et chargements** — tests 3, 6, 8, 42–45. Les erreurs montrent des appels trop fréquents ou des chargements fragiles. Ne jamais lancer cinq historiques multi-timeframes et plusieurs cotations au démarrage. Charger les OHLC à la demande, mutualiser les requêtes, mettre en cache côté serveur, limiter les appels concurrents, temporiser les erreurs 429 et afficher clairement « quota atteint / réessayer dans… ». Ne jamais convertir une panne de fournisseur en signal BUY/SELL.
2. **Authentification** — test 10. Le retour `localhost` indique une URL de redirection OAuth mal configurée pour la production. L'interface V2.2.8 est prévue en Google OAuth uniquement ; vérifier le domaine Netlify, les URL de redirection Supabase et le callback Google Cloud en environnement réel avant de désactiver le fournisseur Email.
3. **Analyse non accessible / absence de scénarios** — tests 63, 68–73, 92. Le bouton Analyser doit être visible et déclencher la séquence. WAIT est un résultat de sécurité acceptable si les données sont insuffisantes ; il ne faut pas fabriquer un scénario. L'écran doit expliquer précisément quelle unité de temps ou quelle confirmation manque et proposer de réessayer.
4. **Instruments manquants** — tests 46–50. Comparer la liste d'instruments affichée à la liste autorisée et vérifier les symboles Twelve Data réellement pris en charge. Un instrument non disponible doit être désactivé avec une explication, pas disparaître silencieusement.

### P1 — Données financières et gestion des positions

1. **Formulaire d'ordre** — test 105 : choix de l'instrument obligatoire ; champs dynamiques selon Marché, Limit, Stop ou Stop Limit ; validation des prix de déclenchement et de limite.
2. **Édition et sortie du formulaire** — tests 40 et 116 : permettre de fermer/annuler le formulaire sans le remplir ; ajouter une édition sécurisée des positions ouvertes, avec historique des modifications.
3. **Synchronisation cloud** — test 123 : la sauvegarde Supabase doit être vérifiée, restaurée au démarrage et après connexion, et isolée par `user_id` via RLS. Une sauvegarde locale ne doit jamais être annoncée comme synchronisée.
4. **Clôture et journal liés** — test 124 : une position clôturée disparaît du suivi actif, reste consultable dans l'historique, et alimente le journal avec heure, volume clôturé, prix de sortie, frais et résultat net.
5. **Calcul P/L** — test 123 : utiliser les spécifications de contrat par instrument, taille de contrat, volume réellement clôturé, conversion de devise, commission et swap si connus. Si un paramètre est absent, afficher « estimation » et ne pas présenter un résultat approximatif comme le résultat broker exact.
6. **Statistiques** — test 127 : distinguer gagnants, perdants, break-even, trades ouverts, résultat net et taux de réussite calculé uniquement sur les trades clôturés.

### P2 — Ergonomie et macroéconomie

1. **Responsive galaxie** — test 25 : réduire le coût WebGL sur téléphone/tablette, gérer `prefers-reduced-motion`, redimensionnement et reprise après changement d'orientation.
2. **Lisibilité** — test 39 : augmenter tailles de police, contrastes, zones tactiles et espacement, en particulier sur mobile.
3. **Calendrier économique** — test 129 : fond sombre/noir, typographie plus grande, colonnes adaptées au mobile.
4. **Valeurs du calendrier** — tests 134–136 : libeller explicitement Précédent, Prévision et Réel, avec ordre constant et unité.
5. **Informations macro absentes** — tests 139–140 : afficher source, heure, devise, importance, définition, résultat, écart au consensus et interprétation conditionnelle pour USD/XAUUSD. En absence de données, afficher l'indisponibilité au lieu d'un panneau vide.

## 3. Éléments déjà intégrés dans la base V2.2.8 à revalider

- Démarrage sans rafale automatique de requêtes Twelve Data ; historiques OHLC chargés à la demande.
- Authentification Google dans l'interface, avec création automatique au premier accès.
- Options Position unique / Trades séparés, clôtures partielles, liens de journal et calcul P/L paramétré par contrat dans les modules de gestion.
- Suppression individuelle des fiches de journal local et statistiques gagnants/perdants.
- Guide d'installation PWA et documentation d'identité Google OAuth.

Ces éléments sont des changements de code et tests unitaires ; ils ne constituent pas une validation fonctionnelle de chaque parcours sur Netlify, iOS, Android et Supabase.

## 4. Tests non exécutés à compléter

Tests : 11–18, 51, 102–104, 113. Ils doivent être rejoués après déploiement sur au moins un téléphone, une tablette et un ordinateur, avec un compte Google utilisateur normal et une session fraîche. Consigner appareil, navigateur, date, résultat observé et capture en cas d'échec.

## 5. Non-applicables

Tests : 64–67, 74–81, 89–91, 128, 142–166, 177. Les conserver comme non applicables tant que le périmètre de test n'a pas changé ; ne pas les convertir artificiellement en tests réussis.

## 6. Ordre de validation recommandé

1. Déployer sur une URL de préproduction et vérifier le retour Google OAuth.
2. Vérifier le démarrage sans consommation Twelve Data et exécuter une analyse manuelle avec données disponibles puis avec quota dépassé.
3. Rejouer le formulaire sur les 14 instruments et les 7 unités de temps, ainsi que les 6 types d'ordres en attente.
4. Créer une position en mode unique puis séparé ; faire une clôture partielle puis totale ; vérifier le journal et les timestamps.
5. Se déconnecter/reconnecter et ouvrir le compte sur un second appareil pour vérifier la restauration cloud.
6. Comparer le P/L à un relevé broker avec les mêmes paramètres de contrat et frais.
7. Tester le calendrier, le responsive et les états d'erreur sur mobile/tablette/ordinateur.
8. Rejouer les 13 tests non testés et reclasser chaque test avec preuve.

## 7. Limites de cette livraison

- Les 82 tests automatisés du projet V2.2.8 passent localement et la compilation de production réussit. Ce résultat ne signifie pas que les 177 tests manuels sont tous corrigés.
- La base Supabase associée possède les tables de positions, clôtures, groupes et journal avec RLS et politiques propriétaires. Au moment de la vérification, les tables de suivi de trading sont vides ; la restauration de données multi-appareils doit donc encore être validée avec un compte utilisateur réel.
- Les tests OAuth Google nécessitent une vérification sur le domaine publié et la configuration Google Cloud/Supabase réelle.
- Les données de calendrier externes et les limites de crédits Twelve Data restent dépendantes des fournisseurs et du plan souscrit.
