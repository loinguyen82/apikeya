-- Context limits must come from verified provider metadata, not inferred model
-- names. Clear only the values introduced with the account-console migration.
update public.models
set context_window = null
where id in (
  'kimi-k2.6',
  'deepseek-v4',
  'claude-sonnet-5',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.6-sol'
);
