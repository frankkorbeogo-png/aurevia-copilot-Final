# AUREVIA COPILOT — Guide de démarrage (version 2.4.19)

AUREVIA est un copilote d'analyse et de suivi manuel. **Il ne se connecte pas à MT5 et n'envoie aucun ordre à un broker.** L'exécution reste manuelle chez le broker de l'utilisateur.

## Fonctionnement actuel

### Analyse et entrée
- **H4 / H1** : contexte supérieur facultatif.
- **M30** : préparation structurelle obligatoire et fraîche.
- **M15** : unité décisionnelle; elle produit le scénario, la zone, le SL, les TP et le score de confluence.
- **M5** : après mitigation de la zone M15, Groq propose automatiquement un prix de référence; OpenRouter contre-vérifie le même prix et Cloudflare réalise le contrôle de risque indépendant. Les trois contrôles sont obligatoires.
- **M1** peut rester disponible comme vue de graphique, mais ne confirme jamais l'entrée.
- Les scores M15/M5 sont des scores techniques/IA, pas des probabilités statistiques calibrées.

### Prix et positions
- Le prix indicatif M15, le prix de référence M5, le dernier prix observé et le prix réellement exécuté sont distincts.
- Pour une entrée MARKET, l'utilisateur saisit le prix réel d'exécution avant la création de la position.
- Pour LIMIT/STOP, la position reste en attente jusqu'au déclenchement. Après activation, le calcul P/L et les clôtures internes restent suspendus jusqu'à la saisie manuelle du prix réel.
- Les modes **Position unique** et **Trades séparés** sont pris en charge.
- Les clôtures partielles, frais, conversions FX et journal sont suivis sans exécution broker.

### Capital et gestion du risque
- Le calculateur de lot utilise d'abord le **montant monétaire risqué**, le SL et les spécifications du contrat.
- Le gestionnaire de compte conserve le broker, le type de compte, le solde, l'equity, la marge utilisée, le levier, le pic d'equity, le drawdown et les limites de pertes quotidiennes/hebdomadaires.
- L'equity et la marge sont saisies manuellement : aucune connexion broker n'est établie.
- Les limites quotidiennes/hebdomadaires utilisent le P/L réalisé des clôtures enregistrées; le P/L flottant du broker n'est pas importé automatiquement.
- La devise du compte est enregistrée dans les paramètres du profil. Les spécifications techniques (contrat, point, tick, frais, lot min/max, levier) sont enregistrées par instrument.

### Marchés et données
- Catalogue actif : Forex, métaux, actions et crypto. Les indices et les énergies restent désactivés.
- Twelve Data fournit les prix et historiques OHLC; TradingView fournit l'affichage des graphiques.
- FRED alimente les données macro et le calendrier économique; le calendrier FOMC est rapproché des dates officielles de la Réserve fédérale.
- GDELT alimente les actualités mondiales. Une indisponibilité du fournisseur doit rester visible et ne doit pas être remplacée par des données inventées.
- Le calendrier CME est informatif et conserve des candidats non vérifiés; il ne ferme jamais automatiquement un marché ou une position.

### Compte, licence et Telegram
- Authentification Supabase avec contrôle de session unique.
- L'essai est lié à l'adresse e-mail; supprimer puis recréer le compte ne réinitialise pas l'essai.
- Une clé de licence est consommée par un seul utilisateur.
- L'administration distingue suppression standard et suppression définitive avec blocage permanent de l'adresse.
- Le bot officiel est @AureviaCopilotBot. La liaison est privée et volontaire. Le token Telegram reste côté serveur.
- Les utilisateurs ne saisissent aucune clé API.

## Installer AUREVIA

Le site doit être servi en HTTPS.

- **iPhone / iPad** : ouvrir dans Safari → Partager → Sur l'écran d'accueil → Ajouter.
- **Android** : ouvrir dans Chrome → menu ⋮ → Installer l'application ou Ajouter à l'écran d'accueil.
- **Windows / macOS** : dans Chrome ou Edge, utiliser l'icône Installer dans la barre d'adresse ou le menu du navigateur.

Le manifeste fournit les icônes 192×192 et 512×512, une icône maskable et une icône Apple Touch. Le fond galactique est animé en WebGL avec une solution de repli et un mode de réduction des animations.

## Développement et tests

- Node.js 20+ accepté; Node.js 22 recommandé (.nvmrc).
- npm install installe les dépendances.
- npm test exécute les tests automatisés.
- npm run build génère dist/.
- netlify dev lance l'application avec les fonctions Netlify en local.
- Ne pas ouvrir index.html avec file:// : les modules ES, routes API et service worker exigent HTTP(S).

## Configuration serveur

Utiliser .env.example comme liste de référence. Les variables sont configurées dans Netlify et Supabase; aucune clé ne doit être incluse dans le navigateur, dans le dépôt ou dans un fichier livré aux utilisateurs.

Les fonctions planifiées sont définies dans netlify.toml :
- scenario-watch : chaque minute.
- trade-watch : chaque minute.
- global-news-sync : chaque heure.
- cme-calendar-sync : chaque jour à 06:15 UTC.

## Migrations et publication

1. Le dossier supabase/migrations est aligné sur les 63 migrations déjà appliquées en production; les 19 migrations de la version 2.4.19 sont les seules en attente.
2. Le projet staging est un snapshot isolé avec un historique de migrations distinct. Ne pas lancer supabase db push sur staging avant réconciliation de son historique.
3. Vérifier les politiques RLS, fonctions SQL, tests et flux de bout en bout sur staging.
4. Après autorisation explicite, sauvegarder la production puis appliquer les 19 migrations en attente dans l'ordre indiqué dans supabase/RELEASE-MIGRATION-PLAN-2.4.19.md.
5. Déployer Netlify seulement après vérification des migrations et autorisation explicite.
6. Vérifier /api/service-status, les fonctions planifiées, le calendrier, les flux de marché et Telegram.

**Aucune fusion ou aucun déploiement ne doit être effectué sans autorisation explicite.**

Pour l'historique détaillé des versions, consulter CHANGELOG.md et les fichiers RELEASE-NOTES-*.md.
