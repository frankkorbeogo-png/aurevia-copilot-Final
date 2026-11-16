-- Enforce the permanent email block at the Auth database boundary.
-- This avoids relying on a dashboard hook configuration and also blocks changing an
-- existing account's email to an address that has been permanently blocked.
drop function if exists public.aurevia_before_user_created(jsonb);

create or replace function app_private.aurevia_guard_blocked_email()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_private, extensions
as $$
declare v_fingerprint text;
begin
  if new.email is null or btrim(new.email)='' then return new; end if;
  if tg_op='UPDATE' and lower(btrim(coalesce(old.email,'')))=lower(btrim(new.email)) then return new; end if;
  v_fingerprint:=app_private.aurevia_email_fingerprint(new.email);
  if exists(select 1 from app_private.aurevia_blocked_emails b where b.email_fingerprint=v_fingerprint) then
    raise exception using
      errcode='23514',
      message='Cette adresse e-mail ne peut pas être utilisée pour créer ou modifier un compte AUREVIA. Contactez le support si vous pensez qu’il s’agit d’une erreur.';
  end if;
  return new;
end;
$$;
revoke all on function app_private.aurevia_guard_blocked_email() from public, anon, authenticated, service_role;

drop trigger if exists aurevia_guard_blocked_email on auth.users;
create trigger aurevia_guard_blocked_email
before insert or update of email on auth.users
for each row execute function app_private.aurevia_guard_blocked_email();
