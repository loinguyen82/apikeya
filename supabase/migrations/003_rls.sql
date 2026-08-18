alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.api_keys enable row level security;
alter table public.models enable row level security;
alter table public.api_requests enable row level security;
alter table public.topups enable row level security;

create policy profiles_self_read on public.profiles for select using (auth.uid()=id);
create policy wallets_self_read on public.wallets for select using (auth.uid()=user_id);
create policy ledger_self_read on public.wallet_ledger for select using (auth.uid()=user_id);
create policy api_keys_self_read on public.api_keys for select using (auth.uid()=user_id);
create policy models_public_read on public.models for select using (status<>'disabled');
create policy requests_self_read on public.api_requests for select using (auth.uid()=user_id);
create policy topups_self_read on public.topups for select using (auth.uid()=user_id);

alter table public.providers enable row level security;
alter table public.provider_models enable row level security;
alter table public.provider_attempts enable row level security;
alter table public.admin_audit_log enable row level security;
