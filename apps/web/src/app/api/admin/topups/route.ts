import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createAdminSupabase } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const admin = createAdminSupabase()
    const body = await req.json()
    const { action } = body

    if (action === 'approve') {
      const { topupId, externalTxId } = body
      if (!topupId) {
        return NextResponse.json({ error: 'Missing topupId' }, { status: 400 })
      }

      // Lấy thông tin đơn nạp
      const { data: topup, error: getErr } = await admin
        .from('topups')
        .select('*')
        .eq('id', topupId)
        .single()

      if (getErr || !topup) {
        return NextResponse.json({ error: 'Topup not found' }, { status: 404 })
      }

      if (topup.status === 'paid') {
        return NextResponse.json({ error: 'Đơn này đã được duyệt trước đó' }, { status: 400 })
      }

      // Gọi RPC apply_paid_topup chuẩn của hệ thống để cộng tiền vào ví và ghi sổ cái
      const { data, error: rpcErr } = await admin.rpc('apply_paid_topup', {
        p_topup_id: topup.id,
        p_external_tx_id: externalTxId || `manual_approved_${Date.now()}`,
        p_actual_vnd_paid: topup.payable_vnd,
      })

      if (rpcErr) {
        return NextResponse.json({ error: rpcErr.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true, data })
    }

    if (action === 'reject') {
      const { topupId } = body
      if (!topupId) {
        return NextResponse.json({ error: 'Missing topupId' }, { status: 400 })
      }

      const { error: updateErr } = await admin
        .from('topups')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', topupId)

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    if (action === 'manual_credit') {
      const { email, amountVnd, note } = body
      if (!email || !amountVnd || Number(amountVnd) <= 0) {
        return NextResponse.json({ error: 'Vui lòng nhập Email hợp lệ và số tiền > 0' }, { status: 400 })
      }

      // Tìm user theo email
      const { data: userData, error: userErr } = await admin.auth.admin.listUsers()
      if (userErr || !userData?.users) {
        return NextResponse.json({ error: 'Lỗi truy vấn danh sách người dùng' }, { status: 500 })
      }

      const targetUser = userData.users.find(
        (u) => u.email?.toLowerCase() === email.trim().toLowerCase()
      )

      if (!targetUser) {
        return NextResponse.json({ error: `Không tìm thấy tài khoản có email ${email}` }, { status: 404 })
      }

      const amount = Number(amountVnd)
      const amountMicros = BigInt(amount) * 1000n

      // Tạo đơn topup hoàn tất trực tiếp
      const { data: topupRow, error: createErr } = await admin
        .from('topups')
        .insert({
          user_id: targetUser.id,
          amount_micros: amountMicros.toString(),
          bonus_micros: '0',
          payable_vnd: amount,
          payment_provider: 'admin_manual_grant',
          status: 'pending',
        })
        .select('id')
        .single()

      if (createErr || !topupRow) {
        return NextResponse.json({ error: createErr?.message || 'Lỗi tạo đơn' }, { status: 500 })
      }

      // Duyệt và cộng tiền vào ví
      const { error: rpcErr } = await admin.rpc('apply_paid_topup', {
        p_topup_id: topupRow.id,
        p_external_tx_id: `admin_grant_${note ? encodeURIComponent(note) : 'manual'}_${Date.now()}`,
        p_actual_vnd_paid: amount,
      })

      if (rpcErr) {
        return NextResponse.json({ error: rpcErr.message }, { status: 500 })
      }

      return NextResponse.json({
        ok: true,
        message: `Đã nạp thành công ${amount.toLocaleString('vi-VN')}đ cho ${targetUser.email}`,
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
