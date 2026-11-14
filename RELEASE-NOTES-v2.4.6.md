# AUREVIA COPILOT V2.4.6 — optimisation IA et fiabilité du score

- Réduction du contexte transmis au modèle: 40 dernières bougies M15, contexte secondaire compacté et sortie plafonnée à 900 tokens.
- Prompt décisionnel raccourci tout en conservant M15 comme seule unité décisionnelle, H4/M30 contextuels et macro/Fibonacci/Volume Profile facultatifs.
- Le score de confirmation IA est désormais indisponible si tous les fournisseurs échouent; aucun score technique local n'est présenté à tort comme un résultat IA.
- Diagnostic explicite AI_FAILED / AI_COMPLETED.
- Ordre des fournisseurs et délais de secours conservés.
