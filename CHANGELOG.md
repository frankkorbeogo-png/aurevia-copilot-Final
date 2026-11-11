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
