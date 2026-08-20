'use client'

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="error-state" role="alert">
      <h2>Không thể tải khu vực quản trị</h2>
      <p className="muted">Có lỗi tạm thời khi tải dữ liệu. Thử lại để tiếp tục.</p>
      <button className="btn" onClick={() => reset()}>Thử lại</button>
    </div>
  )
}
