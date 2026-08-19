/**
 * Tự động kết nối và lấy số dư THỰC TẾ từ tài khoản A6API (qua API User Self / Quota chuẩn)
 */
export async function getA6LiveBalance(): Promise<{ usd: number; vnd: number }> {
  const apiKey = process.env.A6API_KEY
  if (!apiKey) throw new Error('A6API_KEY_NOT_CONFIGURED')
  const rate = 25400 // 1 USD = 25.400 VND

  let actualUsd: number | null = null

  // Danh sách các endpoint lấy số dư thực tế của hệ thống A6API (NewAPI / OneAPI backend)
  const candidateUrls = [
    'https://a6api.com/api/user/self',
    'https://api.a6api.com/api/user/self',
    'https://api.a6api.com/v1/user/self',
    'https://api.a6api.com/v1/dashboard/billing/subscription',
    'https://a6api.com/api/user/dashboard',
  ]

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store', // Luôn lấy số dư mới nhất từng giây
      })

      if (res.ok) {
        const data = await res.json()

        // 1. Trường hợp trả về đối tượng User của NewAPI: { success: true, data: { quota: 2000000 } }
        if (data?.data?.quota != null) {
          const quota = Number(data.data.quota)
          // 500.000 quota = 1 USD trong hệ thống NewAPI
          actualUsd = quota / 500000
          break
        }

        // 2. Trường hợp trả về Subscription của OpenAI format
        if (data?.hard_limit_usd != null) {
          const raw = Number(data.hard_limit_usd)
          if (raw < 1000000) {
            actualUsd = raw
            break
          } else {
            actualUsd = raw / 500000
            break
          }
        }

        // 3. Trường hợp trả về trực tiếp balance / quota
        if (data?.quota != null) {
          actualUsd = Number(data.quota) / 500000
          break
        }
      }
    } catch {
      // Thử endpoint tiếp theo
    }
  }

  if (actualUsd == null || !Number.isFinite(actualUsd) || actualUsd < 0) {
    throw new Error('A6_BALANCE_UNAVAILABLE')
  }

  // Làm tròn 2 chữ số thập phân (ví dụ: 4.15 USD)
  const finalUsd = Number(actualUsd.toFixed(2))
  const vnd = Math.round(finalUsd * rate)

  return { usd: finalUsd, vnd }
}
