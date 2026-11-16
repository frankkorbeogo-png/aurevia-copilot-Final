# AUREVIA COPILOT 2.4.19 — Audit général et protection du capital

## Moteur d'entrée M5
- Groq propose un prix de référence après mitigation de la zone M15.
- OpenRouter vérifie le même prix; Cloudflare contrôle indépendamment le risque et peut opposer un veto.
- Les deux contrôles secondaires sont exécutés en parallèle après la proposition Groq. Une absence ou un échec d'un fournisseur obligatoire bloque la confirmation.
- Les récupérations de données M5 et les appels IA ont des délais bornés pour respecter le budget des fonctions planifiées.
- M1 reste une vue de graphique facultative et ne confirme pas l'entrée.

## Prix réel et P/L
- MARKET exige une saisie manuelle du prix réellement exécuté.
- LIMIT/STOP restent en attente jusqu'au déclenchement; après activation, P/L et clôtures internes attendent le prix réel manuel.
- Les calculs locaux et serveur utilisent le prix réel confirmé, jamais le prix M5 indicatif ou le prix observé au déclenchement.
- La base vérifie la cohérence entre le prix réel du groupe et le snapshot contractuel.
- Le mode position unique et le mode trades séparés restent pris en charge.

## Gestion du capital
- Nouveau suivi par utilisateur : broker, type de compte, solde, equity, marge utilisée et libre, levier, pic d'equity, drawdown et limites de pertes quotidiennes/hebdomadaires.
- Les paramètres sont persistés dans user_preferences.
- Les limites utilisent le P/L réalisé des clôtures enregistrées et du journal manuel. Le P/L flottant n'est pas importé sans connexion broker.
- Le montant risqué reste la donnée principale du calcul de lot.

## Calendrier et données
- Les décisions et minutes FOMC sont générées depuis le calendrier officiel de la Réserve fédérale, et non depuis le FRED release 101.
- Une migration désactive les anciennes alertes FOMC quotidiennes erronées.
- FRED et GDELT sont synchronisés en parallèle; les timeouts sont bornés et les rappels économiques ne partent pas plus de 60 minutes avant l'événement.
- CME dispose d'un retry et d'une URL officielle alternative. Les candidats restent informatifs et aucune fermeture de marché n'est automatique.

## Authentification, UI et documentation
- Les RPC du journal manuel fonctionnent sous SECURITY INVOKER et s'appuient sur RLS.
- Le formulaire d'entrée réel n'a plus d'identifiant HTML dupliqué.
- Le guide reflète la confirmation M5 et la gestion du capital.
- L'exemple d'environnement documente OpenRouter et les secrets restent côté serveur.
- Cache PWA versionné 2.4.19.

## État de livraison
- Branche de travail : feature/scenario-orders-scores-broker-settings.
- PR #20 vers main.
- Staging : migrations et fonctions SQL vérifiées; tests CI à actualiser sur le dernier commit.
- Production : migrations non appliquées, fusion non effectuée, déploiement Netlify non effectué.
- Aucune action de publication n'est autorisée sans accord explicite.
