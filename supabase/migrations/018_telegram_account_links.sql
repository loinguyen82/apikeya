create table if not exists public.telegram_account_links (
  telegram_user_id text primary key,
  telegram_chat_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete set null,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists telegram_account_links_user_id_idx
  on public.telegram_account_links(user_id);

alter table public.telegram_account_links enable row level security;

revoke all on table public.telegram_account_links from anon;
revoke all on table public.telegram_account_links from authenticated;
