# AUREVIA — suivi au prix simple du marché

Le suivi d’entrée, TP et SL utilise un seul prix `Last Price`. Les clôtures sont internes à AUREVIA et théoriques au dernier prix observé : elles ne sont pas des exécutions broker et ne tiennent pas compte du spread ni du slippage.

## Déploiement requis

`market-quote-stream.mjs` doit tourner comme **service Node 22 permanent** (Render Background Worker, Railway service, Fly.io ou VPS). Il ne doit pas être déployé comme fonction Netlify planifiée : une connexion WebSocket durable est nécessaire.

Variables secrètes à configurer sur le service :
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWELVEDATA_API_KEY`

Commande de démarrage : `node workers/market-quote-stream.mjs`

Le worker ne suit que les instruments des groupes AUREVIA actuellement ouverts. Il écrit le dernier prix de marché (`price` / Last Price) dans `aurevia_market_quotes`. Les déclenchements d’entrée et les niveaux TP/SL sont comparés à ce prix unique, sans calcul BID/ASK ni prix moyen artificiel. Si le flux WebSocket n’est pas disponible, la fonction planifiée `trade-watch` interroge le point REST Twelve Data `/price` à chaque passage (environ une fois par minute par instrument actif).

Appliquer la migration initiale `20261112180000_trade_entry_price_activation.sql` si elle ne l’est pas déjà, puis la migration `20261112190000_market_last_price_mode.sql`. Déployer ensuite le site Netlify. Le worker WebSocket est facultatif : le suivi planifié peut utiliser REST `/price` comme solution économique.
