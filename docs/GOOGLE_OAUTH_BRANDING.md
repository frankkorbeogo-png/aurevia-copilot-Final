# Identité AUREVIA dans l'écran Google OAuth

Le logo affiché **dans la page de connexion AUREVIA** est chargé par l'application depuis `assets/aurevia-logo-mark.png`. Il ne se configure pas dans Supabase.

Le logo affiché **sur l'écran Google de sélection/consentement du compte** se configure dans Google Cloud :

1. Ouvrir [Google Auth Platform – Branding](https://console.cloud.google.com/auth/branding) dans le projet Google qui contient le client OAuth utilisé par AUREVIA.
2. Renseigner le nom de l'application : **AUREVIA COPILOT**.
3. Ajouter le logo fourni dans `assets/aurevia-google-oauth-logo.jpg` (version carrée 512 × 512, fond bleu nuit).
4. Renseigner l'adresse d'assistance et les liens publics de politique de confidentialité et de conditions d'utilisation si Google les demande. N'utiliser que des URL réellement publiées et accessibles.
5. Enregistrer les modifications. Si Google demande une vérification de marque, compléter le processus dans la console ; l'affichage du logo peut rester limité ou différé tant que la vérification n'est pas terminée.
6. Dans **Google Auth Platform → Clients**, conserver le client OAuth Web utilisé par AUREVIA et ses origines autorisées. L'URI de redirection Google doit rester le callback Supabase indiqué dans Supabase → Authentication → Sign In / Providers → Google.

## Réglages qui restent dans Supabase

Dans [Supabase Authentication – Providers](https://supabase.com/dashboard/project/imkwbizyblzuevkodzqc/auth/providers), garder Google activé et conserver le Client ID / Client Secret correspondant au client Web Google. Dans **URL Configuration**, conserver le Site URL `https://aurevia-copilot-ia.netlify.app/` et l'URL de redirection autorisée de production.

Supabase orchestre l'authentification et le callback ; il ne remplace pas le réglage **Branding** de Google. Ne pas désactiver Google. Le formulaire de l'application ne propose que « Continuer avec Google » ; ne désactiver le fournisseur Email dans Supabase qu'après avoir vérifié qu'aucun autre parcours ne dépend de l'e-mail, du mot de passe ou des OTP.

## À vérifier après enregistrement

- Ouvrir une fenêtre privée et cliquer sur « Continuer avec Google ».
- Vérifier le nom AUREVIA COPILOT et le logo sur l'écran Google, si Google l'affiche pour ce type de parcours.
- Vérifier que la redirection revient sur `https://aurevia-copilot-ia.netlify.app/` et que la session est ouverte.
- Si le logo n'apparaît pas immédiatement, vérifier l'état de validation de marque Google ; ne pas modifier le callback Supabase pour corriger un problème de logo.
