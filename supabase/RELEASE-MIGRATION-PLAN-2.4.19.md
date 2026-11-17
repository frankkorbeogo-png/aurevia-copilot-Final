# AUREVIA 2.4.20 — plan de migrations Supabase

## État vérifié après livraison le 17 novembre 2026

- Production : projet Supabase imkwbizyblzuevkodzqc, 84 migrations appliquées; les 20 migrations de cette livraison sont enregistrées en production.
- Staging : projet Supabase cfoipulmnkisaaiirmps, 57 migrations appliquées au dernier contrôle. Ce projet a été créé comme snapshot isolé le 16 novembre; ses migrations bootstrap et ses versions générées ne correspondent pas à l'historique de production.
- Dépôt : le dossier supabase/migrations contient désormais 64 fichiers reconstruits depuis les enregistrements de migrations appliquées en production, plus 20 migrations de livraison désormais appliquées en production.
- Les snapshots de staging sont archivés dans supabase/staging-bootstrap/ et ne sont pas inclus dans le dossier de migrations de production.
- Le doublon identique de la migration aurevia_telegram_access_entitlement a été retiré de l'historique staging après vérification du hash SQL; le schéma n'a pas été modifié par ce nettoyage de métadonnées.
- La migration allow_users_to_unlink_own_telegram a été retirée du dossier de production et archivée dans supabase/retired-migrations/: la déliaison passe par telegram-unlink.mjs, qui vérifie l'utilisateur et la session active avant la suppression avec le rôle service. Une politique DELETE directe côté client n'est pas nécessaire.

## Réconciliation effectuée dans le dépôt

Les 20 migrations ont été exécutées en production via l'outil de migration Supabase, qui a généré des versions de registre différentes des préfixes initiaux. Les fichiers locaux ont été renommés pour correspondre exactement aux versions réellement enregistrées, afin que le prochain `supabase db push` ne rejoue pas ces changements :

- `20261116184406` → `20261117141437`
- `20261116185127` → `20261117141448`
- `20261116185500` → `20261117141451`
- `20261116190000` → `20261117141454`
- `20261116190500` → `20261117141457`
- `20261116191000` → `20261117141503`
- `20261116192500` → `20261117141507`
- `20261116193000` → `20261117141509`
- `20261116194000` → `20261117141512`
- `20261116195000` → `20261117141515`
- `20261116220000` → `20261117141520`
- `20261116221000` → `20261117141523`
- `20261116223000` → `20261117141525`
- `20261116230000` → `20261117141527`
- `20261116230100` → `20261117141530`
- `20261116230200` → `20261117141536`
- `20261116230300` → `20261117141538`
- `20261116230400` → `20261117141541`
- `20261116230500` → `20261117141544`
- `20261117112653` → `20261117141549`


Les fichiers de migration historiques ont été reconstruits à partir de supabase_migrations.schema_migrations en production, en conservant les versions exactes, les noms canoniques et le SQL appliqué. Cela évite de rejouer les 64 migrations existantes lors d'une future livraison.

Les 20 migrations de livraison sont toutes présentes dans l'historique de production. Il ne reste aucune migration en attente.
## Procédure de publication

1. Les 84 versions locales correspondent désormais aux 84 migrations réellement enregistrées en production.
2. Les 20 migrations de livraison ont été appliquées et vérifiées individuellement; aucune migration n'est en attente.
3. Vérifier les sauvegardes dans le tableau de bord Supabase avant toute future modification structurelle importante.
4. Vérifier ensuite les fonctions planifiées, le statut des services, les prix M5, les notifications Telegram, le calendrier FOMC/CME et les actualités.
