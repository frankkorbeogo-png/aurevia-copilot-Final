# AUREVIA COPILOT v2.4.0 — Routage IA multi-fournisseurs

- Moteur IA centralisé côté serveur avec ordre de priorité : Gemini, Cloudflare, SambaNova, puis Groq.
- Bascule automatique au prochain fournisseur en cas d’erreur HTTP, quota/rate limit, délai dépassé, réponse vide ou JSON invalide.
- Analyse M15 et confrontation trader/IA utilisent le même routeur.
- Les clés restent dans les variables d’environnement Netlify et ne sont jamais transmises au navigateur.
- Le statut serveur expose les fournisseurs configurés pour le diagnostic administrateur.
- L’interface utilisateur présente le moteur sous le nom AUREVIA, sans imposer le nom du fournisseur.
- Les modules de suivi, journal, Telegram, authentification et gestion des trades sont conservés.

Modèles par défaut configurables via les variables `*_MODEL` :
- Gemini : `gemini-2.5-flash`
- Cloudflare Workers AI : `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- SambaNova : `DeepSeek-V3.1`
- Groq : `openai/gpt-oss-120b`

Validation locale : 284 tests automatisés réussis ; build de production réussi.
