# AUREVIA COPILOT v2.3.43

## Suivi au prix simple du marché

- Un seul cours `Last Price` est utilisé pour l’activation des entrées, le suivi des TP et des SL.
- Le contrôle planifié `trade-watch` interroge Twelve Data REST `/price` si le dernier prix enregistré est absent ou trop ancien (passage Netlify programmé environ chaque minute).
- Le worker WebSocket reste facultatif et peut accélérer la réception des ticks lorsqu’un abonnement est disponible.
- Les clôtures automatiques sont des clôtures internes AUREVIA au dernier prix observé. Elles ne constituent pas des ordres ni des exécutions broker, et ne prennent pas en compte le spread ou le slippage.
- Aucun BID/ASK n’est reconstitué ou simulé.

## Migration

Appliquer `supabase/migrations/20261112190000_market_last_price_mode.sql` après la migration initiale de suivi des entrées.

## Sécurité / limites

Si Twelve Data ne retourne aucun prix valide, le passage de surveillance est suspendu pour l’instrument concerné : aucun déclenchement ni clôture ne sont inventés. La fréquence REST dépend de l’exécution planifiée Netlify et des quotas du fournisseur.
