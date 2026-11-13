# AUREVIA COPILOT V2.3.84 — Fiabilité des données et calendrier

## Corrections
- Normalisation des horodatages OHLC Twelve Data en UTC à la source.
- Vérification des dates ISO avec fuseau explicite et refus d'interpréter silencieusement une heure sans fuseau comme UTC.
- Temporisation de 60 secondes après une réponse HTTP 429 et arrêt des nouvelles tentatives immédiates côté analyse.
- Agrandissement du conteneur TradingView du calendrier économique sur ordinateur et mobile.

## Compatibilité
- Le workflow Telegram de liaison un-à-un de V2.3.83 est conservé.
- Aucun broker, MT5 ou ordre automatique n'est ajouté.
- Aucun changement de schéma Supabase ni migration SQL requis.

## Vérification
- Build `npm run build` réussi.
- Tests automatisés : 256 réussis, 0 échec.
