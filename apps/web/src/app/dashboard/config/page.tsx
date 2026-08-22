import { redirect } from 'next/navigation'

export default function ConfigRedirect() {
  redirect('/dashboard#quick-config')
}
