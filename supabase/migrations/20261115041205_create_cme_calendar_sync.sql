create table if not exists public.cme_calendar_sync (
   source_key text primary key,
   source_url text not null,
   fetched_at timestamptz not null default now(),
   content_hash text not null,
   source_excerpt text not null,
   holiday_candidates jsonb not null default '[]'::jsonb,
   parse_status text not null default 'ok',
   note text not null default 'Données indicatives à vérifier par marché et produit; aucune fermeture automatique.'
 );
 alter table public.cme_calendar_sync enable row level security;
