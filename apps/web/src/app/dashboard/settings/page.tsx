import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { formatNumber, formatVndFromMicros } from '@/lib/money'

export default async function SettingsPage() {
  const { supabase, user } = await requireUser()
  const [{ data: profile }, { data: wallet }, { count: keyCount }, { count: requestCount }] = await Promise.all([
    supabase.from('profiles').select('display_name,role').eq('id', user.id).maybeSingle(),
    supabase.from('wallets').select('available_micros,reserved_micros').eq('user_id', user.id).maybeSingle(),
    supabase.from('api_keys').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('api_requests').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ])
  return <div className="page-stack"><header className="page-head"><div className="page-head-copy"><div className="eyebrow">Settings</div><h1>Cài đặt tài khoản</h1><p>Account quản lý phiên đăng nhập; API Key chỉ là credential gọi gateway.</p></div></header><div className="account-grid"><section className="surface surface-pad"><div className="eyebrow">Profile</div><h2 style={{ margin: '5px 0 18px', fontSize: 21 }}>{profile?.display_name || 'APIVN user'}</h2><div className="detail-list"><div className="detail-line"><span>Email</span><strong>{user.email ?? '—'}</strong></div><div className="detail-line"><span>Vai trò</span><strong>{profile?.role === 'admin' ? 'Admin' : 'Member'}</strong></div><div className="detail-line"><span>API Keys</span><strong>{formatNumber(keyCount ?? 0)}</strong></div><div className="detail-line"><span>Requests</span><strong>{formatNumber(requestCount ?? 0)}</strong></div></div></section><section className="surface surface-pad"><div className="eyebrow">Wallet</div><div className="balance-value" style={{ marginTop: 8 }}>{formatVndFromMicros(wallet?.available_micros ?? '0')}</div><p className="muted">Đang tạm giữ: {formatVndFromMicros(wallet?.reserved_micros ?? '0')}</p><div className="notice" style={{ marginTop: 18 }}>Đăng xuất chỉ xóa session Dashboard trên thiết bị này. API Key không bị thu hồi.</div><form action="/auth/signout" method="post"><button type="submit" className="btn secondary" style={{ width: '100%', marginTop: 14 }}>Đăng xuất</button></form></section></div><section className="surface surface-pad"><div className="eyebrow">Shortcuts</div><div className="account-shortcuts" style={{ marginTop: 14 }}><Link href="/dashboard/api-keys">API Keys</Link><Link href="/dashboard/billing">Billing</Link><Link href="/docs">Docs</Link>{profile?.role === 'admin' && <Link href="/admin">Admin</Link>}</div></section></div>
}
