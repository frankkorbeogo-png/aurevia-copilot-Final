# AUREVIA COPILOT V2.4.7 — retrait de SambaNova

## Décision
SambaNova est retiré du routage IA : son utilisation nécessite des crédits payants que l'utilisateur ne souhaite pas engager.

## Ordre de routage
1. Gemini
2. Cloudflare
3. Groq

## Ajustements
- Suppression de la lecture de `SAMBANOVA_API_KEY` et de l'appel API SambaNova.
- Budget global ramené à 32 secondes, avec des délais individuels de 11 s (Gemini), 10 s (Cloudflare) et 8,5 s (Groq).
- Les paramètres de réponse JSON GPT-OSS de Groq sont conservés.
- Aucun changement aux modules de trading, au journal, au suivi des positions ou à Telegram.
- L'ancienne variable `SAMBANOVA_API_KEY` éventuellement présente dans Netlify n'est plus utilisée par le code ; elle peut être supprimée séparément dans les variables d'environnement.

## Validation
Tests automatisés et build à exécuter avant livraison.
