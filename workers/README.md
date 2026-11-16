# AUREVIA — suivi au prix simple du marché

Le suivi d’entrée, TP et SL utilise un seul prix `Last Price`. Les clôtures sont internes à AUREVIA et théoriques au dernier prix observé : elles ne sont pas des exécutions broker et ne tiennent pas compte du spread ni du slippage.

## Déploiement requis

`market-quote-stream.mjs` doit tourner comme **service Node 22 permanent** (Render Background Worker, Railway service, Fly.io ou VPS). Il ne doit pas être déployé comme fonction Netlify planifiée : une connexion WebSocket durable est nécessaire.

Variables secrètes à configurer sur le service :
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWELVEDATA_API_KEY`

Commande de démarrage : `node workers/market-quote-stream.mjs`

Le worker ne suit que les instruments des groupes AUREVIA actuellement ouverts. Il écrit le dernier prix de marché (`price` / Last Price), son timestamp fournisseur (`quote_at`) et sa source vérifiée dans `aurevia_market_quotes`. Les ticks sans timestamp, futurs ou âgés de plus de 120 secondes sont ignorés. Les transitions d’un ordre en attente sont appliquées séparément : `TRACK` mémorise le cours et arme le seuil, `TRIGGER_SEEN` mémorise le franchissement du stop d’un STOP LIMIT, et seul `ACTIVATE` appelle la RPC atomique d’activation. Les ticks d’un même symbole sont traités en série. Les déclenchements d’entrée et les niveaux TP/SL sont comparés au Last Price unique, sans calcul BID/ASK ni prix moyen artificiel.

La fonction planifiée `trade-watch` (une fois par minute) constitue le chemin de surveillance REST indépendant du worker permanent. Elle interroge désormais `/quote` et exige `last_quote_at` ; l’ancien endpoint `/price`, dépourvu d’horodatage de dernière cotation exploitable, est refusé. Si aucun cours récent et horodaté n’est disponible, le suivi suspend cette vérification au lieu d’inventer un cours. `scenario-watch` suit également ce principe pour les scénarios.

Appliquer la migration initiale `20261112180000_trade_entry_price_activation.sql` si elle ne l’est pas déjà, puis la migration `20261112190000_market_last_price_mode.sql`. Déployer ensuite le site Netlify. Le worker WebSocket permanent est facultatif pour la disponibilité du suivi REST, mais son hébergement est nécessaire pour bénéficier du flux continu et des déclenchements rapides. Sans ce service, les fonctions planifiées assurent un contrôle périodique par REST `/quote` (environ une fois par minute), sous réserve de disponibilité de Twelve Data et de son forfait.
