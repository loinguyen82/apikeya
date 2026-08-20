export default function DashboardLoading() {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-dot" aria-hidden="true" />
      <span>Đang tải dữ liệu dashboard...</span>
    </div>
  )
}
