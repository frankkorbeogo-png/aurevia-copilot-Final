# AUREVIA COPILOT V2.3.82 — Assistant Telegram guidé

## Objectif
Simplifier la confirmation et l’enregistrement des trades directement depuis Telegram. Les utilisateurs n’ont plus à saisir de commandes techniques `/lot` ou `/spec` ni de JSON.

## Nouveau parcours
1. Après confirmation de l’entrée, Telegram propose deux boutons : **Position unique** ou **Trades séparés**.
2. Le bot demande le lot, puis le broker, le type de compte, la devise et le levier.
3. L’utilisateur choisit la méthode de calcul : contrat, point ou tick.
4. Le bot demande uniquement les paramètres correspondant à cette méthode, puis le lot minimum, le pas, le maximum et les frais. La marge par lot est facultative.
5. Un récapitulatif est présenté avec les boutons Confirmer, Modifier le lot, Modifier les paramètres et Annuler.
6. La position n’est créée qu’après confirmation explicite. Le serveur valide les paramètres et appelle la RPC Supabase protégée par service_role.

## Sécurité et limites
- Le parcours reste privé : seuls les messages et boutons du chat Telegram privé associé au compte sont acceptés.
- Le code de confirmation expire selon la fenêtre du scénario.
- Les spécifications saisies sont enregistrées dans le snapshot du trade.
- Aucune connexion broker ni exécution d’ordre n’est ajoutée.
