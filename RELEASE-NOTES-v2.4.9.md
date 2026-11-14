# AUREVIA COPILOT v2.4.9 — Résilience des fournisseurs IA

- Gemini : une seule nouvelle tentative courte sur les erreurs temporaires 503, 429 et RESOURCE_EXHAUSTED, puis bascule vers Cloudflare.
- Cloudflare : délai d’attente explicite réduit afin de préserver le temps disponible pour les fournisseurs suivants.
- Groq : en cas de HTTP 413, une seule nouvelle tentative est faite avec un contexte compacté (bougies et figures réduites, contexte secondaire borné), puis le routeur poursuit normalement.
- L’ordre Gemini → Cloudflare → Groq et la confidentialité des clés côté serveur sont conservés.
- Aucun déploiement Netlify n’est effectué par cette archive.

Les tests automatisés simulent les réponses des fournisseurs ; ils ne remplacent pas un essai réel avec les clés API de production.
