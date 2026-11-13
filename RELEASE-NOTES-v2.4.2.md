# AUREVIA COPILOT V2.4.2 — Diagnostic fournisseur et fallback fiable

- Temps d'attente par fournisseur porté à 7,5 secondes, avec budget global de 34 secondes (sous la limite synchrone Netlify de 60 secondes).
- Chaque tentative journalise le fournisseur, modèle, statut HTTP, code d'erreur, durée et délai appliqué.
- Les diagnostics n'enregistrent ni clés, ni en-têtes d'autorisation, ni prompt, ni contenu brut des réponses.
- Les réponses d'erreur de l'analyse et de la confrontation incluent un diagnostic technique expurgé.
- Ordre de routage inchangé : Gemini → Cloudflare → SambaNova → Groq.
- Aucune modification du moteur de décision M15, des niveaux TP/SL, du journal, des positions ou de Telegram.

Validation locale : tests automatisés et build à exécuter avant livraison. Les appels réels aux fournisseurs restent à vérifier après déploiement.
