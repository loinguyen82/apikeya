'use client'

import React, { useState } from 'react'
import { formatVnd, formatVndFromMicros } from '@/lib/money'
import { formatVietnamDateTime } from '@/lib/date'

interface TopupItem { id:string; user_id:string; payable_vnd:number; amount_micros:string; bonus_micros:string; payment_provider:string; status:string; created_at:string; userEmail?:string }

export function AdminTopupsClient({ pendingTopups, historyTopups }: { pendingTopups:TopupItem[]; historyTopups:TopupItem[] }) {
  const [activeTab,setActiveTab]=useState<'pending'|'manual'|'history'>('pending')
  const [loadingId,setLoadingId]=useState<string|null>(null)
  const [actionMsg,setActionMsg]=useState<{type:'success'|'error';text:string}|null>(null)
  const [manualEmail,setManualEmail]=useState('')
  const [manualAmount,setManualAmount]=useState('100000')
  const [manualNote,setManualNote]=useState('Nạp tiền trực tiếp')
  const [manualLoading,setManualLoading]=useState(false)

  async function runAction(action:'approve'|'reject',topupId:string){
    const prompt=action==='approve'?'Xác nhận đã nhận tiền và cộng credit cho khách hàng?':'Hủy yêu cầu nạp này?'
    if(!confirm(prompt)) return
    setLoadingId(topupId);setActionMsg(null)
    try{const res=await fetch('/api/admin/topups',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,topupId})});const json=await res.json();if(!res.ok||json.error)setActionMsg({type:'error',text:json.error||'Không thể xử lý yêu cầu'});else{setActionMsg({type:'success',text:action==='approve'?'Đã duyệt và cộng tiền vào ví khách hàng.':'Đã hủy yêu cầu nạp.'});setTimeout(()=>window.location.reload(),1000)}}catch{setActionMsg({type:'error',text:'Lỗi kết nối máy chủ'})}finally{setLoadingId(null)}
  }

  async function handleManualCredit(e:React.FormEvent){e.preventDefault();setManualLoading(true);setActionMsg(null);try{const res=await fetch('/api/admin/topups',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'manual_credit',email:manualEmail.trim(),amountVnd:Number(manualAmount),note:manualNote.trim()})});const json=await res.json();if(!res.ok||json.error)setActionMsg({type:'error',text:json.error||'Không thể cộng tiền'});else{setActionMsg({type:'success',text:json.message||'Đã cộng tiền thủ công.'});setManualEmail('');setTimeout(()=>window.location.reload(),1200)}}catch{setActionMsg({type:'error',text:'Lỗi kết nối máy chủ'})}finally{setManualLoading(false)}}

  return <div className="page-stack">
    <header className="page-head"><div className="page-head-copy"><div className="eyebrow">Topup operations</div><h1>Quản lý nạp tiền</h1><p>Duyệt VietQR, xử lý giao dịch chờ và cộng credit thủ công khi cần.</p></div></header>
    {actionMsg&&<div className={`notice ${actionMsg.type==='success'?'success':'danger'}`}>{actionMsg.text}</div>}
    <div className="page-actions"><button className={activeTab==='pending'?'btn':'btn secondary'} onClick={()=>setActiveTab('pending')}>Chờ duyệt ({pendingTopups.length})</button><button className={activeTab==='manual'?'btn':'btn secondary'} onClick={()=>setActiveTab('manual')}>Cộng thủ công</button><button className={activeTab==='history'?'btn':'btn secondary'} onClick={()=>setActiveTab('history')}>Lịch sử ({historyTopups.length})</button></div>

    {activeTab==='pending'&&<section className="surface model-table-shell"><div className="surface-head"><h3>Giao dịch chờ duyệt</h3><span className={`status-chip ${pendingTopups.length?'warning':''}`}>{pendingTopups.length} pending</span></div>{pendingTopups.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Thời gian</th><th>Nội dung CK</th><th>Khách hàng</th><th>Số tiền</th><th>Giá trị credit</th><th></th></tr></thead><tbody>{pendingTopups.map(t=>{const memo=`NAP ${t.id.slice(0,8).toUpperCase()}`;const busy=loadingId===t.id;return <tr key={t.id}><td>{formatVietnamDateTime(t.created_at)}</td><td><code>{memo}</code></td><td>{t.userEmail||t.user_id.slice(0,8)}</td><td><strong>{formatVnd(t.payable_vnd)}</strong></td><td>{formatVndFromMicros(BigInt(t.amount_micros)+BigInt(t.bonus_micros))}</td><td><div className="page-actions"><button className="btn" disabled={busy} onClick={()=>runAction('approve',t.id)}>{busy?'Đang xử lý':'Duyệt'}</button><button className="btn secondary" disabled={busy} onClick={()=>runAction('reject',t.id)}>Hủy</button></div></td></tr>})}</tbody></table></div>:<div className="surface-body"><div className="empty-card"><div className="empty-icon">✓</div><strong>Không có giao dịch chờ</strong><p>Tất cả yêu cầu hiện đã được xử lý.</p></div></div>}</section>}

    {activeTab==='manual'&&<section className="surface surface-pad" style={{maxWidth:680}}><div className="eyebrow">Manual credit</div><h3 style={{margin:'6px 0 16px'}}>Cộng tiền trực tiếp</h3><form onSubmit={handleManualCredit} className="page-stack" style={{gap:14}}><div className="field"><label htmlFor="manual-email">Email khách hàng</label><input id="manual-email" className="input" type="email" value={manualEmail} onChange={e=>setManualEmail(e.target.value)} placeholder="customer@example.com" required /></div><div className="field"><label htmlFor="manual-amount">Số tiền (VNĐ)</label><input id="manual-amount" className="input" type="number" min="1000" step="1000" value={manualAmount} onChange={e=>setManualAmount(e.target.value)} required /></div><div className="field"><label htmlFor="manual-note">Ghi chú</label><input id="manual-note" className="input" value={manualNote} onChange={e=>setManualNote(e.target.value)} required /></div><button className="btn" type="submit" disabled={manualLoading}>{manualLoading?'Đang xử lý…':`Cộng ${Number(manualAmount||0).toLocaleString('vi-VN')}đ`}</button></form></section>}

    {activeTab==='history'&&<section className="surface model-table-shell"><div className="surface-head"><h3>Lịch sử đã xử lý</h3><span className="status-chip">{historyTopups.length} giao dịch</span></div>{historyTopups.length?<div className="table-scroll"><table className="data-table"><thead><tr><th>Thời gian</th><th>ID</th><th>Khách hàng</th><th>Số tiền</th><th>Provider</th><th>Status</th></tr></thead><tbody>{historyTopups.map(t=><tr key={t.id}><td>{formatVietnamDateTime(t.created_at)}</td><td><code>{t.id.slice(0,8).toUpperCase()}</code></td><td>{t.userEmail||t.user_id.slice(0,8)}</td><td>{formatVnd(t.payable_vnd)}</td><td>{t.payment_provider}</td><td><span className={`status-chip ${t.status==='paid'?'success':t.status==='rejected'?'danger':''}`}>{t.status}</span></td></tr>)}</tbody></table></div>:<div className="surface-body"><div className="empty-card"><strong>Chưa có lịch sử</strong></div></div>}</section>}
  </div>
}
