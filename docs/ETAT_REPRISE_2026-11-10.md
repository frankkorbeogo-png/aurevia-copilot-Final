# AUREVIA COPILOT V2.2 MAJ — état consolidé

Dernière mise à jour : 10 novembre 2026.

## Identité et interface

- Univers bleu nuit, nébuleuses bleu-violet, profondeur d'étoiles et mouvement lent en perspective 3D.
- Logo source approuvé conservé dans `assets/aurevia-logo-full.png` ; emblème dans `assets/aurevia-logo-mark.png`, icône PWA et favicon assortis.
- Logo de marque dans l'en-tête et le panneau de connexion ; badge flottant inférieur gauche absent sur PC, tablette et mobile.
- Onze espaces : Accueil, Marchés & analyse, Gestion du capital, Journal, Telegram, Suivi des positions, DXY & macro, Calendrier économique, Paramètres & profil, Guide & assistance, Administration.
- Navigation adaptée aux écrans étroits ; animation réduite via préférence locale ou préférence système.
- PWA : `manifest.webmanifest` et `sw.js` ; cache des ressources statiques uniquement, jamais des réponses API privées.

## Analyse de marché

- Historiques Twelve Data H4/M30/M5, horodatage/fraîcheur vérifiés.
- Indicateurs EMA20/50/100/200, RSI14, MACD, Bollinger, ATR14.
- Structure HH/HL, LL/LH, BOS/CHoCH confirmés par clôture, sweeps avec réintégration, FVG et candidats Order Block.
- Figures de chandeliers et figures chartistes potentielles ; elles restent descriptives et doivent être confirmées par le contexte.
- Fibonacci 38,2/50/61,8 sur swings confirmés.
- Volume Profile fixe approximé à partir des volumes OHLCV ; POC, VAL, VAH et méthode signalée. Pas de volume synthétique lorsque le fournisseur n'en fournit pas.
- Score de confluence explicable : cinq critères de 20 points (structure H4, prix/EMA200 H4, BOS/CHoCH M30, sweep M5 cohérent, confirmation BOS/CHoCH M5). Ce score n'est pas une probabilité statistique.
- La probabilité estimée reste non calibrée et n'est jamais fabriquée. WAIT si les données, la fraîcheur ou les confirmations ne suffisent pas.
- Le plan IA affiche le type d'ordre, entrée, déclenchement, limite, SL, TP et invalidation seulement si le backend valide les niveaux et leur cohérence.

## Risque, positions et journal

- Calculateur basé sur un montant fixe à risquer ; solde informatif ; volume arrondi vers le bas au pas broker ; gain, R/R et marge uniquement avec les données nécessaires.
- Modes Position unique et Trades séparés ; TP1/TP2/TP3 ; journal automatique activé par défaut mais désactivable.
- Position unique : volume total réparti ; pour 0,10 lot, 3 TP et pas 0,01 : 0,03 + 0,03 + 0,04. Une fiche parent journal.
- Trades séparés : lot complet appliqué à chaque TP ; une fiche par trade.
- Clôtures partielles : volume réellement exécuté, volume restant, prix de sortie, contrat, conversion et frais ; synchronisation du résultat cumulé au journal.
- Le journal agrège les trades manuels et les fiches liées aux positions dans ses statistiques.
- Pas d'exécution broker/MT5.

## Backend et comptes

- Groq Chat Completions : `GROQ_API_KEY`, modèle par défaut `openai/gpt-oss-120b`.
- Twelve Data : `TWELVEDATA_API_KEY`, whitelist d'instruments et d'intervalles, normalisation OHLC, cache court.
- Fonction `/api/service-status` : indique seulement si les variables serveur sont configurées ; ne divulgue aucune clé.
- Supabase Auth via clé publishable ; service-role uniquement dans les fonctions Netlify. Lien administrateur masqué par défaut et affiché seulement pour un profil ayant le rôle serveur admin.
- Migration `20261110170930_add_trading_position_tracking` vérifiée dans l'historique distant ; tables et colonnes présentes ; RLS propriétaire vérifiée sur les trois tables de suivi.
- Telegram : code de liaison à usage court, conversations privées uniquement, vérification JWT pour les notifications utilisateur, vérification d'unicité du propriétaire du chat, chat résolu côté serveur, pas de chat_id fourni par le navigateur. Limites de requêtes ajoutées sur les fonctions de marché et d'analyse IA ; l'analyse IA exige une session Supabase valide.
- Le webhook doit encore être enregistré dans Telegram après déploiement ; les secrets ne sont pas dans l'archive.

## Validation effectuée dans le dossier

- `npm test` : 62 tests réussis, 0 échec.
- Syntaxe Node vérifiée pour les modules client, fonctions Netlify et tests.
- HTML : 172 identifiants uniques, aucun doublon ; références DOM directes de `app.js`, `auth.js` et `galaxy.js` résolues ; 11 espaces de navigation.
- Manifest PWA valide et icône présente.
- Aucune clé secrète réelle incluse ; `.env.example` contient uniquement des valeurs vides.
- Supabase : migration listée comme appliquée ; colonnes attendues et politiques RLS propriétaires confirmées.

## Limites restantes avant production

- Aucun appel réel aux fournisseurs Groq/Twelve Data/Telegram : les secrets Netlify ne sont pas présents dans le dossier local.
- Capture navigateur multi-écrans non validée : le navigateur headless de cet environnement a expiré pendant le rendu ; ne pas présenter cela comme un test visuel réussi.
- Pas de déploiement Netlify depuis cette session : aucun accès/connecteur Netlify n'est disponible. Le ZIP peut être préparé, mais l'URL définitive et les variables d'environnement doivent être configurées dans le compte Netlify.
- Le widget calendrier externe est affiché, mais les notifications Telegram d'annonces économiques nécessitent encore un flux événementiel serveur autorisé.
- La console Admin est affichée uniquement après vérification du rôle du profil et reste en lecture seule (états de services). Aucun panneau de gestion des utilisateurs ou d'édition de secrets n'est exposé.
- L'advisor Supabase signale des index de clés étrangères manquants et des index non utilisés. Les index non utilisés n'ont pas été supprimés ; une migration additionnelle suivie est à préparer après installation/validation de la CLI Supabase.


## Mise à jour 2.2.2 — 10 novembre 2026

- Console Administration enrichie : tableau de bord, liste des comptes paginée, recherche locale, suspension/réactivation, promotion/révocation, création d’annonces.
- Initialisation unique du premier administrateur par variable serveur `AUREVIA_BOOTSTRAP_ADMIN_EMAIL`, vérification de l’e-mail réel de session, aucun rôle modifiable côté navigateur.
- API admin Netlify dédiée, vérification du JWT via Supabase Auth, vérification de l’appartenance à `app_private.admin_users`, audit privé et protection contre la révocation du dernier administrateur.
- Migration d’administration et index appliquée au projet Supabase associé ; droits RPC vérifiés : service_role seulement.
- Tests locaux : 68/68 ; build réussi.
- Non vérifié : intégration visuelle dans un navigateur réel, appels fournisseurs avec clés Netlify, notification Telegram réelle et déploiement Netlify.
