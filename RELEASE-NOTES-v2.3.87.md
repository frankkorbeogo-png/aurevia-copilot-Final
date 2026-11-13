# AUREVIA COPILOT V2.3.87 — Simplification des paramètres de position

- Retrait du nom du broker et du type de compte du formulaire d'enregistrement.
- Retrait du champ de conversion manuelle.
- La devise du compte et le levier restent disponibles.
- Même simplification dans le parcours Telegram : après le lot, Telegram demande la devise et le levier, puis les spécifications de calcul nécessaires (contrat/point/tick, minimum et pas de lot, frais, etc.).
- Les anciens snapshots conservent leurs éventuels champs broker/type pour préserver l'historique.
- Aucun ordre broker/MT5 n'est exécuté.
- Tests : 256 réussis.
