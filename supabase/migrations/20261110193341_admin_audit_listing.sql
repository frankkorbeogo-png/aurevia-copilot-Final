-- Lecture de l’audit réservée au backend administrateur.
create or replace function public.aurevia_admin_audit_list(p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, app_private
as $$
begin
 if not exists(select 1 from app_private.admin_users where user_id=p_actor_id) then raise exception 'ADMIN_REQUIRED'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'actor_id',actor_id,'action',action,'target_user_id',target_user_id,'details',details,'created_at',created_at) order by created_at desc) from (select * from app_private.admin_audit_log order by created_at desc limit 100) recent),'[]'::jsonb);
end; $$;
revoke all on function public.aurevia_admin_audit_list(uuid) from public, anon, authenticated;
grant execute on function public.aurevia_admin_audit_list(uuid) to service_role;
