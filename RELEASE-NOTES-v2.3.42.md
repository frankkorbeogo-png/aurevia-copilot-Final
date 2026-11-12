# AUREVIA COPILOT v2.3.42

## Suivi des trades — déclenchement au prix d’entrée
- Les ordres en attente (BUY/SELL LIMIT, BUY/SELL STOP, STOP LIMIT) sont enregistrés avec le statut `PENDING / EN ATTENTE`.
- Les ordres MARKET restent immédiatement `OPEN / OUVERTS`.
- BUY LIMIT et BUY STOP surveillent l’ASK ; SELL LIMIT et SELL STOP surveillent le BID.
- STOP LIMIT suit d’abord le niveau de déclenchement, puis attend le retour sur le prix limite.
- Une seule activation atomique par position est autorisée dans Supabase. L’heure et le prix d’activation sont conservés.
- Après activation, les sorties utilisent le côté exécutable opposé : BID pour fermer un BUY, ASK pour fermer un SELL. Le calcul interne utilise le prix d’activation réel.
- Le journal passe de EN ATTENTE à OUVERT lors de l’activation. L’interface actualise le suivi cloud toutes les 60 secondes.
- Une notification Telegram est envoyée au déclenchement, avec reprise si Telegram est temporairement indisponible.
- Aucun ordre n’est envoyé à Exness, MT5 ou à un autre broker.

## Infrastructure requise pour BID/ASK
- Ajout d’un worker permanent `workers/market-quote-stream.mjs` utilisant le WebSocket Twelve Data.
- Le worker écrit les cotations BID/ASK fraîches dans `aurevia_market_quotes` et détecte l’activation à chaque tick reçu. La fonction Netlify planifiée `trade-watch` conserve un contrôle de secours et assure le suivi TP/SL.
- Le worker doit être déployé comme service Node 22 permanent (Render/Railway/Fly/VPS), avec `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `TWELVEDATA_API_KEY`.
- Appliquer `supabase/migrations/20261112180000_trade_entry_price_activation.sql` avant le déploiement.
- Le plan Twelve Data doit autoriser le streaming des symboles actifs et retourner les champs `bid` et `ask`. Si la cotation est absente ou trop ancienne (plus de 90 secondes), la surveillance n’utilise aucun prix de remplacement et suspend le déclenchement.

## Limites
- Le ZIP contient le worker et la migration, mais leur déploiement externe et l’application de la migration Supabase restent des opérations de mise en service distinctes.
- Le suivi AUREVIA reste un registre/simulateur interne ; il ne confirme pas une exécution réelle chez un broker.


### Mode de suivi au prix simple du marché
- Les déclenchements d’entrée, TP et SL utilisent désormais un seul prix `Last Price` fourni par Twelve Data.
- Le suivi planifié peut récupérer ce prix via REST environ chaque minute si le flux WebSocket permanent n’est pas disponible.
- Les clôtures automatiques sont des clôtures internes théoriques au dernier prix observé ; elles ne représentent pas un prix d’exécution broker et ignorent spread/slippage.
- Aucun BID/ASK n’est reconstitué ou simulé.
- Appliquer la migration `20261112190000_market_last_price_mode.sql` avant déploiement.
