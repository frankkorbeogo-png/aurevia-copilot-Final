# AUREVIA COPILOT V2.4.5 — allègement et délais du moteur IA

- Réduction des bougies M15 transmises au moteur de 120 à 64, en conservant les données les plus récentes et la validation minimale de 60 bougies.
- Compactage des blocs indicateurs, structure, patterns, Fibonacci, Volume Profile et contexte H4/M30/macro pour limiter le volume envoyé aux fournisseurs.
- Réduction du budget de sortie IA de 2600 à 1400 tokens afin de diminuer la charge totale des requêtes.
- Délais adaptés par fournisseur : Gemini 11 s, Cloudflare 10 s, SambaNova 8,5 s, Groq 8,5 s ; budget global 44 s, sous la limite synchrone Netlify documentée à 60 s.
- Ordre de secours inchangé : Gemini → Cloudflare → SambaNova → Groq.
- Aucun changement aux modules de trading, journal, positions, Telegram ou exécution : aucune exécution broker n'est ajoutée.
- SambaNova peut toujours exiger un moyen de paiement côté compte ; ce point ne peut pas être corrigé par le code.
