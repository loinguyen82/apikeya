-- Khởi tạo Upstream Providers
insert into public.providers(id,name,base_url,api_key_secret_name,status,timeout_ms,safe_no_charge_statuses) values
('a6api','A6API','https://api.a6api.com/v1','A6API_KEY','healthy',60000,'{}')
on conflict(id) do update set name=excluded.name, base_url=excluded.base_url, timeout_ms=excluded.timeout_ms;

-- Danh mục Models (Giá microVND: 1 VND = 1000 microVND)
-- Retail 2026-08-21: giữ cạnh tranh nhưng vẫn chừa biên so với cost route đang cấu hình.
insert into public.models(id,display_name,description,tags,status,pricing_mode,retail_flat_micros_per_mtoken,default_max_output_tokens,max_output_tokens,streaming_enabled) values
('kimi-k2.6','Kimi K2.6','Giá thấp cho chat dài, code và automation.',array['Giá rẻ','Chat'],'active','flat_total',150000,2048,8192,true),
('deepseek-v4','DeepSeek V4','Mô hình reasoning và code tiết kiệm.',array['Code','Tiết kiệm'],'active','flat_total',300000,4096,8192,true),
('claude-sonnet-5','Claude Sonnet 5','Khả năng code và phân tích ngữ cảnh dài.',array['Code','Phân tích'],'active','flat_total',750000,4096,8192,true),
('gpt-5.6-terra','GPT-5.6 Terra','Cân bằng giữa tốc độ và chất lượng.',array['Đa năng','Nhanh'],'active','flat_total',1500000,4096,8192,true),
('gpt-5.6-luna','GPT-5.6 Luna','Tối ưu cho tác vụ thường ngày, sáng tạo và coding.',array['Sáng tạo','Code'],'active','flat_total',600000,4096,8192,true),
('gpt-5.6-sol','GPT-5.6 Sol','Model mạnh cho reasoning và tác vụ kỹ thuật khó.',array['Reasoning','Logic'],'active','flat_total',2500000,4096,8192,true)
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

-- Ánh xạ tuyến Upstream sang A6API. Các cost dưới đây là cost snapshot cấu hình,
-- cần được admin sync/đối soát khi upstream đổi giá.
insert into public.provider_models(provider_id,model_id,upstream_model,priority,enabled,supports_stream_usage,upstream_input_micros_per_mtoken,upstream_output_micros_per_mtoken) values
('a6api','kimi-k2.6','kimi-k2.6',10,true,true,15000,15000),
('a6api','deepseek-v4','deepseek-v4',10,true,true,35000,35000),
('a6api','claude-sonnet-5','claude-sonnet-5',10,true,true,80000,80000),
('a6api','gpt-5.6-terra','gpt-5.6-terra',10,true,true,200000,200000),
('a6api','gpt-5.6-luna','gpt-5.6-luna',10,true,true,250000,250000),
('a6api','gpt-5.6-sol','gpt-5.6-sol',10,true,true,330000,330000)
on conflict(provider_id,model_id) do update set
  upstream_model=excluded.upstream_model,
  priority=excluded.priority,
  enabled=excluded.enabled,
  supports_stream_usage=excluded.supports_stream_usage,
  upstream_input_micros_per_mtoken=excluded.upstream_input_micros_per_mtoken,
  upstream_output_micros_per_mtoken=excluded.upstream_output_micros_per_mtoken;
