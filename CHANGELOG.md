# Journal des modifications

## v2.3.56 — Proposition IA possible sur un seul setup
- Le moteur technique peut désormais présenter un unique scénario BUY ou SELL si une confluence opérationnelle suffisante est détectée sur M30 ou M15.
- Il n’exige plus que plusieurs confirmations réparties entre M30 et M15, ni que les deux directions BUY et SELL produisent chacune un scénario.
- Un signal isolé reste insuffisant : seuil de confluence maintenu, données fraîches obligatoires, niveaux SL/TP cohérents et confirmation M5 toujours nécessaire avant de qualifier une entrée de confirmée.
- Ajout de tests couvrant un seul scénario valide et le rejet d’un indice isolé.


## v2.3.55 — Correctifs compte, Telegram et données macro
- Ajout des routes Netlify manquantes pour la suppression du compte par son propriétaire et le contexte macroéconomique.
- Correction de la liaison Telegram : recherche réelle du code temporaire dans `user_preferences`, contrôle d’expiration et refus des codes ambigus.
- Validation des réponses Telegram lors de l’envoi, journalisation serveur sans exposer les secrets et nettoyage du code temporaire lors d’une déconnexion par `/stop`.
- Confirmation des deux emplacements d’affichage du calendrier dans l’interface et conservation d’un état d’erreur explicite si la source publique est indisponible.
- Ajout de tests de régression pour la liaison Telegram et les routes Netlify.

- La déliaison Telegram passe par une fonction serveur authentifiée qui vérifie la session AUREVIA active et supprime uniquement la liaison de l’utilisateur connecté.
- Nettoyage du code de liaison temporaire dans les préférences ; avertissement explicite si ce nettoyage secondaire échoue.
- L’interface désactive immédiatement le bouton de déliaison et les actions de notification après succès.
- Validation locale : 170 tests automatisés réussis. Build Netlify local réussi ; aucune publication Netlify effectuée.

## V2.3.52 — moteur de scénarios et fond galactique restauré
- Renforcement du moteur de scénarios conditionnels : confluence EMA200, MACD et RSI sur M30/M15 en complément de la structure.
- H4/H1 pondèrent le contexte sans bloquer à eux seuls un scénario intraday.
- WAIT reste réservé à l'absence de déclencheur d'entrée confirmé en M5 ; les scénarios candidats restent visibles séparément.
- Retour au fond animé galactique précédent (canvas d'étoiles et nébuleuses CSS), retrait du plan photo ajouté en V2.3.48/2.3.49.
- Reconstruction de dist/ depuis les sources.
- Validation locale : 169 tests automatisés réussis.

## v2.3.49 — Affinage du fond galaxie
- Remplacement de la texture de nébuleuse basse résolution par un visuel haute définition.
- Réduction du zoom et du mouvement, contraste et saturation harmonisés pour préserver la lisibilité.
- Animation de profondeur ralentie et discrète.

## 2.3.46 — éditeur professionnel de synthèse finale
- Refonte de l’espace « Synthèse finale du scénario » en éditeur de rapport structuré, avec métadonnées, état de brouillon, compteur de caractères et zone d’édition agrandie.
- Ajout d’une structuration guidée du rapport (contexte, confirmations, plan, risques, conclusion) sans inventer de données de marché.
- Brouillon conservé localement et restaurable sur le même appareil.
- Ajout de l’enregistrement manuel via l’API sécurisée des scénarios : seuls les scénarios BUY/SELL réellement identifiés et dotés de niveaux valides peuvent activer la surveillance. Aucun ordre broker n’est exécuté.

## 2.3.43 — suivi au prix simple du marché
- Entrées, TP et SL comparés au dernier prix de marché (`Last Price`), sans dépendance BID/ASK.
- `trade-watch` récupère le prix via Twelve Data REST `/price` lorsque le cache de cotation est absent ou périmé.
- Clôtures internes automatiques au dernier prix observé, avec mention explicite qu’il ne s’agit pas d’une exécution broker et sans prise en compte du spread/slippage.
- Worker WebSocket facultatif pour les mises à jour plus fréquentes.
- Migration complémentaire `20261112190000_market_last_price_mode.sql`.

## 2.3.42 — déclenchement des positions au prix d’entrée

- Ajout du statut EN ATTENTE pour les ordres LIMIT/STOP et activation automatique sur ASK (BUY) ou BID (SELL).
- Gestion séquentielle du STOP LIMIT : franchissement du trigger, puis retour au prix limite.
- Activation transactionnelle Supabase, horodatage/prix d’activation, notification Telegram et synchronisation du journal.
- Surveillance TP/SL sur le côté de sortie (BID pour BUY, ASK pour SELL) et calcul P/L basé sur le prix d’activation.
- Ajout d’un worker WebSocket Twelve Data permanent qui détecte l’activation sur chaque tick, avec table sécurisée de cotations BID/ASK ; aucune substitution par un prix moyen en cas de données manquantes.
- Migration requise : `20261112180000_trade_entry_price_activation.sql`. Worker externe à déployer séparément.
- Vérification : 159 tests réussis ; build réussi. Aucun déploiement Netlify ni application de migration Supabase de production effectué.

## v2.3.32 — Diagnostic sécurisé du bot Telegram

- Ajout d’un contrôle administrateur du token via la méthode officielle Telegram `getMe`.
- Vérification exécutée exclusivement côté serveur avec `TELEGRAM_BOT_TOKEN` ; aucun secret n’est renvoyé au navigateur ou affiché dans le résultat.
- Affichage de la validité du token et de l’identité publique du bot dans la console administrateur.
- Gestion distincte des cas token absent, token invalide et indisponibilité Telegram.
- Tests automatisés ajoutés pour le succès et le refus d’authentification Telegram.

# AUREVIA COPILOT — Changelog

## 2.2.9 — 11 novembre 2026

- Console Administration masquée par défaut et affichée uniquement après une vérification serveur du compte connecté dans `app_private.admin_users` ; l’API vérifie également la session active avant chaque lecture/action.
- Retrait du bootstrap et des commandes de promotion/révocation d’administrateur depuis l’interface : aucun utilisateur ne peut s’auto-promouvoir et aucun autre compte ne peut être promu depuis cette console.
- Console propriétaire : recherche serveur, e-mail, date d’inscription, dernière connexion, dernière activité, statut en ligne par heartbeat, sessions actives, suspension/réactivation, révocation de session, suppression de compte confirmée, statistiques, configuration des services, annonces avec expiration et journal d’audit.
- Mise en place d’un mécanisme de session unique fondé sur l’identifiant de session Supabase et sa date de création ; le rafraîchissement d’un ancien JWT ne peut pas reprendre la session d’un nouvel appareil.
- Heartbeat toutes les 30 secondes ; une session remplacée/révoquée est déconnectée côté application. Les tables personnelles sont protégées par une vérification de session active dans leurs politiques RLS.
- Migration `20261111180000_single_session_and_admin_console_v229.sql` ajoutée à la livraison. Elle n’a pas été appliquée au projet Supabase de production.
- Tests unitaires de sécurité et de gestion de sessions ajoutés. Aucun déploiement Netlify n’a été effectué.

## 2.2.8 — 11 novembre 2026

- Authentification de l’application limitée à Google OAuth : inscription automatique à la première connexion et connexion Google pour les comptes existants.
- Retrait de l’interface et des gestionnaires de connexion email/mot de passe et de création de compte par email.
- Conservation de la session Supabase, du profil, de la déconnexion et des données utilisateur.
- Version de base : archive officielle AUREVIA_COPILOT_V2_2_7_FINAL.zip.

## V2.2.7 — maîtrise du quota Twelve Data
- Suppression des appels Twelve Data automatiques au démarrage de l’application.
- Suppression du chargement OHLC multi-timeframes au démarrage : l’analyse H4/M30/M15/M5/M1 se lance uniquement sur action de l’utilisateur (bouton Analyser ou changement explicite d’instrument).
- Suppression du rafraîchissement automatique des sept cotations au démarrage et chaque minute.
- Affichage d’un état d’attente clair tant qu’aucune analyse n’a été demandée.
- Cache du service worker renouvelé.

## V2.2.6 — finalisation de l’installation PWA
- Ajout des icônes PWA 192×192 et 512×512, d’une icône maskable dédiée et de l’icône Apple Touch 180×180.
- Ajout d’une rubrique Installation détaillée dans Guide & assistance (iPhone/iPad, Android, Windows/macOS).
- Cache du service worker actualisé pour inclure les nouvelles icônes.

## V2.2.5 — analyse M15 et Voie lactée 3D
- M15 devient le timeframe central de l’analyse technique.
- H4 définit le biais, M30 la structure intermédiaire, M15 concentre les confirmations, M5/M1 affinent l’entrée.
- Ajout des historiques OHLC M15 et M1 à l’analyse multi-timeframes et au moteur IA.
- Refonte du fond WebGL : galaxie spirale lointaine, bulbe central lumineux, bras, profondeur et rotation lente.
- Renforcement de la taille des textes et libellés sur l’ensemble de l’application.

# Historique des versions

## 2.2.3 — 11 novembre 2026
- Correction de la structure HTML : chaque espace fonctionnel est désormais une page indépendante ; les rubriques ne restent plus enfermées dans Marchés & Analyse.
- Navigation améliorée : retour à Accueil depuis le logo et prise en charge des changements de fragment d’URL.
- Lisibilité renforcée sur ordinateur et mobile, avec priorité aux formulaires, résultats, indicateurs et tableaux de la partie Analyse.
- Fond galactique remplacé par un rendu WebGL de particules stellaires en profondeur 3D, avec rotation lente, perspective et adaptation aux appareils moins puissants.
- Cache PWA renouvelé pour forcer le chargement des nouveaux fichiers.

## 2.2.2 — 10 novembre 2026
- Console d'administration : vue d'ensemble, gestion paginée des comptes, suspension/réactivation, attribution/révocation administrateur.
- Publication et dépublication des annonces.
- Journal d'audit privé des opérations administrateur.
- Initialisation unique et vérifiée du premier administrateur par adresse serveur.
- Sécurisation des fonctions RPC et ajout des index de clés étrangères manquants.
- Tests de sécurité backend supplémentaires.

## 2.2.1
- Suivi des positions, clôtures partielles et synchronisation au journal.
- Notifications Telegram et test de réception.

## V2.2.4 — corrections interface et cotations
- Même emblème compact dans le profil que dans l’en-tête.
- Ajout d’un parcours d’installation PWA Android/ordinateur et instructions iPhone.
- Suppression de la barre de navigation inférieure sur mobile.
- Ajout de cotations Twelve Data en direct pour or, argent, paires FX et cryptos autorisées.


## 2.2.8 — 11 novembre 2026
- Authentification de l’application limitée au bouton Google ; création automatique du compte au premier accès et demande explicite de sélection du compte Google.
- Identité AUREVIA affichée sur les états connecté et déconnecté de l’écran de profil.
- Ajout du guide de configuration de la marque OAuth Google et d’un visuel carré 512 × 512 optimisé à téléverser dans Google Auth Platform → Branding.
- Journal local : suppression individuelle confirmée, compteur de trades perdants et taux de réussite calculé sur les trades clôturés.
- Tests automatisés supplémentaires sur l’authentification Google et les opérations du journal.


## V2.3.0 — galaxie nébuleuse & alertes de positions AUREVIA
- Renforcement du décor cosmique 3D WebGL et des nébuleuses cyan/violet, avec mouvement ralenti et réduction sur mobile.
- Notifications Telegram pour les positions enregistrées et les clôtures manuelles, selon les préférences de notifications validées.
- Ajout d'une fonction Netlify planifiée de surveillance interne des positions ouvertes : lecture du cours Twelve Data, détection TP/SL, clôture interne, mise à jour du journal et file d'alertes Telegram idempotente.
- Aucun accès broker, aucun ordre exécuté ; le prix observé est un déclencheur interne AUREVIA et non une confirmation d'exécution externe.
- Nouvelle migration SQL de registre d'alertes ; elle doit être appliquée explicitement en environnement Supabase après revue.

## V2.3.1 — corrections en cours
- Ajout d’un bouton « Analyser le marché » réellement relié au chargement des cinq unités de temps, avec état de chargement accessible.
- Horaires des sessions convertis vers l’heure du Burkina Faso (UTC+0) en utilisant les fuseaux IANA afin de suivre automatiquement les changements d’heure de Londres et New York.
- Calendrier économique forcé en thème sombre opaque et agrandi sur ordinateur et mobile.
- Début de restauration des positions et du journal liés depuis Supabase à l’ouverture d’une session, en conservant les fiches locales distinctes.
- Les tests automatisés couvrent désormais le bouton d’analyse et l’affichage des sessions en heure du Burkina Faso.
- Les historiques H4/M30/M15/M5/M1 sont maintenant demandés en parallèle afin de réduire le délai total et le risque que les bougies M1 deviennent périmées avant la décision.
- Ajout de la modification des niveaux entrée/SL/TP pour un groupe ouvert n'ayant encore aucune clôture ; synchronisation des niveaux de position et de journal.
- Ajout de la suppression confirmée des groupes entièrement clôturés et de leurs fiches liées, avec contrôle du statut côté Supabase.
- Le journal renseigne désormais explicitement le nombre de trades perdants dans la statistique prévue par l'interface.
- Migration Supabase V2.3.1 ajoutée pour conserver le pas de lot et les niveaux d'entrée/SL/TP dans le journal lié.

## V2.3.2 — clôtures cloud atomiques (en cours)
- Remplacement de la séquence client multi-requêtes de clôture par une RPC Supabase transactionnelle `aurevia_record_position_close`.
- Verrouillage de la position pendant l'enregistrement, validation du volume restant, insertion idempotente par identifiant de clôture et recalcul des P/L depuis les événements de clôture persistés.
- Mise à jour atomique du journal lié (position unique ou trades séparés) et du statut du groupe.
- Ajout de la migration `20261112100000_atomic_position_close_v232.sql` et d'un test de non-régression.
- Migration à appliquer et à tester sur un projet Supabase de préproduction avant toute mise en production.

## V2.3.3 — base du contexte macro XAU/USD (en cours)
- Ajout d'une fonction serveur authentifiée `macro-context` connectée à FRED pour récupérer les dernières observations disponibles du dollar pondéré, des rendements nominaux/réels à 10 ans, du taux effectif des Fed funds, du CPI et du chômage.
- Transmission du contexte macro structuré au moteur IA pour l'analyse XAU/USD, avec dates d'observation et consignes strictes sur les délais de publication.
- Si `FRED_API_KEY` est absent ou le fournisseur indisponible, AUREVIA indique explicitement que le contexte macro est indisponible et ne fabrique aucune donnée.
- Cette intégration fournit des séries macro historiques/retardées, pas un calendrier des prochaines annonces ni un flux économique temps réel.


## V2.3.4 — clôtures automatiques TP/SL transactionnelles (en cours)
- Correction du chemin de surveillance planifiée : les déclenchements TP/SL utilisent désormais une RPC SQL dédiée au rôle serveur.
- Une seule transaction enregistre l'événement de clôture, recalcule la position, synchronise le journal lié et met à jour le groupe.
- La RPC worker est réservée à `service_role`; elle n'est pas exécutable par les clients `anon` ou `authenticated`.
- La migration `20261112120000_atomic_worker_position_close_v234.sql` doit être appliquée en préproduction avant tout déploiement.


## V2.3.5 — garde-fous de calcul P/L pour la surveillance automatique (en cours)
- La surveillance TP/SL refuse désormais de clôturer une position si le volume, le prix d'entrée, la taille de contrat, le taux de conversion ou les frais nécessaires au calcul sont absents ou invalides.
- Suppression du repli silencieux à un P/L nul lorsque les métadonnées de conversion/contrat manquent : la position reste ouverte et l'erreur est journalisée pour correction.
- Validation SQL du résultat net : `net_pnl` doit correspondre à `gross_pnl - fees`.
- Tests de non-régression BUY/SELL et données manquantes.
- À vérifier en préproduction avec les tailles de contrat et devises de compte réellement configurées ; aucun déploiement effectué.

## V2.3.6 — cohérence entre clôture effective et notification
- Correction d'un cas où une alerte TP/SL créée avant le calcul P/L pouvait rester en attente et être envoyée alors que la clôture avait été suspendue faute de métadonnées valides.
- Si le calcul P/L échoue avant l'appel transactionnel, l'événement d'alerte est annulé explicitement ; aucune notification de clôture n'est envoyée pour une position qui reste ouverte.
- Après correction des métadonnées, un nouveau passage de surveillance peut créer un nouvel événement et retenter proprement.
- Ajout d'un test de non-régression couvrant cette incohérence.

## V2.3.7 — gestion des notifications Telegram désactivées
- Une notification non souhaitée (chat Telegram non relié ou notifications de signaux désactivées) est désormais classée `cancelled` au lieu d'être remise indéfiniment en attente.
- Les erreurs temporaires d'envoi restent réessayables ; seuls les cas de désactivation explicite sont neutralisés.
- Évite les boucles de reprise inutiles et la consommation répétée de ressources serveur pour des alertes que l'utilisateur ne souhaite pas recevoir.


## V2.3.9 — confirmation du registre avant notification TP/SL
- Le worker Telegram vérifie maintenant l'existence de la ligne `trading_position_closes` correspondant exactement à l'identifiant d'alerte, à la position et à l'utilisateur avant tout envoi.
- Le message utilise le volume et le prix de sortie persistés par la transaction, et non les valeurs provisoires du déclenchement.
- Si la transaction de clôture échoue ou si sa réponse réseau est ambiguë, l'alerte reste en attente ; elle n'annonce jamais une clôture non confirmée.
- Test de non-régression ajouté pour empêcher toute notification sans preuve dans le registre de clôture.


## V2.3.10 — garde-fous des seuils de surveillance
- La surveillance ignore désormais une cotation non numérique ou non positive, un SL/TP absent ou invalide, ainsi qu'une direction autre que BUY/SELL.
- Empêche qu'une valeur manquante convertie implicitement en zéro déclenche une clôture TP/SL erronée.
- Test de non-régression couvrant les niveaux absents, cotations invalides et directions inconnues.

## V2.3.11 — séparation DXY et calendrier macro structuré (candidat)
- Le contexte macro distingue explicitement le véritable symbole DXY (tentative de cotation via Twelve Data) de l'indice large du dollar FRED `DTWEXBGS`; l'indice large n'est plus présenté comme le DXY.
- Ajout d'un adaptateur serveur Trading Economics pour les événements économiques américains avec Actual, Forecast, Previous, importance et date, transmis au moteur IA.
- Le prompt IA interdit de traiter un Actual vide comme une publication, d'inventer les valeurs et d'assimiler les séries FRED retardées à des données temps réel.
- Variables serveur requises : `TWELVEDATA_API_KEY` (déjà utilisée pour OHLC), `TRADING_ECONOMICS_API_KEY` et facultativement `FRED_API_KEY`.
- La disponibilité effective du symbole DXY et les droits d'accès Trading Economics dépendent des contrats fournisseur; si l'une des sources échoue, l'API renvoie explicitement `configured:false` pour cette source.


## V2.3.12 — calendrier économique gratuit ShowMyTrades (candidat)
- Remplacement de l'adaptateur Trading Economics payant par l'API publique JSON ShowMyTrades, sans clé ni compte.
- Récupération des événements USD d'importance élevée et moyenne sur 7 jours, avec date UTC, Actual, Forecast, Previous, statut, identifiant stable et niveau de confiance.
- La réponse conserve l'heure serveur, l'horodatage de génération et les informations d'attribution du fournisseur.
- Suppression de `TRADING_ECONOMICS_API_KEY` des variables d'environnement requises.
- Ajout d'un test simulé vérifiant l'endpoint, les filtres USD et la normalisation des événements.
- Les données réelles du fournisseur restent à valider en environnement déployé ; le calendrier annonce un cache d'environ 15 minutes et ne garantit pas l'exhaustivité.


## V2.3.13 — Calendrier économique natif ShowMyTrades
- Remplacement du widget calendrier TradingView par une intégration directe de l'API JSON publique ShowMyTrades (USD, impacts high/medium, horizon 7 jours).
- Affichage dans les deux emplacements AUREVIA : heure convertie en heure du Burkina Faso, impact, événement, précédent, prévision, réel, changements d'horaire et niveau de confiance lorsque fourni.
- Rafraîchissement partagé toutes les 15 minutes afin d'éviter les appels en double entre les deux vues.
- Affichage explicite d'une indisponibilité sans fabriquer d'événements ou de valeurs ; contenu distant injecté via textContent pour éviter l'interprétation HTML.
- Aucun secret ni nouvelle variable Netlify requis pour ShowMyTrades.
- Validation automatisée : tests du projet et build ; accès réseau direct au fournisseur non vérifiable depuis l'environnement de développement, donc test réel après déploiement toujours requis.

## V2.3.14 — Résilience et fraîcheur des séries FRED
- Chaque série FRED est maintenant récupérée et traitée indépendamment : l'échec d'un indicateur ne masque plus les autres séries disponibles.
- Les observations exposent la dernière valeur, la précédente, la date, l'ancienneté en jours et un état de fraîcheur indicatif adapté à la fréquence de chaque série.
- Le moteur IA reçoit des consignes explicites pour ignorer les séries indisponibles et signaler les observations anciennes sans les présenter comme actuelles.
- Ajout d'un test couvrant la panne partielle FRED et la fraîcheur des données.

## V2.3.15 — Qualité et horodatage DXY
- Remplacement de l'appel Twelve Data `/price` par `/quote` afin de récupérer les métadonnées de cotation et son horodatage (`last_quote_at` / `timestamp`).
- Ajout de `ageMinutes` et d'un état de fraîcheur (`recent`, `stale`, `unknown`) ; une cotation ancienne ou non horodatée n'est plus présentée comme actuelle.
- L'analyse IA reçoit la règle explicite de prudence sur la fraîcheur du DXY.
- Le DXY reste distinct de l'indice large du dollar FRED (`DTWEXBGS`).
- Vérification automatisée : 127 tests réussis. Les appels fournisseurs réels restent à valider avec les clés et le déploiement Netlify.

## V2.3.16 — Validation renforcée des propositions IA
- Les niveaux d'entrée, de stop-loss et de take-profit doivent être de véritables nombres positifs (les valeurs `null` ne sont plus converties implicitement en zéro).
- Les objectifs TP doivent être ordonnés dans le sens du trade et rester cohérents avec le prix d'entrée.
- Les ordres LIMIT/STOP refusent les champs de déclenchement/limite incompatibles avec leur type.
- Les ordres STOP LIMIT conservent leurs deux prix distincts et leur relation directionnelle.
- Une proposition incohérente est ramenée à WAIT avec suppression des niveaux proposés.
- Tests automatisés et build à revalider avant livraison.

## V2.3.17 — synchronisation transactionnelle locale position / journal
- La persistance d'une position synchronise désormais les détails de la fiche journal liée : entrée, SL, TP, volume initial/restant, frais, clôtures, P/L réalisé et statut.
- Le mode Position unique conserve une seule fiche parent et met à jour le résultat cumulé et les volumes restants ; le mode Trades séparés synchronise chaque enfant.
- Si l'écriture du journal échoue après l'écriture de la position, l'état précédent de la position locale est restauré afin d'éviter une divergence silencieuse.
- Ajout de tests de non-régression pour les mises à jour des clôtures partielles et le rollback en cas d'échec de synchronisation.


## V2.3.18 — Authentification Google obligatoire et synchronisation Supabase

- Ajout d'un écran de verrouillage global : aucun espace AUREVIA n'est visible ou interactif sans session Google validée et session AUREVIA active.
- Le bouton Google est disponible directement sur l'écran de verrouillage, sur ordinateur, tablette et téléphone.
- L'application ne démarre ses modules métier (journal, positions, calendrier, widgets et restauration locale) qu'après authentification validée.
- À la déconnexion, au remplacement de session ou à l'échec du contrôle serveur, l'application est reverrouillée.
- Les migrations SQL V2.3.1 à V2.3.4 ont été appliquées au projet Supabase Aurevia-copilot et leur présence a été confirmée dans l'historique.
- Le cache PWA est versionné en V2.3.18 pour éviter de conserver l'ancien écran de démarrage.
- Aucun déploiement Netlify effectué.


## V2.3.19 — Nébuleuse cosmique cyan / turquoise / violet / magenta
- Renforcement du fond spatial avec des nuages cosmiques en dégradés multicouches inspirés de la référence visuelle fournie.
- Animation lente de dérive et de profondeur, étoiles WebGL conservées.
- Vignettage allégé pour laisser apparaître les couleurs tout en préservant le contraste des interfaces.
- Adaptation mobile et respect du réglage de réduction des animations.


## V2.3.20 — Parcours de compte distincts
- Séparation visible des actions « Se connecter avec Google » et « Créer un compte » sur l’écran de verrouillage et dans les paramètres.
- Lors d’une demande d’inscription, vérification après retour Google de la date de création du compte : si l’adresse est déjà associée à un compte AUREVIA, l’accès est refusé et l’utilisateur est invité à se connecter.
- Google/Supabase conserve l’unicité de l’identité liée à l’adresse Google ; aucun second compte n’est créé pour la même identité.


## V2.3.21 — Révocation avant suppression de compte
- La suppression d’un compte utilisateur depuis la console admin révoque désormais d’abord sa session AUREVIA, puis supprime son identité Supabase Auth.
- Les API protégées continuent de vérifier l’identité Google et la session active côté serveur ; une identité supprimée ne peut plus accéder aux fonctionnalités.
- L’écran de verrouillage reste imposé après déconnexion, remplacement de session ou échec de validation.


## V2.3.22 — Suppression autonome du compte
- Ajout d’une action de suppression définitive du compte AUREVIA dans Paramètres & profil.
- Double confirmation explicite, contrôle de session côté serveur et suppression de l’identité Supabase Auth par le backend.
- Déconnexion locale et verrouillage immédiat de l’application après suppression. Le compte Google externe n’est jamais supprimé.


## V2.3.23 — Protection des flux de marché
- Les endpoints OHLC, cotations et statut des services exigent désormais un JWT Google valide et une session AUREVIA active.
- Le quota des historiques OHLC est appliqué par utilisateur authentifié plutôt que par adresse IP.
- Les appels clients transmettent le jeton de session aux trois endpoints.


## V2.3.24 — Correction du retour après authentification Google
- Correction du parcours OAuth : au rechargement après retour Google, la session Supabase restaurée est désormais revendiquée (`claim`) auprès du serveur AUREVIA avant de déverrouiller l’application.
- Le contrôle précédent utilisait `heartbeat` pour une session qui n’avait pas encore été enregistrée côté AUREVIA, ce qui pouvait refuser l’accès et laisser l’écran de connexion affiché.
- Les contrôles de session unique restent actifs : une session plus ancienne ne peut pas remplacer une session plus récente.


## V2.3.25 — Réparation du claim OAuth et inscription obligatoire
- Correction de `aurevia_session_touch` : une première session Google vérifiée peut être enregistrée même si la ligne `auth.sessions` n'est pas encore visible ; les heartbeats exigent toujours une session AUREVIA déjà enregistrée.
- La restauration d'une session déjà connue utilise désormais `heartbeat` et ne peut pas reprendre la place d'un autre appareil ; une nouvelle authentification explicite utilise `claim`.
- Le bouton « Se connecter » refuse une identité qui vient d'être créée par cette tentative et supprime uniquement ce compte temporaire, après vérification serveur de sa date de création.
- Le bouton « Créer un compte » continue de refuser les identités Google déjà inscrites.
- Ajout de l'endpoint Netlify `/api/account-reject-new-login` et de tests ciblés.
- Migration SQL `20261112130000_fix_google_oauth_session_claim_v235.sql` ajoutée et fonction équivalente appliquée au projet Supabase de production.


## V2.3.26 — Diagnostic et reprise de session Google
- Une erreur temporaire du service de validation ne supprime plus automatiquement la session Google locale.
- L’accès reste verrouillé tant que la validation serveur n’a pas réussi ; un bouton permet de relancer la vérification.
- Le message d’erreur indique désormais le statut et le motif retourné par l’API, sans exposer de jeton.
- Les erreurs serveur de session sont consignées côté fonction Netlify pour diagnostic.
- Le parcours « Se connecter » traite explicitement le cas d’un compte Auth créé pendant une tentative de connexion et appelle le refus serveur prévu.

## 2.3.29 — Scénarios BUY/SELL anticipatifs

- M30 et M15 deviennent les unités principales pour la direction et la structure (BOS/CHoCH).
- H4 devient un contexte supérieur/filtre de cohérence, sans bloquer seul un scénario M30/M15 valide.
- M5/M1 servent uniquement à préciser et confirmer le point d'entrée.
- L'IA retourne deux scénarios conditionnels indépendants, BUY et SELL, même avant déclencheur M5/M1.
- L'interface affiche les scénarios identifiés, leurs zones, SL/TP, conditions d'activation et invalidation.
- Les scénarios incomplets, incohérents ou hors de l'historique analysé sont rejetés.

## V2.3.44 — Refonte initiale du contexte multi-timeframe
- Ajout du chargement OHLC H4 et H1 dans le moteur d'analyse, en complément de M30/M15/M5.
- H4 et H1 participent désormais au score de confluence (20 points cumulés) et les conflits de contexte sont explicitement signalés sans blocage mécanique.
- Extension des tableaux, cartes de structure et détection de figures à H4/H1.
- Clarification de l'affichage : score de confluence sur 100, jamais présenté comme une probabilité statistique.
- Prompt IA mis à jour pour confronter H4/H1 à la structure opérationnelle M30/M15 et conserver M5 comme déclencheur d'entrée.
- Compatibilité conservée pour les appels historiques du endpoint IA où H4/H1 ne sont pas fournis.

## V2.3.45 — Génération autonome des scénarios candidats
- Ajout d’un moteur technique déterministe BUY/SELL indépendant de la réponse IA.
- Calcul de scénarios candidats à partir des biais H4/H1/M30/M15/M5, EMA200, MACD, RSI, BOS/CHoCH, sweeps et ATR.
- Affichage des scénarios candidats même si le service IA est indisponible ; l’IA peut les compléter mais une réponse vide ne les efface plus.
- Distinction explicite entre score de confluence et probabilité statistique.
- Les scénarios sont indicatifs, restent soumis à validation et ne déclenchent aucun ordre broker.
- Ajout de tests dédiés à la génération, aux données périmées et à l’absence de contexte directionnel.

## V2.3.47 — calendrier économique et fermeture du formulaire journal
- Le calendrier USD passe par une fonction Netlify serveur authentifiée afin d’éviter les blocages CORS du navigateur et d’unifier les données des deux vues.
- Ajout d’un état d’erreur explicite et d’un bouton Réessayer ; aucune donnée économique n’est inventée.
- La fenêtre « Ajouter un trade clôturé » possède une fermeture explicite, une fermeture par clic sur l’arrière-plan et une remise à zéro sûre du formulaire à la fermeture.

## v2.3.50 — calendrier économique, horloge et analyse moins bloquante
- Horloge et date du Burkina Faso initialisées dès le démarrage de l’interface, indépendamment de l’authentification ; affichage actualisé chaque seconde.
- Calendrier économique remis sous forme de tableau classique avec date/heure, devise, impact, événement, précédent, prévision et réel, filtres par devise/impact/période.
- Source calendrier élargie à toutes les devises et aux impacts élevé, moyen et faible sur 14 jours ; le moteur IA et les connexions serveur existantes restent conservés.
- Les horodatages H4/H1 périmés ou invérifiables ne bloquent plus à eux seuls l’appel IA ni la génération des scénarios candidats ; la fraîcheur M30/M15 reste exigée pour l’analyse opérationnelle.
- Le statut global reste WAIT tant que le déclencheur M5 n’est pas confirmé ; les scénarios potentiels doivent rester visibles séparément.
- Tests automatisés : 162 réussis ; build Netlify local réussi. Aucune publication Netlify ni migration Supabase exécutée.

## v2.3.50 — calendrier économique, horloge et analyse moins bloquante
- Horloge et date du Burkina Faso initialisées dès le démarrage de l’interface, indépendamment de l’authentification ; affichage actualisé chaque seconde.
- Calendrier économique remis sous forme de tableau classique avec date/heure, devise, impact, événement, précédent, prévision et réel, filtres par devise/impact/période.
- Source calendrier élargie à toutes les devises et aux impacts élevé, moyen et faible sur 14 jours ; le moteur IA et les connexions serveur existantes restent conservés.
- Les horodatages H4/H1 périmés ou invérifiables ne bloquent plus à eux seuls l’appel IA ni la génération des scénarios candidats ; la fraîcheur M30/M15 reste exigée pour l’analyse opérationnelle.
- Le statut global reste WAIT tant que le déclencheur M5 n’est pas confirmé ; les scénarios potentiels doivent rester visibles séparément.
- Tests automatisés : 162 réussis ; build Netlify local réussi. Aucune publication Netlify ni migration Supabase exécutée.


## V2.3.54 — Déconnexion Telegram depuis le bot
- Ajout des commandes `/stop`, `/disconnect` et `/deconnecter` pour arrêter les notifications directement dans la conversation Telegram.
- Suppression de la liaison correspondant au chat privé uniquement, avec confirmation envoyée par le bot.
- Conservation de la possibilité de délier Telegram depuis les paramètres AUREVIA.


## V2.3.57 — Scénario conditionnel avec type d’ordre anticipé
- Chaque scénario potentiel identifie la zone de prix à attendre avant la confirmation M5.
- Déduit un type d’ordre en attente cohérent avec la position de la zone par rapport au dernier cours M5 : BUY/SELL LIMIT ou BUY/SELL STOP.
- Affiche le niveau de déclenchement ou le prix limite, ainsi que la logique de choix.
- Maintient la distinction entre scénario potentiel, déclencheur confirmé et décision globale ; aucun ordre broker n’est envoyé.

## V2.3.58 — Correctifs de reconnexion et scénarios IA chiffrés

- Affichage du calendrier économique TradingView historique dans la page dédiée ; le flux structuré serveur reste distinct pour le moteur d'analyse.
- Les plans BUY et SELL restent visibles avec niveaux calculés depuis le dernier cours et l'ATR, même sans déclencheur immédiat.
- Distinction explicite entre plan indicatif WATCH et scénario identifié ; aucune probabilité statistique n'est inventée.
- Après déliaison Telegram, les commandes de reconnexion, préférences et test sont réactivables ; contrôle de liaison après génération du code.
- Correction du texte de suppression de compte pour préciser que le compte Google personnel n'est pas supprimé.


## V2.3.59 — Suppression personnelle du compte
- Correction du parcours de suppression personnelle : validation de l'identité via le jeton Supabase Auth, sans dépendre du heartbeat de session active.
- Le serveur supprime exclusivement l'identifiant utilisateur authentifié et exige toujours la confirmation explicite `SUPPRIMER`.
- Ajout de tests de régression dédiés à la sécurité et à la confirmation.


## V2.3.60 — Calendrier TradingView noir
- Calendrier économique TradingView forcé en thème sombre avec fond transparent sur un conteneur noir pur (#000000).
- Conservation du calendrier structuré indépendant utilisé par le moteur IA.


## V2.3.61 — Calendrier structuré et résilience des flux
- Rétablissement du calendrier économique structuré dans les deux emplacements de l’application, avec filtres devise/impact/période et erreurs explicites.
- TradingView reste disponible en complément repliable sur fond noir ; il ne remplace pas le calendrier structuré.
- Le calendrier d’affichage reste indépendant des sources macro du moteur d’analyse.
- Le flux OHLC réessaie une fois les erreurs transitoires et peut restituer un cache récent explicitement marqué périmé.
- L’analyse tolère l’absence de H4/H1/M5 sans inventer de données ; M30/M15 restent obligatoires, et M5 reste obligatoire pour confirmer une entrée.
- Version du cache PWA incrémentée pour forcer le chargement des nouveaux fichiers.
