import type { Env } from '../env.js'
import { adminDb } from '../repositories/supabase.js'
import { isSupportedApiKey } from '../middleware/api-key.js'
import { hmacSha256Hex, sha256Hex } from '../utils/crypto.js'

const BOT_USERNAME = 'Apivn_bot'
const WEB_BASE_URL = 'https://apivn.tech'
const INTERNAL_TOPUP_URL = `${WEB_BASE_URL}/api/internal/telegram/topups`
const CREDIT_VND = 1_000
const MIN_TOPUP_VND = 1_000

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

type TelegramMessage = {
  message_id?: number
  text?: string
  chat?: { id?: number | string; type?: string }
  from?: { id?: number | string }
  reply_to_message?: { text?: string }
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
  expiresAt?: string
  qrUrl?: string
  bankId?: string
  bankName?: string
  accountNo?: string
  accountName?: string
  memo?: string
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

async function sendPhoto(env: Env, chatId: string, photoUrl: string, caption: string): Promise<boolean> {
  const response = await telegramApi(env, 'sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    caption,
  })
  if (!response) return false
  if (!response.ok) {
    console.error('telegram commerce sendPhoto failed', response.status, (await response.text()).slice(0, 240))
    return false
  }
  return true
}

async function deleteMessage(env: Env, chatId: string, messageId?: number): Promise<void> {
  if (!messageId) return
  try {
    await telegramApi(env, 'deleteMessage', { chat_id: chatId, message_id: messageId })
  } catch {
    // Best effort only.
  }
}

function formatVnd(value: bigint | number) {
  const amount = typeof value === 'bigint' ? Number(value) : value
  return `${new Intl.NumberFormat('vi-VN').format(amount)}đ`
}

function formatCreditFromVnd(value: bigint | number) {
  const amount = typeof value === 'bigint' ? value : BigInt(value)
  const whole = amount / BigInt(CREDIT_VND)
  const remainder = amount % BigInt(CREDIT_VND)
  if (remainder === 0n) return `${new Intl.NumberFormat('vi-VN').format(Number(whole))} Credit`
  return `${(Number(amount) / CREDIT_VND).toLocaleString('vi-VN', { maximumFractionDigits: 3 })} Credit`
}

function microsToVnd(value: string | number | bigint | null | undefined) {
  if (value == null) return 0n
  try {
    return BigInt(value) / 1000n
  } catch {
    return 0n
  }
}

function normalizeAmountText(text: string): number | null {
  const trimmed = text.trim().toLowerCase()
  const command = trimmed.match(/^\/nap(?:@\w+)?\s+(.+)$/i)
  const raw = (command?.[1] ?? trimmed).trim()

  let numeric: number
  const kMatch = raw.match(/^(\d+(?:[.,]\d+)?)\s*k$/i)
  if (kMatch) {
    numeric = Number(kMatch[1].replace(',', '.')) * 1_000
  } else {
    const compact = raw.replace(/[. ,]/g, '')
    if (!/^\d+$/.test(compact)) return null
    numeric = Number(compact)
  }

  if (!Number.isSafeInteger(numeric) || numeric < MIN_TOPUP_VND || numeric % 1_000 !== 0) return null
  return numeric
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

async function askTopupAmount(env: Env, chatId: string, telegramUserId: string) {
  const link = await requireLink(env, telegramUserId, chatId)
  if (!link) return
  await sendMessage(
    env,
    chatId,
    [
      '💰 Nhập số tiền muốn nạp (VNĐ)',
      '',
      '1 Credit = 1.000đ',
      'Ví dụ: 50000 → 50 Credit',
      '',
      '• Tối thiểu: 1.000đ',
      '• Số tiền phải là bội của 1.000đ',
      '• 200k: +2% bonus',
      '• 500k: +5% bonus',
      '• 1 triệu: +8% bonus',
    ].join('\n'),
    {
      force_reply: true,
      input_field_placeholder: 'Ví dụ: 50000',
      selective: true,
    },
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

  const availableVnd = microsToVnd(data.available_micros)
  const reservedVnd = microsToVnd(data.reserved_micros)
  await sendMessage(
    env,
    chatId,
    [
      '💳 Số dư APIVN',
      '',
      `Khả dụng: ${formatCreditFromVnd(availableVnd)} (${formatVnd(availableVnd)})`,
      `Đang giữ: ${formatCreditFromVnd(reservedVnd)} (${formatVnd(reservedVnd)})`,
    ].join('\n'),
    MAIN_KEYBOARD,
  )
}

function topupCaption(body: TopupResponse, fallbackAmount: number): string {
  const amount = body.amount ?? fallbackAmount
  const bonus = body.bonus ?? 0
  const totalVnd = amount + bonus
  return [
    '💰 Đơn nạp APIVN',
    '',
    `Số tiền: ${formatVnd(amount)}`,
    `Quy đổi: ${formatCreditFromVnd(amount)}`,
    ...(bonus > 0 ? [`🎁 Bonus: +${formatCreditFromVnd(bonus)} (+${formatVnd(bonus)})`] : []),
    `✅ Credit nhận: ${formatCreditFromVnd(totalVnd)}`,
    '',
    body.bankName ? `Ngân hàng: ${body.bankName}` : '',
    body.accountNo ? `Số tài khoản: ${body.accountNo}` : '',
    body.accountName ? `Chủ tài khoản: ${body.accountName}` : '',
    body.memo ? `Nội dung BẮT BUỘC: ${body.memo}` : '',
    'Hạn thanh toán: 30 phút',
  ].filter(Boolean).join('\n')
}

async function showVietQrTopup(
  env: Env,
  chatId: string,
  body: TopupResponse,
  fallbackAmount: number,
  reused: boolean,
) {
  const caption = topupCaption(body, fallbackAmount)
  if (body.qrUrl) {
    const sent = await sendPhoto(env, chatId, body.qrUrl, caption)
    if (!sent) await sendMessage(env, chatId, `${caption}\n\nQR: ${body.qrUrl}`)
  } else {
    await sendMessage(env, chatId, caption)
  }

  await sendMessage(
    env,
    chatId,
    reused
      ? '⏳ Bạn đã có một đơn nạp đang chờ. Bot gửi lại đúng QR hiện tại; không tạo đơn trùng. Sau khi chuyển khoản, bấm “🔄 Kiểm tra nạp”.'
      : '✅ Đã tạo yêu cầu nạp. Chuyển đúng số tiền và đúng nội dung, sau đó bấm “🔄 Kiểm tra nạp”.',
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
    await sendMessage(env, chatId, '❌ Không kết nối được hệ thống nạp tiền. Thử lại sau.', MAIN_KEYBOARD)
    return
  }

  const body = await response.json().catch(() => null) as TopupResponse | null
  const activeExisting = response.status === 409 && body?.error === 'ACTIVE_TOPUP_EXISTS' && Boolean(body.qrUrl)

  if (activeExisting && body) {
    await showVietQrTopup(env, chatId, body, body.amount ?? amount, true)
    return
  }

  if (!response.ok || !body?.ok || !body.qrUrl) {
    const message = body?.error === 'ACTIVE_TOPUP_EXISTS'
      ? '⏳ Bạn đang có một đơn nạp chưa hết hạn. Bấm “🔄 Kiểm tra nạp” hoặc chờ đơn cũ hết hạn.'
      : body?.error === 'INVALID_AMOUNT'
        ? '❌ Số tiền phải từ 1.000đ và là bội của 1.000đ.'
        : '❌ Không thể tạo đơn VietQR. Vui lòng thử lại.'
    await sendMessage(env, chatId, message, MAIN_KEYBOARD)
    return
  }

  await showVietQrTopup(env, chatId, body, amount, false)
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

  const amount = Number(data.payable_vnd ?? 0)
  const bonusVnd = microsToVnd(data.bonus_micros)
  const totalVnd = BigInt(amount) + bonusVnd
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
    `Số tiền: ${formatVnd(amount)}`,
    `Quy đổi: ${formatCreditFromVnd(amount)}`,
    ...(bonusVnd > 0n ? [`Bonus: +${formatCreditFromVnd(bonusVnd)}`] : []),
    `Credit nhận: ${formatCreditFromVnd(totalVnd)}`,
  ].join('\n'), MAIN_KEYBOARD)
}

async function unlinkAccount(env: Env, chatId: string, telegramUserId: string) {
  await adminDb(env).from('telegram_account_links').delete().eq('telegram_user_id', telegramUserId)
  await sendMessage(env, chatId, '🚪 Đã huỷ liên kết Telegram với tài khoản APIVN.', MAIN_KEYBOARD)
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
      await askTopupAmount(env, chatId, telegramUserId)
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
      result.ok ? '✅ Liên kết API key thành công. Bot không lưu plaintext key.' : `❌ ${result.message}`,
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
    await askTopupAmount(env, chatId, telegramUserId)
    return true
  }

  const amount = normalizeAmountText(text)
  if (amount != null) {
    await createTopup(env, chatId, telegramUserId, amount)
    return true
  }

  if (/^\d[\d., ]*k?$/i.test(text)) {
    await sendMessage(
      env,
      chatId,
      '❌ Số tiền không hợp lệ. Tối thiểu 1.000đ và phải là bội của 1.000đ.\nVí dụ: 50000 → 50 Credit.',
      MAIN_KEYBOARD,
    )
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
