# AUREVIA COPILOT V2.3.0 — livraison source

## Périmètre
Cette livraison repart du ZIP V2.2.9 disponible dans l'espace de travail. Elle ajoute un décor cosmique WebGL/nébuleuses cyan-violet, les notifications Telegram des positions enregistrées/clôtures manuelles et une fonction planifiée de surveillance des TP/SL des positions persistées dans AUREVIA.

## Surveillance TP/SL
- La fonction Netlify `trade-watch` est planifiée toutes les minutes.
- Elle lit les positions ouvertes dans Supabase et les cours Twelve Data côté serveur.
- BUY : SL si prix <= SL, TP si prix >= TP. SELL : SL si prix >= SL, TP si prix <= TP. En cas de franchissement simultané constaté entre deux contrôles, SL est prioritaire.
- Les événements sont dédupliqués par `position_id:event_type`; les notifications Telegram en attente sont réessayées au prochain passage.
- Une position est clôturée dans le registre AUREVIA uniquement. Aucune exécution chez Exness/MT5 ni ailleurs.
- Le P/L automatique n'est calculé que si `contract_size` est défini. Sinon, l'état de clôture est suivi mais le P/L stocké par le watcher reste à zéro faute de spécification contractuelle fiable; il ne faut pas l'interpréter comme un résultat financier exact.
- Limite importante : une surveillance chaque minute peut manquer un passage rapide au-delà d'un TP puis un retour avant le contrôle suivant. Le cours Twelve Data est un prix fournisseur, pas un tick broker.

## Telegram
- Les propositions IA restent notifiées selon les préférences existantes.
- Les trades enregistrés et clôtures manuelles utilisent le réglage « signaux validés ».
- Les alertes TP/SL sont envoyées depuis la fonction planifiée à chaque utilisateur associé, sans partage de chat. Le réglage « Signaux validés + trades, TP/SL et clôtures » doit être activé.
- Le token du bot reste côté serveur.

## Configuration à effectuer (pas appliquée)
1. Appliquer manuellement `supabase/migrations/20261111230000_trade_alert_monitor_v230.sql` après revue.
2. Vérifier les variables Netlify existantes : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TWELVEDATA_API_KEY`, `TELEGRAM_BOT_TOKEN`.
3. Vérifier la configuration webhook Telegram déjà utilisée (`TELEGRAM_WEBHOOK_SECRET`) pour l'association des comptes.
4. Déployer sur une préproduction autorisée et vérifier que Netlify reconnaît la planification `@every 1m`.
5. Associer un compte Telegram, activer les notifications de signaux validés, enregistrer une position de test et vérifier TP/SL avec un jeu de test contrôlé.

## Sécurité et limites
- Aucun changement distant Supabase effectué.
- Aucun déploiement Netlify effectué.
- Aucun secret n'est ajouté à l'archive.
- Les notifications TP/SL signifient « niveau observé atteint par le flux de prix », pas « ordre exécuté par un broker ».
- Les alertes de positions enregistrées en local uniquement ne sont pas surveillées en arrière-plan tant qu'elles ne sont pas synchronisées dans Supabase.

## Mise à jour de déploiement — 11 novembre 2026
- Les migrations `aurevia_single_session_admin_console_v229`, `aurevia_trade_alert_monitor_v230` et `aurevia_trade_alert_position_index_v2301` ont été appliquées au projet Supabase `imkwbizyblzuevkodzqc` après autorisation explicite du propriétaire.
- Vérification distante : les tables `app_private.aurevia_user_sessions` et `public.aurevia_trade_alert_events` existent, et les fonctions de session sont présentes.
- Vérification distante : le projet ne contient actuellement aucun utilisateur Auth, aucun profil et aucune entrée `app_private.admin_users`. En conséquence, le compte `frankkorbeogo@gmail.com` n'est PAS confirmé administrateur dans l'état actuel de cette base. Ne pas auto-promouvoir : après sa première connexion Google, vérifier l'identité et attribuer explicitement le rôle administrateur via une opération sécurisée et auditée.
- Les advisors Supabase signalent des tables privées protégées par RLS sans policies (accès direct volontairement fermé), un avertissement sur la fonction `aurevia_session_is_active()` SECURITY DEFINER limitée au rôle authenticated et fondée sur `auth.uid()`, ainsi qu'un index FK ajouté ensuite dans `aurevia_trade_alert_position_index_v2301`.
- Les migrations sont installées, mais les flux Auth, heartbeat, console admin et alertes Telegram doivent être testés après déploiement Netlify et première connexion Google.
