/**
 * Tự động kết nối và lấy số dư thực tế theo thời gian thực từ A6API
 */
export async function getA6LiveBalance(): Promise<{ usd: number; vnd: number }> {
  const apiKey = process.env.A6API_KEY || 'sk-kU4qv9ydZ3os8PT60TkM8JvyuKxIdx6MFSzh63JucqLs00dE'
  const baseUrl = (process.env.A6API_BASE_URL || 'https://api.a6api.com/v1').replace(/\/$/, '')
  const rate = 25400 // 1 USD = 25.400 VND

  let remainingUsd = 4.0 // Giá trị mặc định an toàn

  try {
    // 1. Thử lấy subscription limit từ A6API
    const subRes = await fetch(`${baseUrl}/dashboard/billing/subscription`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 10 }, // Cache 10s để load trang siêu nhanh
    })

    if (subRes.ok) {
      const sub = await subRes.json()
      const hardLimit = sub.hard_limit_usd || sub.system_hard_limit_usd || 0

      // 2. Lấy usage hiện tại
      const now = new Date()
      const startDate = `${now.getFullYear()}-01-01`
      const endDate = `${now.getFullYear() + 1}-01-01`
      
      const usageRes = await fetch(`${baseUrl}/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 10 },
      })

      if (usageRes.ok) {
        const usage = await usageRes.json()
        const usedUsd = (usage.total_usage || 0) / 100 // total_usage tính bằng cents
        if (hardLimit > 0) {
          remainingUsd = Math.max(0, hardLimit - usedUsd)
        }
      } else if (hardLimit > 0) {
        remainingUsd = hardLimit
      }
    }
  } catch (err) {
    console.error('Error fetching live A6 balance:', err)
  }

  const vnd = Math.round(remainingUsd * rate)
  return { usd: remainingUsd, vnd }
}
