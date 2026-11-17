# AUREVIA 2.4.19 — plan de migrations Supabase

## État vérifié en lecture seule le 16 novembre 2026

- Production : projet Supabase imkwbizyblzuevkodzqc, 63 migrations appliquées; dernière version 20261116160908.
- Staging : projet Supabase cfoipulmnkisaaiirmps, 55 migrations appliquées. Ce projet a été créé comme snapshot isolé le 16 novembre; ses migrations bootstrap et ses versions générées ne correspondent pas à l'historique de production.
- Dépôt : le dossier supabase/migrations contient désormais 63 fichiers reconstruits exactement depuis les enregistrements de migrations déjà appliquées en production, plus 19 migrations de livraison en attente.
- Les snapshots de staging sont archivés dans supabase/staging-bootstrap/ et ne sont pas inclus dans le dossier de migrations de production.
- Le doublon identique de la migration aurevia_telegram_access_entitlement a été retiré de l'historique staging après vérification du hash SQL; le schéma n'a pas été modifié par ce nettoyage de métadonnées.
- La migration allow_users_to_unlink_own_telegram a été retirée du dossier de production et archivée dans supabase/retired-migrations/: la déliaison passe par telegram-unlink.mjs, qui vérifie l'utilisateur et la session active avant la suppression avec le rôle service. Une politique DELETE directe côté client n'est pas nécessaire.

## Réconciliation effectuée dans le dépôt

Les fichiers de migration historiques ont été reconstruits à partir de supabase_migrations.schema_migrations en production, en conservant les versions exactes, les noms canoniques et le SQL appliqué. Cela évite de rejouer les 63 migrations existantes lors d'une future livraison.

Les 19 migrations ci-dessous sont les seules migrations de cette livraison absentes de l'historique de production. Elles sont conservées dans l'ordre chronologique :

1. 20261116184406_aurevia_scenario_scores_and_order_preservation.sql
2. 20261116185127_aurevia_validate_scenario_order_levels.sql
3. 20261116185500_aurevia_backfill_legacy_scenario_scores.sql
4. 20261116190000_aurevia_ai_m5_entry_proposals.sql
5. 20261116190500_aurevia_actual_manual_fill_price.sql
6. 20261116191000_aurevia_update_manual_fill_price.sql
7. 20261116192500_aurevia_unique_pending_actual_fill.sql
8. 20261116193000_aurevia_atomic_m5_analysis_claim.sql
9. 20261116194000_aurevia_telegram_access_entitlement.sql
10. 20261116195000_aurevia_activate_unique_group_on_fill.sql
11. 20261116220000_aurevia_revoke_unsafe_public_grants.sql
12. 20261116221000_aurevia_manual_journal_rpcs_security_invoker.sql
13. 20261116223000_aurevia_license_status_enforces_email_blocklist.sql
14. 20261116230000_aurevia_license_activation_respects_email_blocklist.sql
15. 20261116230100_aurevia_retire_invalid_fred_fomc_dates.sql
16. 20261116230200_aurevia_require_manual_actual_fill_for_market_pnl.sql
17. 20261116230300_aurevia_enforce_manual_fill_source.sql
18. 20261116230400_aurevia_gdelt_publication_date_cleanup.sql
19. 20261116230500_aurevia_trade_validation_profile_currency_guard.sql

## Procédure de publication

1. Ne pas utiliser supabase db push sur staging : son historique est un bootstrap séparé et n'est pas encore réparé.
2. Avant toute action en production, vérifier que les 63 versions locales historiques correspondent aux 63 versions distantes et que les 17 nouvelles sont les seules en attente.
3. Faire une sauvegarde de production.
4. Après autorisation explicite, appliquer les 19 migrations en ordre sur production, en vérifiant le résultat de chaque migration.
5. Déployer Netlify seulement après confirmation des migrations et autorisation explicite.
6. Vérifier ensuite les fonctions planifiées, le statut des services, les prix M5, les notifications Telegram, le calendrier FOMC/CME et les actualités.

**Aucune migration de production, fusion ou aucun déploiement n'a été effectué pendant cet audit.**
