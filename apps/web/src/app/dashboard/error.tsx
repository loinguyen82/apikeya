'use client'

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="error-state" role="alert">
      <h2>Không thể tải dashboard</h2>
      <p className="muted">Dữ liệu tạm thời chưa khả dụng. Bạn có thể thử tải lại mà không mất phiên đăng nhập.</p>
      <button className="btn" onClick={() => reset()}>Thử lại</button>
    </div>
  )
}
