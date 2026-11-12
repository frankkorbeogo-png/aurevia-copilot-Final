# AUREVIA COPILOT V2.3.46 — Éditeur professionnel de synthèse

## Refonte de l’espace concerné
- L’éditeur « Synthèse finale du scénario » devient un espace de rédaction structuré et professionnel.
- Bandeau de contexte : instrument, direction, état et dernière modification.
- Zone de rédaction agrandie, compteur de caractères et actions de structuration/restauration du brouillon.
- Modèle guidé : contexte H4/H1, structure M30/M15, confirmations, plan d’entrée, SL/TP, déclencheur, invalidation, risques et conclusion.
- La synthèse générée par la confrontation reste éditable ; le bouton de structuration ne prétend pas compléter les données techniques manquantes.
- Brouillon local conservé sur l’appareil et restaurable.

## Enregistrement et sécurité
- L’enregistrement manuel appelle `/api/scenario` avec la session active.
- Un scénario ne peut être enregistré pour surveillance que si le moteur a identifié le côté BUY/SELL et fourni entrée, zone, SL et au moins un TP cohérent.
- Aucune connexion broker ni exécution d’ordre externe.

## Validation
- Build réussi et 159 tests automatisés réussis.
- Aucun déploiement Netlify ni migration Supabase de production effectué.
