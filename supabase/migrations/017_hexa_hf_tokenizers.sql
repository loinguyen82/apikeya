-- Hexa tokenizer metadata is explicit catalog data.
-- Do not infer tokenizer compatibility from display names or upstream aliases.
-- Existing context-window values are intentionally left untouched.

update public.models
set tokenizer_family = 'hf:moonshotai/Kimi-K2.6'
where id = 'kimi-k2.6';

update public.models
set tokenizer_family = 'hf-compatible:deepseek-ai/DeepSeek-V4-Flash'
where id = 'deepseek-v4';

update public.models
set tokenizer_family = 'hf-compatible:Xenova/claude-tokenizer'
where id = 'claude-sonnet-5';

update public.models
set tokenizer_family = 'hf-compatible:Xenova/gpt-4o'
where id in ('gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol');
