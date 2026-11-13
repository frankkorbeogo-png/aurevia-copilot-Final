# AUREVIA COPILOT V2.4.4 — Correctif du moteur IA multi-fournisseurs

## Correctifs
- Maintien de l’ordre de secours Gemini → Cloudflare → SambaNova → Groq.
- Modèle Gemini par défaut actualisé vers `gemini-3.8-flash` ; le réglage serveur `GEMINI_MODEL` reste prioritaire.
- Délai par fournisseur porté à 8 secondes et budget global à 35 secondes, sous la limite synchrone Netlify de 60 secondes.
- Paramètre de génération Groq adapté à `max_completion_tokens` (au lieu de l’ancien `max_tokens` déprécié). Les autres fournisseurs conservent `max_tokens`.
- Diagnostics HTTP plus précis : authentification, facturation, modèle/endpoint absent, charge trop grande, quota/limitation, requête invalide et erreur serveur.
- Messages d’erreur raccourcis et nettoyés avant affichage ; aucune clé ni réponse brute n’est transmise au navigateur.

## Périmètre préservé
Aucun changement aux modules de positions, lots, TP/SL, clôtures partielles, journal, surveillance ou notifications Telegram. Aucun broker ni exécution automatique ajoutés.

## Validation
Tests automatisés et build à exécuter après intégration. Aucune requête réelle aux fournisseurs IA n’est déclarée dans cette livraison ; la disponibilité effective des clés, quotas et accès modèle doit être vérifiée sur le déploiement.
