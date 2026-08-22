import { redirect } from 'next/navigation'

// Preserve existing bookmarks while keeping Quota as the single request-usage surface.
export default function UsagePage() {
  redirect('/dashboard/quota')
}
