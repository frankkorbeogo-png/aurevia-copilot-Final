# AUREVIA COPILOT v2.4.11 — Refonte du raisonnement multi-timeframe et routage IA adaptatif

## Moteur d’analyse
- L’analyse transmet désormais un résumé technique structuré H4, H1, M30 et M15 à l’IA, au lieu de ne transmettre que les biais H4/M30.
- La hiérarchie est explicitée : H4 contexte majeur, H1 confirmation, M30 préparation, M15 décision du scénario.
- La réponse doit distinguer continuation, correction et retournement, et ne pas inventer les unités indisponibles.
- Le scénario définit une zone d’opportunité à mitiger ; aucune entrée immédiate ne doit être annoncée avant la surveillance de confirmation M5 puis M1.

## Routage IA tenant compte des profils de requête
- Gemini : reçoit le contexte complet disponible et dispose du plus grand plafond de sortie (2 200 tokens maximum, sans dépasser le plafond demandé par l’appelant).
- Cloudflare : reçoit une version intermédiaire compacte, conserve les résumés multi-timeframe et reçoit un plafond de sortie de 1 400 tokens.
- Groq : reçoit d’abord le contexte complet ; en cas de HTTP 413, une seule nouvelle tentative compacte est effectuée. Plafond de sortie de 1 800 tokens et paramètres GPT-OSS conservés.
- L’ordre de secours reste Gemini → Cloudflare → Groq. Aucun fournisseur n’est appelé en parallèle.

## Limites connues
- Les plafonds de tokens et la compaction sont des réglages de requête, pas une mesure comparative de qualité ou de vitesse des modèles.
- M5/M1 restent gérés par la surveillance après mitigation ; ils ne sont pas prétendus comme confirmés par le raisonnement initial.
- Aucune connexion broker ni exécution automatique n’est ajoutée.
