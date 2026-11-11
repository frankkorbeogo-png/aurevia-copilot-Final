# AUREVIA COPILOT V2.2 MAJ

Application web responsive d'analyse multi-marchés, de préparation des ordres, de gestion du risque, de suivi manuel des positions et de journalisation.

## Lancer en développement

- Node.js 20+ recommandé.
- `npm test` lance les tests automatisés.
- Node.js 22 est la version recommandée (`.nvmrc`), Node.js 20+ est accepté.
- Pour tester les fonctions serveur, utiliser Netlify CLI puis `netlify dev` depuis la racine.
- Ne pas ouvrir `index.html` avec `file://` : les modules ES, les routes API et le service worker exigent HTTP(S).

## Déploiement Netlify

Le fichier `netlify.toml` lance `npm run build`, publie uniquement `dist/` et conserve les fonctions dans `netlify/functions`. Les documents internes, tests, migrations SQL et exemples de configuration ne sont donc pas publiés avec le site.

1. Créer un nouveau site Netlify depuis le dépôt Git ou avec la Netlify CLI.
2. Conserver `netlify.toml`, `package.json` et `scripts/build.mjs` à la racine du dépôt.
3. Netlify exécute `npm run build` et publie uniquement `dist/`.
4. Ajouter les variables d'environnement serveur ci-dessous dans les paramètres du site.
5. Déployer le site et vérifier `/api/service-status`.
6. Ajouter l'URL HTTPS finale dans Supabase Auth > URL Configuration (Site URL et Redirect URLs).
7. Configurer le webhook Telegram après le déploiement si les notifications sont activées.

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
| `AUREVIA_BOOTSTRAP_ADMIN_EMAIL` | Adresse exacte du premier administrateur ; initialisation unique, puis supprimer cette variable |

Ne jamais placer de clé secrète dans `index.html`, les fichiers JavaScript du navigateur ou un dépôt public. La clé Supabase publishable utilisée par le navigateur n'est pas une clé service-role ; les données sont protégées par RLS.

## Telegram

1. Définir `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_SERVICE_ROLE_KEY`.
2. Configurer le webhook du bot sur `https://VOTRE-SITE/.netlify/functions/telegram-webhook` avec le même secret dans l'en-tête Telegram `secret_token`.
3. L'utilisateur se connecte à AUREVIA, génère un code de liaison et envoie `/start CODE` en conversation privée à `@AureviaCopilotBot`.
4. Les notifications d'analyse et de signal sont envoyées uniquement au chat associé au compte authentifié et selon ses préférences. Après liaison, le bouton « Envoyer un test de réception » permet de demander un message test et de vérifier la réponse de l'API Telegram. Le backend vérifie que le chat privé n'est pas partagé entre plusieurs comptes et limite les appels IA par utilisateur.

Les annonces économiques sont visibles via le widget calendrier externe ; leur envoi automatique Telegram nécessite encore une source d'événements disposant d'un flux serveur autorisé. Ne pas activer cette fonction comme si elle était déjà opérationnelle.

## Supabase

Projet associé : `Aurevia-copilot` (`imkwbizyblzuevkodzqc`). La migration `20261110170930_add_trading_position_tracking` est déjà enregistrée sur le projet. Elle crée les tables de groupes, positions et clôtures, étend le journal et applique des politiques RLS propriétaires.

Les rôles sont gérés côté serveur. Aucun utilisateur ne peut s'accorder le rôle administrateur depuis le navigateur. La console Admin permet la supervision, la liste des comptes, la suspension/réactivation, l’attribution/révocation des rôles et la publication d’annonces. Les opérations sont vérifiées côté serveur, journalisées et la table privée d’administrateurs reste inaccessible depuis le navigateur. Le premier administrateur est initialisé une seule fois via `AUREVIA_BOOTSTRAP_ADMIN_EMAIL`, après authentification du compte correspondant. Après cette initialisation, supprimer la variable de bootstrap. Les migrations `20261110193242_secure_admin_console_and_indexes` et `20261110193341_admin_audit_listing.sql` ajoutent les fonctions de privilège, l’audit privé, la lecture des audits et les index manquants ; elles sont appliquées au projet Supabase associé. Les utilisateurs ne peuvent modifier que leur nom affiché et leur avatar ; la colonne `profiles.role` est protégée par des privilèges SQL distincts.

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
