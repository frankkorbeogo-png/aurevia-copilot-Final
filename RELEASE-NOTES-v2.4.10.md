# AUREVIA COPILOT V2.4.10 — Surveillance multi-timeframes

- Les scénarios enregistrent un instantané compact de la lecture H4/H1/M30/M15/M5 au moment de leur validation.
- Le worker de surveillance conserve les contrôles de prix et d’invalidation, puis ne demande des bougies M5 que lorsqu’un scénario atteint sa zone d’entrée.
- La confirmation d’entrée repose sur une bougie M5 clôturée directionnelle qui casse l’extrême de la bougie précédente.
- Les divergences H4/H1/M30/M15 sont signalées comme vigilance ; elles ne bloquent pas seules un déclencheur M5 valide.
- Aucun ordre broker n’est exécuté. La validation du lot reste manuelle via Telegram ou AUREVIA.
- Migration Supabase requise : `20261114120000_scenario_multitimeframe_snapshot.sql`.
