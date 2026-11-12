# AUREVIA COPILOT V2.3.45

## Générateur autonome de scénarios candidats
Cette version ajoute un moteur local déterministe qui évalue séparément BUY et SELL à partir des données OHLC H4, H1, M30, M15 et M5. Il prend en compte les structures, BOS/CHoCH, sweeps, EMA200, MACD, RSI et ATR.

Les scénarios affichent une zone indicative, une entrée indicative, un stop, trois objectifs, des conditions d’activation et une invalidation. M5 confirme le déclencheur, sans imposer qu’un candidat soit masqué avant confirmation.

Le score est un score de confluence, jamais une probabilité statistique. Les prix ne sont pas des cotations exécutables. Aucune connexion broker ni exécution d’ordre n’est ajoutée.

## Validation
- Tests automatisés : 162 réussis.
- Tests de syntaxe et build à exécuter avant diffusion.
- Essais de marché réel encore nécessaires pour valider le comportement avec Twelve Data et le service IA.
