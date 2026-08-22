-- Expand the catalog with popular per-token models currently listed by A6 Marketplace.
-- Prices are snapshots in micro-VND: A6 min_input_price_micros converted with
-- 25,400 VND/USD, then +100 VND per 1M token for the user retail price.
-- The Admin Marketplace preview remains the source for future price review.

insert into public.models(
  id, display_name, description, tags, status, pricing_mode,
  retail_flat_micros_per_mtoken, default_max_output_tokens, max_output_tokens, streaming_enabled
) values
('gpt-5.5','GPT-5.5','Mô hình đa năng cho chat, code và tác vụ reasoning.',array['Đa năng','Code'],'active','flat_total',862000,4096,8192,true),
('gpt-5.4','GPT-5.4','Mô hình OpenAI cân bằng chất lượng và chi phí.',array['Đa năng','Reasoning'],'active','flat_total',923000,4096,8192,true),
('claude-opus-5','Claude Opus 5','Mô hình Anthropic cao cấp cho phân tích và code khó.',array['Code','Phân tích'],'active','flat_total',405000,4096,8192,true),
('gemini-3.1-pro-preview','Gemini 3.1 Pro Preview','Mô hình Google cho reasoning và ngữ cảnh dài.',array['Reasoning','Context'],'active','flat_total',1291000,4096,8192,true),
('grok-4.6','Grok 4.6','Mô hình xAI nhanh cho chat và tác vụ đa năng.',array['Đa năng','Nhanh'],'active','flat_total',173000,4096,8192,true),
('glm-5.2','GLM 5.2','Mô hình tiết kiệm cho chat và code.',array['Giá rẻ','Code'],'active','flat_total',124000,4096,8192,true),
('qwen3.7-plus','Qwen 3.7 Plus','Mô hình Alibaba cho đa ngôn ngữ và coding.',array['Đa năng','Code'],'active','flat_total',344000,4096,8192,true),
('minimax-m3','MiniMax M3','Mô hình tiết kiệm cho tác vụ thường ngày.',array['Giá rẻ','Chat'],'active','flat_total',176000,4096,8192,true),
('kimi-k3','Kimi K3','Mô hình Moonshot cho chat dài và coding.',array['Chat','Code'],'active','flat_total',359000,4096,8192,true),
('deepseek-v4-flash','DeepSeek V4 Flash','Biến thể DeepSeek nhanh và tiết kiệm.',array['Giá rẻ','Code'],'active','flat_total',124000,4096,8192,true)
on conflict(id) do update set
  display_name=excluded.display_name,
  description=excluded.description,
  tags=excluded.tags,
  status=excluded.status,
  pricing_mode=excluded.pricing_mode,
  retail_flat_micros_per_mtoken=excluded.retail_flat_micros_per_mtoken,
  default_max_output_tokens=excluded.default_max_output_tokens,
  max_output_tokens=excluded.max_output_tokens,
  streaming_enabled=excluded.streaming_enabled;

insert into public.provider_models(
  provider_id, model_id, upstream_model, priority, enabled, supports_stream_usage,
  upstream_input_micros_per_mtoken, upstream_output_micros_per_mtoken
) values
('a6api','gpt-5.5','gpt-5.5',10,true,true,762000,762000),
('a6api','gpt-5.4','gpt-5.4',10,true,true,823000,823000),
('a6api','claude-opus-5','claude-opus-5',10,true,true,305000,305000),
('a6api','gemini-3.1-pro-preview','gemini-3.1-pro-preview',10,true,true,1191000,1191000),
('a6api','grok-4.6','grok-4.6',10,true,true,73000,73000),
('a6api','glm-5.2','glm-5.2',10,true,true,24000,24000),
('a6api','qwen3.7-plus','qwen3.7-plus',10,true,true,244000,244000),
('a6api','minimax-m3','minimax-m3',10,true,true,76000,76000),
('a6api','kimi-k3','kimi-k3',10,true,true,259000,259000),
('a6api','deepseek-v4-flash','deepseek-v4-flash',10,true,true,24000,24000)
on conflict(provider_id,model_id) do update set
  upstream_model=excluded.upstream_model,
  priority=excluded.priority,
  enabled=excluded.enabled,
  supports_stream_usage=excluded.supports_stream_usage,
  upstream_input_micros_per_mtoken=excluded.upstream_input_micros_per_mtoken,
  upstream_output_micros_per_mtoken=excluded.upstream_output_micros_per_mtoken;
