-- Cover foreign keys used by usage, provider and admin history queries.
create index if not exists api_requests_api_key_idx on public.api_requests(api_key_id);
create index if not exists api_requests_model_idx on public.api_requests(model_id);
create index if not exists api_requests_provider_idx on public.api_requests(provider_id);
create index if not exists provider_attempts_provider_idx on public.provider_attempts(provider_id);
create index if not exists provider_models_model_idx on public.provider_models(model_id);
create index if not exists admin_audit_log_actor_idx on public.admin_audit_log(actor_user_id);
