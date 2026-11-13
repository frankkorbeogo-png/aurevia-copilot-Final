# AUREVIA COPILOT V2.4.1 — Stabilisation du moteur IA

- Maintien de l’ordre des fournisseurs : Gemini → Cloudflare → SambaNova → Groq.
- Délai par fournisseur plafonné à 2,2 secondes et budget global à 9,5 secondes afin de laisser le temps au fallback de s’exécuter avant la limite d’une fonction synchrone.
- Diagnostics serveur structurés : timeout, quota/rate limit, authentification/permission, réponse vide, JSON invalide, erreur réseau et budget épuisé.
- Messages de diagnostic expurgés des éventuelles chaînes d’autorisation et clés.
- Interface et messages d’analyse ne présentent plus Groq comme moteur unique : AUREVIA utilise son routeur multi-fournisseurs.
- Aucun changement au moteur de décision M15, aux niveaux TP/SL, au journal, au suivi des positions, à Telegram ou aux connexions broker.

Les clés et modèles doivent encore être validés par des appels réels après déploiement. Cette version ne prétend pas confirmer la disponibilité des API sans test réseau en production.
