# AUREVIA COPILOT V2.3.91 — Conversion automatique des devises

## Nouveautés
- Détection de la devise de cotation à partir du symbole (Forex, métaux, indices, matières premières et actifs pris en charge).
- Récupération sécurisée du taux de change côté serveur via Twelve Data Exchange Rate.
- Utilisation du taux direct ou, si nécessaire, du taux inverse.
- Conversion du P/L des contrats vers la devise du compte lors de chaque clôture manuelle ou TP/SL surveillée.
- Même comportement pour les positions confirmées et enregistrées depuis Telegram.
- Enregistrement de la devise source, de la devise cible, du taux, de la source et de l’horodatage sur chaque clôture.
- Les méthodes valeur du point / valeur du tick restent exprimées dans la devise du compte, afin d’éviter une double conversion.

## Sécurité financière
- Si les deux devises sont identiques, le taux appliqué est 1.
- Si le taux est indisponible ou si la devise de cotation ne peut pas être déterminée, AUREVIA suspend le calcul converti au lieu d’utiliser un taux fictif.
- Aucun ordre n’est transmis à un broker. Le suivi reste limité aux positions enregistrées dans AUREVIA.

## Migration requise
Appliquer `supabase/migrations/20261113170000_position_close_fx_snapshots_v2391.sql` avant le déploiement pour ajouter `fx_snapshot` à `trading_position_closes`.

## Validation locale
- 265 tests automatisés réussis.
- Build de production réussi.
- Syntaxe des fonctions Netlify modifiées vérifiée.
- Les appels réels à Twelve Data et le déploiement de production restent à valider dans l’environnement Netlify configuré.
