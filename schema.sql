-- Jalankan ini di Supabase Dashboard → SQL Editor

create table if not exists public.detected_tokens (
  id uuid primary key default gen_random_uuid(),
  mint text unique not null,
  name text,
  symbol text,
  creator_wallet text,
  market_cap_sol numeric,
  initial_buy numeric,
  sol_amount numeric,

  rugcheck_score numeric,
  rugcheck_risk_level text,     -- 'DANGER' | 'WARNING' | 'OK'
  rugcheck_risks text[],

  pumpfun_market_cap_usd numeric,
  pumpfun_complete boolean,
  pumpfun_king_of_hill boolean,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_detected_tokens_created_at
  on public.detected_tokens (created_at desc);

-- Trigger biar updated_at otomatis ke-refresh tiap kali row di-update
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_updated_at on public.detected_tokens;
create trigger trg_set_updated_at
  before update on public.detected_tokens
  for each row execute function public.set_updated_at();

-- Aktifkan Row Level Security + izinkan SELECT publik
-- (dashboard read-only untuk siapapun yang punya link; insert/update HANYA lewat service_role key dari worker)
alter table public.detected_tokens enable row level security;

drop policy if exists "Public read access" on public.detected_tokens;
create policy "Public read access"
  on public.detected_tokens
  for select
  using (true);

-- Aktifkan Realtime untuk tabel ini
alter publication supabase_realtime add table public.detected_tokens;
