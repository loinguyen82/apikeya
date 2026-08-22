import type { Env } from '../env.js'
import { adminDb } from '../repositories/supabase.js'
import { isSupportedApiKey } from '../middleware/api-key.js'
import { hmacSha256Hex, sha256Hex } from '../utils/crypto.js'

const BOT_USERNAME = 'Apivn_bot'
const WEB_BASE_URL = 'https://apivn.tech'
const INTERNAL_TOPUP_URL = `${WEB_BASE_URL}/api/internal/telegram/topups`

const MAIN_KEYBOARD = {
  keyboard: [
    ['💰 Nạp tiền', '💳 Số dư'],
    ['🔑 Liên kết API key', '🔄 Kiểm tra nạp'],
    ['📚 Hướng dẫn', '☎️ Liên hệ'],
    ['🚪 Huỷ liên kết'],
  ],
  resize_keyboard: true,
  is_persistent: true,
}

const TOPUP_KEYBOARD = {
  keyboard: [
    ['10.000đ', '20.000đ', '50.000đ'],
    ['100.000đ', '200.000đ'],
    ['500.000đ', '1.000.000đ'],
    ['⬅️ Menu'],
  ],
  resize_keyboard: true,
  is_persistent: true,
}

const TOPUP_AMOUNTS = new Map<string, number>([
  ['10.000đ', 10_000],
  ['20.000đ', 20_000],
  ['50.000đ', 50_000],
  ['100.000đ', 100_000],
  ['200.000đ', 200_000],
  ['500.000đ', 500_000],
  ['1.000.000đ', 1_000_000],
])

type TelegramMessage = {
  message_id?: number
  text?: string
  chat?: { id?: number | string; type?: string }
  from?: { id?: number | string }
}

type TelegramUpdate = { message?: TelegramMessage }

type TelegramLink = {
  telegram_user_id: string
  telegram_chat_id: string
  user_id: string
  api_key_id: string | null
}

type TopupResponse = {
  ok?: boolean
  topupId?: string
  amount?: number
  bonus?: number
  description?: string
  expiresAt?: string
  checkoutUrl?: string
  qrCode?: string | null
  error?: string
}

async function telegramApi(env: Env, method: string, body: Record<string, unknown>) {
  if (!env.TELEGRAM_BOT_TOKEN) return null
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function sendMessage(
  env: Env,
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  const response = await telegramApi(env, 'sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  })
  if (response && !response.ok) {
    console.error('telegram commerce sendMessage failed', response.status, (await response.text()).slice(0, 240))
  }
}

async function deleteMessage(env: Env, chatId: string, messageId?: number): Promise<void> {
  if (!messageId) return
  try {
    await telegramApi(env, 'deleteMessage', { chat_id: chatId, message_id: messageId })
  } catch {
    // Best effort: never fail account linking because Telegram cannot delete the message.
  }
}

function formatVnd(value: bigint | number) {
  const amount = typeof value === 'bigint' ? Number(value) : value
  return `${new Intl.NumberFormat('vi-VN').format(amount)}đ`
}

function microsToVnd(value: string | number | bigint | null | undefined) {
  if (value == null) return 0n
  try {
    return BigInt(value) / 1000n
  } catch {
    return 0n
  }
}

async function getLink(env: Env, telegramUserId: string): Promise<TelegramLink | null> {
  const { data, error } = await adminDb(env)
    .from('telegram_account_links')
    .select('telegram_user_id,telegram_chat_id,user_id,api_key_id')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle()
  if (error) throw new Error(`TELEGRAM_LINK_LOOKUP_FAILED:${error.code ?? 'unknown'}`)
  return data as TelegramLink | null
}

async function linkApiKey(
  env: Env,
  telegramUserId: string,
  chatId: string,
  plaintext: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSupportedApiKey(plaintext)) {
    return { ok: false, message: 'API key không đúng định dạng APIVN.' }
  }

  const secretHash = await sha256Hex(plaintext)
  const db = adminDb(env)
  const { data: apiKey, error } = await db
    .from('api_keys')
    .select('id,user_id,status,expires_at')
    .eq('secret_hash', secretHash)
    .maybeSingle()

  if (error) return { ok: false, message: 'Không thể xác minh API key lúc này.' }
  if (!apiKey) return { ok: false, message: 'API key không hợp lệ.' }
  if (apiKey.status !== 'active') return { ok: false, message: 'API key đã bị thu hồi.' }
  if (apiKey.expires_at && Date.parse(apiKey.expires_at) <= Date.now()) {
    return { ok: false, message: 'API key đã hết hạn.' }
  }

  // Proof of API key ownership is enough to move this APIVN account to the current Telegram user.
  await db
    .from('telegram_account_links')
    .delete()
    .eq('user_id', apiKey.user_id)
    .neq('telegram_user_id', telegramUserId)

  const { error: upsertError } = await db.from('telegram_account_links').upsert({
    telegram_user_id: telegramUserId,
    telegram_chat_id: chatId,
    user_id: apiKey.user_id,
    api_key_id: apiKey.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'telegram_user_id' })

  if (upsertError) return { ok: false, message: 'Không thể lưu liên kết Telegram.' }
  return { ok: true }
}

async function requireLink(env: Env, telegramUserId: string, chatId: string): Promise<TelegramLink | null> {
  const link = await getLink(env, telegramUserId)
  if (link) return link
  await sendMessage(
    env,
    chatId,
    '🔑 Bạn chưa liên kết tài khoản APIVN.\n\nBấm “Liên kết API key” rồi gửi một API key đang hoạt động. Bot chỉ hash để xác minh và không lưu plaintext key.',
    MAIN_KEYBOARD,
  )
  return null
}

async function showMainMenu(env: Env, chatId: string, telegramUserId: string) {
  const linked = await getLink(env, telegramUserId).catch(() => null)
  await sendMessage(
    env,
    chatId,
    linked
      ? '🤖 APIVN Bot\nTài khoản đã liên kết. Chọn chức năng bên dưới:'
      : '🤖 APIVN Bot\nĐể nạp tiền hoặc xem số dư, hãy liên kết API key một lần.',
    MAIN_KEYBOARD,
  )
}

async function showTopupMenu(env: Env, chatId: string, telegramUserId: string) {
  const link = await requireLink(env, telegramUserId, chatId)
  if (!link) return
  await sendMessage(
    env,
    chatId,
    '💰 Chọn số tiền muốn nạp.\n\n• Tối thiểu: 1.000đ\n• 200k: +2%\n• 500k: +5%\n• 1 triệu: +8%\n• Đơn PayOS hết hạn sau 30 phút.',
    TOPUP_KEYBOARD,
  )
}

async function showBalance(env: Env, chatId: string, telegramUserId: string) {
  const link = await requireLink(env, telegramUserId, chatId)
  if (!link) return

  const { data, error } = await adminDb(env)
    .from('wallets')
    .select('available_micros,reserved_micros,updated_at')
    .eq('user_id', link.user_id)
    .maybeSingle()

  if (error || !data) {
    await sendMessage(env, chatId, '❌ Không đọc được số dư lúc này.', MAIN_KEYBOARD)
    return
  }

  const available = microsToVnd(data.available_micros)
  const reserved = microsToVnd(data.reserved_micros)
  await sendMessage(
    env,
    chatId,
    `💳 Số dư APIVN\n\nKhả dụng: ${formatVnd(available)}\nĐang giữ: ${formatVnd(reserved)}`,
    MAIN_KEYBOARD,
  )
}

async function createTopup(env: Env, chatId: string, telegramUserId: string, amount: number) {
  const link = await requireLink(env, telegramUserId, chatId)
  if (!link) return

  const assertion = await hmacSha256Hex(env.GATEWAY_USER_ASSERTION_SECRET, link.user_id)
  let response: Response
  try {
    response = await fetch(INTERNAL_TOPUP_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-token': env.INTERNAL_ADMIN_TOKEN,
        'x-user-id': link.user_id,
        'x-user-assertion': `sha256=${assertion}`,
      },
      body: JSON.stringify({ amount }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    await sendMessage(env, chatId, '❌ Không kết nối được hệ thống thanh toán. Thử lại sau.', MAIN_KEYBOARD)
    return
  }

  const body = await response.json().catch(() => null) as TopupResponse | null
  if (!response.ok || !body?.checkoutUrl) {
    const message = body?.error === 'ACTIVE_TOPUP_EXISTS'
      ? '⏳ Bạn đang có một đơn nạp chưa hết hạn. Bấm “Kiểm tra nạp” hoặc chờ đơn cũ hết hạn.'
      : body?.error === 'PAYOS_NOT_CONFIGURED' || body?.error === 'billing_not_configured'
        ? '❌ Thanh toán PayOS hiện chưa sẵn sàng.'
        : '❌ Không thể tạo đơn nạp. Vui lòng thử lại.'
    await sendMessage(env, chatId, message, MAIN_KEYBOARD)
    return
  }

  const bonusText = (body.bonus ?? 0) > 0 ? `\n🎁 Bonus: +${formatVnd(body.bonus ?? 0)}` : ''
  await sendMessage(env, chatId, [
    '💰 Đơn nạp APIVN',
    '',
    `Số tiền: ${formatVnd(body.amount ?? amount)}${bonusText}`,
    `Nội dung: ${body.description ?? 'APIVN'}`,
    'Hạn thanh toán: 30 phút',
    '',
    'Bấm nút dưới để mở QR/chuyển khoản PayOS.',
  ].join('\n'), {
    inline_keyboard: [[{ text: '💳 Mở QR / Thanh toán', url: body.checkoutUrl }]],
  })

  await sendMessage(env, chatId, 'Sau khi chuyển khoản, bấm “🔄 Kiểm tra nạp”.', MAIN_KEYBOARD)
}

async function checkLatestTopup(env: Env, chatId: string, telegramUserId: string) {
  const link = await requireLink(env, telegramUserId, chatId)
  if (!link) return

  const db = adminDb(env)
  const { data, error } = await db
    .from('topups')
    .select('id,payable_vnd,bonus_micros,status,expires_at,paid_at,created_at')
    .eq('user_id', link.user_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    await sendMessage(env, chatId, '❌ Không kiểm tra được đơn nạp.', MAIN_KEYBOARD)
    return
  }
  if (!data) {
    await sendMessage(env, chatId, 'ℹ️ Tài khoản chưa có đơn nạp nào.', MAIN_KEYBOARD)
    return
  }

  let status = String(data.status)
  if (status === 'pending' && data.expires_at && Date.parse(data.expires_at) <= Date.now()) {
    await db.from('topups').update({ status: 'expired' }).eq('id', data.id).eq('status', 'pending')
    status = 'expired'
  }

  const statusText = status === 'paid'
    ? '✅ ĐÃ THANH TOÁN'
    : status === 'pending'
      ? '⏳ ĐANG CHỜ THANH TOÁN'
      : status === 'expired'
        ? '⌛ ĐÃ HẾT HẠN'
        : status === 'cancelled'
          ? '🚫 ĐÃ HUỶ'
          : status.toUpperCase()

  await sendMessage(env, chatId, [
    '🔄 Đơn nạp gần nhất',
    '',
    `Trạng thái: ${statusText}`,
    `Số tiền: ${formatVnd(Number(data.payable_vnd ?? 0))}`,
    `Bonus: ${formatVnd(microsToVnd(data.bonus_micros))}`,
  ].join('\n'), MAIN_KEYBOARD)
}

async function unlinkAccount(env: Env, chatId: string, telegramUserId: string) {
  await adminDb(env).from('telegram_account_links').delete().eq('telegram_user_id', telegramUserId)
  await sendMessage(env, chatId, '🚪 Đã huỷ liên kết Telegram với tài khoản APIVN.', MAIN_KEYBOARD)
}

function parseTopupAmount(text: string): number | null {
  const preset = TOPUP_AMOUNTS.get(text)
  if (preset) return preset
  const command = text.match(/^\/nap(?:@\w+)?\s+(\d{3,9})$/i)
  if (!command) return null
  const amount = Number(command[1])
  if (!Number.isSafeInteger(amount) || amount < 1000 || amount % 1000 !== 0) return null
  return amount
}

export async function handlePrivateTelegramUpdate(env: Env, update: TelegramUpdate): Promise<boolean> {
  const message = update.message
  const chatType = message?.chat?.type
  const chatId = message?.chat?.id == null ? '' : String(message.chat.id)
  const telegramUserId = message?.from?.id == null ? '' : String(message.from.id)
  const text = typeof message?.text === 'string' ? message.text.trim() : ''

  if (chatType !== 'private' || !chatId || !telegramUserId || !text) return false

  if (text.startsWith('/start') || text === '/menu' || text === '⬅️ Menu') {
    if (/^\/start(?:@\w+)?\s+topup$/i.test(text)) {
      await showTopupMenu(env, chatId, telegramUserId)
    } else {
      await showMainMenu(env, chatId, telegramUserId)
    }
    return true
  }

  if (isSupportedApiKey(text)) {
    await deleteMessage(env, chatId, message?.message_id)
    const result = await linkApiKey(env, telegramUserId, chatId, text)
    await sendMessage(
      env,
      chatId,
      result.ok
        ? '✅ Liên kết API key thành công. Bot không lưu plaintext key.'
        : `❌ ${result.message}`,
      MAIN_KEYBOARD,
    )
    return true
  }

  if (text === '🔑 Liên kết API key' || text === '/link') {
    await sendMessage(
      env,
      chatId,
      '🔑 Gửi API key APIVN đang hoạt động vào đây.\n\nBot sẽ hash để xác minh tài khoản, lưu user ID + key ID và cố gắng xoá ngay tin nhắn chứa key. Không lưu plaintext key.',
      MAIN_KEYBOARD,
    )
    return true
  }

  if (text === '💰 Nạp tiền' || text === '/nap') {
    await showTopupMenu(env, chatId, telegramUserId)
    return true
  }

  const amount = parseTopupAmount(text)
  if (amount != null) {
    await createTopup(env, chatId, telegramUserId, amount)
    return true
  }

  if (text === '💳 Số dư' || text === '/balance') {
    await showBalance(env, chatId, telegramUserId)
    return true
  }

  if (text === '🔄 Kiểm tra nạp' || text === '/checktopup') {
    await checkLatestTopup(env, chatId, telegramUserId)
    return true
  }

  if (text === '🚪 Huỷ liên kết' || text === '/unlink') {
    await unlinkAccount(env, chatId, telegramUserId)
    return true
  }

  if (text === '📚 Hướng dẫn') {
    await sendMessage(env, chatId, `📚 Hướng dẫn API: ${WEB_BASE_URL}/docs`, MAIN_KEYBOARD)
    return true
  }

  if (text === '☎️ Liên hệ') {
    await sendMessage(env, chatId, `☎️ Hỗ trợ APIVN.tech\nWebsite: ${WEB_BASE_URL}`, MAIN_KEYBOARD)
    return true
  }

  await showMainMenu(env, chatId, telegramUserId)
  return true
}

export async function sendPrivateTopupLink(env: Env, chatId: string): Promise<void> {
  await sendMessage(env, chatId, '💰 Nạp tiền được thực hiện trong chat riêng để không lộ thông tin tài khoản.', {
    inline_keyboard: [[{
      text: '💰 Mở APIVN Bot để nạp tiền',
      url: `https://t.me/${BOT_USERNAME}?start=topup`,
    }]],
  })
}
