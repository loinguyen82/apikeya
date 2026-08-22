-- Hexa tokenizer metadata is explicit catalog data. The UI never infers a
-- Hugging Face tokenizer from a display name or upstream alias.
--
-- hf:             configured Hugging Face tokenizer, compatibility not claimed
-- hf-compatible:  known compatible tokenizer, not provider-native billing truth
-- hf-official:    reserved for a verified provider/model tokenizer mapping

update public.models
set tokenizer_family = 'hf:moonshotai/Kimi-K2.6',
    context_window_tokens = coalesce(context_window_tokens, 262144)
where id = 'kimi-k2.6';

update public.models
set tokenizer_family = 'hf-compatible:deepseek-ai/DeepSeek-V4-Flash',
    context_window_tokens = coalesce(context_window_tokens, 1048576)
where id = 'deepseek-v4';

update public.models
set tokenizer_family = 'hf-compatible:Xenova/claude-tokenizer'
where id = 'claude-sonnet-5';

update public.models
set tokenizer_family = 'hf-compatible:Xenova/gpt-4o'
where id in ('gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol');
