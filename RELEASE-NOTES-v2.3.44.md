# AUREVIA COPILOT V2.3.44

## Correctifs du moteur d'analyse

- Le moteur charge désormais cinq unités de temps : H4, H1, M30, M15 et M5.
- H4 et H1 apportent le contexte supérieur et intermédiaire. Elles influencent le score de confluence sans annuler automatiquement une configuration intraday.
- M30 et M15 restent les unités de construction et de confrontation du scénario.
- M5 reste l'unique unité de confirmation du déclencheur d'entrée.
- Les cartes de structure et la détection des figures couvrent maintenant les cinq unités.
- Le score est affiché sur 100 et ne doit pas être interprété comme une probabilité de réussite.
- L'IA reçoit les cinq historiques OHLC et doit expliciter les désaccords entre contexte supérieur et structure intraday.

## Tests

- Suite automatisée : 159 tests réussis sur 159 après modification.
- Ces tests ne remplacent pas une validation terrain des cotations réelles, des quotas Twelve Data et des réponses du fournisseur IA.

## Limites connues

- Cette version corrige le contexte multi-timeframe et son affichage. Elle ne constitue pas encore la refonte complète de l'espace de configuration combinant panneaux techniques et assistant conversationnel.
- La génération autonome de candidats BUY/SELL avant confrontation IA reste une étape distincte à développer et à valider ; aucune promesse de signaux garantis n'est faite.
- Aucun broker externe n'est connecté et aucun ordre n'est exécuté. Les positions restent internes à AUREVIA.
