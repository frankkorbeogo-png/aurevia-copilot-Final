-- Persist pending-order expiry and apply it atomically in AUREVIA's server-side monitor.
alter table public.trading_positions
  add column if not exists expires_at timestamptz,
  add column if not exists expired_at timestamptz;

comment on column public.trading_positions.expires_at is
  'Optional expiry deadline for an internal AUREVIA pending order.';
comment on column public.trading_positions.expired_at is
  'Timestamp when AUREVIA automatically expired a pending order.';

alter table public.trading_journal
  drop constraint if exists trading_journal_result_check;
alter table public.trading_journal
  add constraint trading_journal_result_check
  check (result = any (array['WIN','LOSS','BREAKEVEN','OPEN','EXPIRED']::text[]));

create or replace function public.aurevia_expire_pending_position_worker(
  p_position_id uuid,
  p_user_id uuid,
  p_expired_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_position public.trading_positions%rowtype;
  v_group public.trading_position_groups%rowtype;
  v_updated integer := 0;
  v_net numeric := 0;
  v_gross numeric := 0;
  v_fees numeric := 0;
  v_remaining numeric := 0;
  v_all_closed boolean := false;
  v_all_expired boolean := false;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Accès réservé au service de surveillance';
  end if;
  if p_position_id is null or p_user_id is null or p_expired_at is null then
    raise exception 'Paramètres d’expiration invalides';
  end if;

  select * into v_position
  from public.trading_positions
  where id=p_position_id and user_id=p_user_id
  for update;
  if not found then raise exception 'Position introuvable'; end if;

  if v_position.expired_at is not null then
    return jsonb_build_object('ok',true,'expired',false,'duplicate',true,'status','CLOSED');
  end if;
  if v_position.status <> 'PENDING' then
    return jsonb_build_object('ok',true,'expired',false,'duplicate',false,'status',v_position.status);
  end if;
  if v_position.expires_at is null or v_position.expires_at > p_expired_at then
    return jsonb_build_object('ok',true,'expired',false,'duplicate',false,'reason','NOT_EXPIRED');
  end if;

  update public.trading_positions
  set status='CLOSED',
      volume_remaining=0,
      expired_at=p_expired_at,
      closed_at=p_expired_at,
      updated_at=now()
  where id=p_position_id and user_id=p_user_id and status='PENDING';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    return jsonb_build_object('ok',true,'expired',false,'duplicate',true,'status','CLOSED');
  end if;

  select * into v_group
  from public.trading_position_groups
  where id=v_position.group_id and user_id=p_user_id
  for update;
  if not found then raise exception 'Groupe de positions introuvable'; end if;

  if v_group.auto_journal then
    if v_group.mode='unique' then
      select coalesce(sum(net_pnl),0),coalesce(sum(gross_pnl),0),
             coalesce(sum(fees),0),coalesce(sum(volume_remaining),0),
             bool_and(status='CLOSED'),
             bool_and(expired_at is not null)
      into v_net,v_gross,v_fees,v_remaining,v_all_closed,v_all_expired
      from public.trading_positions
      where group_id=v_group.id and user_id=p_user_id;

      update public.trading_journal
      set pnl=v_net,gross_pnl=v_gross,fees=v_fees,volume_remaining=v_remaining,
          result=case
            when coalesce(v_all_closed,false) and coalesce(v_all_expired,false) then 'EXPIRED'
            when coalesce(v_all_closed,false) then case when v_net>0 then 'WIN' when v_net<0 then 'LOSS' else 'BREAKEVEN' end
            else 'OPEN'
          end,
          notes=case
            when position_id is null and coalesce(notes,'') not like '%Ordre expiré automatiquement%'
              then concat_ws(' · ',nullif(notes,''),'Ordre expiré automatiquement')
            else notes
          end,
          closed_at=case when coalesce(v_all_closed,false) then p_expired_at else null end,
          updated_at=now()
      where user_id=p_user_id and group_id=v_group.id and position_id is null;
    else
      update public.trading_journal
      set pnl=0,gross_pnl=0,fees=0,volume_remaining=0,result='EXPIRED',
          notes=concat_ws(' · ',nullif(notes,''),'Ordre expiré automatiquement'),
          closed_at=p_expired_at,updated_at=now()
      where user_id=p_user_id and position_id=p_position_id;
    end if;
  end if;

  update public.trading_position_groups
  set status=case when not exists (
        select 1 from public.trading_positions
        where group_id=v_group.id and user_id=p_user_id and status<>'CLOSED'
      ) then 'CLOSED' else 'OPEN' end,
      updated_at=now()
  where id=v_group.id and user_id=p_user_id;

  return jsonb_build_object('ok',true,'expired',true,'duplicate',false,'status','CLOSED');
end;
$$;

revoke all on function public.aurevia_expire_pending_position_worker(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.aurevia_expire_pending_position_worker(uuid,uuid,timestamptz) to service_role;
