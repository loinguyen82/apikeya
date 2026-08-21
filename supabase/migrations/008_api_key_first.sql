-- API-key-first portal invariant: one wallet/user may have at most one active key.
-- Historical revoked keys remain for auditability.
create unique index if not exists api_keys_one_active_per_user_idx
  on public.api_keys (user_id)
  where status = 'active';
