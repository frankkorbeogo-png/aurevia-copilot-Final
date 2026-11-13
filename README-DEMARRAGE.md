# AUREVIA COPILOT V2.3.83

Application web responsive d'analyse multi-marchés, de préparation des ordres, de gestion du risque, de suivi manuel des positions et de journalisation.

## Version 2.3.43 — déclenchement des trades à l’entrée

Les ordres LIMIT/STOP sont conservés en `EN ATTENTE` jusqu’à l’atteinte de leur prix d’entrée. BUY déclenche sur ASK et SELL sur BID. Après activation, les sorties sont évaluées sur BID pour fermer un BUY et ASK pour fermer un SELL. Le suivi reste interne à AUREVIA et ne transmet aucun ordre à un broker.

**Mise en service supplémentaire obligatoire :** appliquer `supabase/migrations/20261112180000_trade_entry_price_activation.sql`, puis déployer le service permanent décrit dans `workers/README.md`. Sans ce flux prix simple du marché frais, `trade-watch` suspend volontairement les déclenchements plutôt que d’utiliser un cours moyen.


## Version 2.3.83 — liaison Telegram individuelle

La liaison est strictement un-à-un : un identifiant Telegram ne peut appartenir qu’à un compte AUREVIA, et un compte AUREVIA ne peut avoir qu’un seul compte Telegram associé. Une nouvelle liaison ne remplace jamais silencieusement une ancienne. Il faut d’abord déconnecter Telegram depuis les paramètres du compte AUREVIA actuellement lié, puis générer un nouveau code de liaison. Les contraintes `UNIQUE(chat_id)` et `UNIQUE(user_id)` en base protègent également contre les tentatives simultanées.

## Version 2.3.82 — assistant Telegram guidé

Après confirmation d’entrée, Telegram propose les modes « Position unique » et « Trades séparés » sous forme de boutons. Le bot guide ensuite l’utilisateur pour le lot, le broker, le type de compte, la devise, le levier et la méthode de calcul (contrat, point ou tick). Les spécifications propres au symbole sont demandées étape par étape. Un récapitulatif permet de confirmer, modifier le lot, modifier les paramètres ou annuler. Aucune commande JSON n’est nécessaire. La position n’est créée qu’après validation explicite.

## Version 2.3.81 — notification de connexion Telegram à l’accueil

L’accueil affiche une invitation à connecter Telegram lorsque le compte n’est pas encore associé. Le bouton ouvre directement la page de liaison. La notification est masquée après confirmation serveur de la liaison et réapparaît si le compte est délié. Si le statut ne peut pas être vérifié, l’accueil invite à contrôler la connexion plutôt que de supposer qu’elle est active.

## Version 2.3.80 — paramètres contractuels à la prise de position

La configuration broker permanente a été retirée : il n’existe plus de page dédiée au broker. Au moment de chaque prise de position, l’utilisateur renseigne le broker, le type de compte, la devise, le levier s’il est utile, les limites de lot, les frais et les paramètres propres à la méthode de calcul.

Le moteur commun accepte trois méthodes :
- **Taille du contrat** : variation du prix × volume × taille du contrat × conversion vers la devise du compte.
- **Valeur du point** : nombre de points parcourus × valeur monétaire du point par lot × volume.
- **Valeur du tick** : nombre de ticks parcourus × valeur monétaire du tick par lot × volume.

La valeur de point/tick doit être saisie dans la devise du compte. AUREVIA ne devine jamais la taille d’un contrat, un taux de conversion ou une marge. Chaque position conserve son propre snapshot. Le même moteur est utilisé pour les prises de position manuelles et pour celles créées après confirmation d’analyse via Telegram.

**Migration V2.3.80 déjà appliquée sur Supabase :** `20261113142328_universal_contract_snapshot_v2380`. Elle ajoute les snapshots JSONB aux groupes et positions et une RPC Telegram limitée au rôle `service_role`.

**Telegram après confirmation M15 :** utiliser les boutons proposés par le bot puis répondre à ses questions. Les commandes techniques `/lot` et `/spec` ne sont plus nécessaires.

## Lancer en développement

- Node.js 20+ recommandé pour l’application ; Node.js 22 est requis pour le worker WebSocket prix simple du marché.
- `npm test` lance les tests automatisés.
- Node.js 22 est la version recommandée (`.nvmrc`), Node.js 20+ est accepté.
- Pour tester les fonctions serveur, utiliser Netlify CLI puis `netlify dev` depuis la racine.
- Ne pas ouvrir `index.html` avec `file://` : les modules ES, les routes API et le service worker exigent HTTP(S).

## Déploiement Netlify

Le fichier `netlify.toml` lance `npm run build`, publie uniquement `dist/` et conserve les fonctions dans `netlify/functions`. Les documents internes, tests, migrations SQL et exemples de configuration ne sont donc pas publiés avec le site.

1. Créer un nouveau site Netlify depuis le dépôt Git ou avec la Netlify CLI.
2. Conserver `netlify.toml`, `package.json` et `scripts/build.mjs` à la racine du dépôt.
3. Netlify exécute `npm run build` et publie uniquement `dist/`.
4. Appliquer d’abord la migration V2.2.9 dans un environnement contrôlé et vérifier les fonctions/RLS. Ne pas modifier la base de production avant validation.
5. Ajouter les variables d'environnement serveur ci-dessous dans les paramètres du site.
6. Déployer uniquement après autorisation distincte, puis vérifier `/api/service-status` et `/api/session`.
7. Ajouter l'URL HTTPS finale dans Supabase Auth > URL Configuration (Site URL et Redirect URLs).
8. Configurer le webhook Telegram après le déploiement si les notifications sont activées.

Aucun déploiement n'est effectué depuis ce dossier : il faut un accès authentifié au compte Netlify et l'URL définitive du site.

## Variables Netlify — administrateur uniquement

| Variable | Utilisation |
|---|---|
| `GROQ_API_KEY` | Moteur d'analyse IA |
| `GROQ_MODEL` | Facultatif ; défaut `openai/gpt-oss-120b` |
| `TWELVEDATA_API_KEY` | Historiques OHLC multi-unités |
| `SUPABASE_URL` | Accès serveur Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Vérification des sessions utilisateur côté serveur |
| `SUPABASE_SERVICE_ROLE_KEY` | Fonctions serveur Telegram et administration ; secret strict |
| `TELEGRAM_BOT_TOKEN` | Bot privé `@AureviaCopilotBot` |
| `TELEGRAM_WEBHOOK_SECRET` | Validation du webhook entrant Telegram |
| `INTERNAL_NOTIFY_SECRET` | Facultatif, pour les appels internes serveur-à-serveur |

Ne jamais placer de clé secrète dans `index.html`, les fichiers JavaScript du navigateur ou un dépôt public. La clé Supabase publishable utilisée par le navigateur n'est pas une clé service-role ; les données sont protégées par RLS.

## Telegram

1. Définir `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_SERVICE_ROLE_KEY`.
2. Depuis la console administrateur, cliquer sur « Vérifier le token Telegram » : le contrôle valide le bot et configure automatiquement le webhook Telegram avec `TELEGRAM_WEBHOOK_SECRET`.
3. L'utilisateur se connecte à AUREVIA, génère un code de liaison et envoie `/start CODE` en conversation privée à `@AureviaCopilotBot`.
4. Les notifications d'analyse et de signal sont envoyées uniquement au chat associé au compte authentifié et selon ses préférences. Après liaison, le bouton « Envoyer un test de réception » permet de demander un message test et de vérifier la réponse de l'API Telegram. Le backend vérifie que le chat privé n'est pas partagé entre plusieurs comptes et limite les appels IA par utilisateur.

Les annonces économiques sont visibles via le widget calendrier externe ; leur envoi automatique Telegram nécessite encore une source d'événements disposant d'un flux serveur autorisé. Ne pas activer cette fonction comme si elle était déjà opérationnelle.

## Worker de cotations prix simple du marché

Le suivi exact ASK/BID nécessite le service permanent `workers/market-quote-stream.mjs` (Node 22). Il doit être hébergé séparément de Netlify et utiliser les secrets Supabase service-role et Twelve Data. Voir `workers/README.md`. Le plan Twelve Data doit autoriser le streaming des symboles utilisés.

## Supabase

Projet associé : `Aurevia-copilot` (`imkwbizyblzuevkodzqc`). La migration `20261110170930_add_trading_position_tracking` est déjà enregistrée sur le projet. Elle crée les tables de groupes, positions et clôtures, étend le journal et applique des politiques RLS propriétaires.

Les rôles sont gérés côté serveur. Le propriétaire `frankkorbeogo@gmail.com` a déjà été provisionné dans `app_private.admin_users` lors d'une opération antérieure ; la version V2.2.9 ne recrée pas ce compte et ne fournit aucun parcours de promotion. L’API contrôle l’appartenance à la table privée `app_private.admin_users` ; `profiles.role` n’est pas utilisé comme autorité d’accès. La console est cachée par défaut, et les routes/actions sont revalidées côté serveur. Elle permet la recherche serveur de comptes, l’affichage des emails, dates d’inscription/connexion, heartbeat, statut en ligne et session active, la suspension/réactivation, la révocation de session, la suppression confirmée des comptes non administrateurs, les statistiques, la configuration des services, les annonces avec expiration et la consultation de l’audit privé.

**Migration requise pour le suivi des entrées V2.3.42 :** `supabase/migrations/20261112180000_trade_entry_price_activation.sql`. Elle ajoute les statuts en attente, les champs d’activation, la RPC atomique d’activation et la table de suivi du prix de marché. La migration complémentaire `20261112190000_market_last_price_mode.sql` ajoute le champ `price` et rend prix simple du marché facultatifs.

**Migration de session unique V2.2.9 :** `supabase/migrations/20261111180000_single_session_and_admin_console_v229.sql`. Elle crée le registre privé de session unique, les fonctions de heartbeat/contrôle, les RPC d’administration et renforce les politiques RLS des tables personnelles. Elle figure dans l’historique des migrations du projet ; ne pas la réappliquer. Elle ne doit pas être exécutée automatiquement par Netlify. Les migrations `20261110193242_secure_admin_console_and_indexes` et `20261110193341_admin_audit_listing.sql` existent déjà dans l’historique antérieur du projet ; ne pas les réappliquer. Les utilisateurs ne peuvent modifier que les champs de profil autorisés ; la colonne `profiles.role` reste protégée.

La session unique utilise `auth.sessions.created_at` plutôt que le champ `iat` du JWT : le rafraîchissement d’un ancien token ne lui permet pas de reprendre la session d’un appareil plus récent. Le heartbeat client est émis toutes les 30 secondes ; le statut « en ligne » est calculé sur 90 secondes et la session active sur 2 minutes. La révocation distante bloque le heartbeat et les accès RLS personnels à la prochaine requête. Elle ne révoque pas les jetons Supabase auprès de tous les services externes qui ne consultent pas cette protection ; les routes privées AUREVIA et les politiques RLS couvertes par la migration sont contrôlées.

Après le déploiement, vérifier l'URL de redirection OAuth Supabase. Les avertissements de performance sur quelques clés étrangères et index non utilisés sont consignés dans `docs/AUDIT_2026-11-10.md` ; aucun index n'a été supprimé sur la base d'un simple avertissement.

## Limites fonctionnelles à connaître

- AUREVIA ne passe aucun ordre chez MT5 ou un broker.
- Les graphiques TradingView, le calendrier économique et le DXY sont des widgets externes ; leur disponibilité dépend du fournisseur et de la connexion.
- L'analyse OHLC Twelve Data est autorisée sur 14 instruments : XAU/USD, XAG/USD, les paires forex listées dans `analysis.js`, BTC/USD et ETH/USD. Les autres symboles de la liste graphique restent consultables sur le widget mais ne reçoivent pas cette analyse OHLC.
- Le Volume Profile est une approximation calculée à partir des volumes OHLCV par intervalle, pas un profil tick par tick. Il reste indisponible si le fournisseur ne donne pas de volume exploitable.
- Le score de confirmation technique est une règle explicable sur sept critères pondérés, dont 50 % consacrés au timeframe M15. Ce n'est pas une probabilité statistique de réussite. La probabilité reste non publiée tant qu'un historique de calibration représentatif n'existe pas.
- Le P/L réalisé utilise le prix d'exécution, le volume clôturé, la taille du contrat, la conversion de devise et les frais. Sans spécifications contractuelles valides, le résultat réel ne peut pas être calculé.
- L'analyse IA exige une session Supabase valide et le backend applique une limite de requêtes par utilisateur ; le flux OHLC applique une limite par IP (garde-fou par instance serverless). Les secrets serveur ne sont pas inclus dans l'archive ; les appels réels Groq, Twelve Data et Telegram doivent être vérifiés après configuration des variables Netlify.


## Installation de l’application (PWA)

Le site doit être servi en HTTPS.
- **iPhone/iPad :** ouvrir dans Safari → Partager → Sur l’écran d’accueil → Ajouter.
- **Android :** ouvrir dans Chrome → menu ⋮ → Installer l’application ou Ajouter à l’écran d’accueil.
- **Windows/macOS :** dans Chrome ou Edge, utiliser l’icône Installer dans la barre d’adresse ou le menu du navigateur.

Le manifeste fournit les icônes standard 192×192 et 512×512, une icône maskable 512×512 et une icône Apple Touch 180×180. L’installation ne demande aucune clé API à l’utilisateur.

## Méthode multi-timeframes V2.2.5
- H4 : biais général.
- M30 : structure intermédiaire et BOS/CHoCH.
- M15 : unité centrale de l’analyse technique et de la confluence.
- M5 ou M1 : déclencheur d’entrée après sweep/reclaim et confirmation.


## Identité Google pendant l’authentification

Le logo affiché dans l’écran de connexion AUREVIA est intégré au site. Pour afficher également le logo et le nom AUREVIA sur l’écran Google, suivre `docs/GOOGLE_OAUTH_BRANDING.md` et téléverser `assets/aurevia-google-oauth-logo.jpg` dans Google Auth Platform → Branding. Le logo de l’écran Google se configure dans Google Cloud, pas dans le stockage Supabase.
