-- Empêche un utilisateur authentifié de s'attribuer le rôle administrateur.
-- Les utilisateurs peuvent uniquement modifier leurs champs de profil non sensibles.
revoke update on table public.profiles from authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;
