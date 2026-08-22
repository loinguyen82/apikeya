import { redirect } from 'next/navigation'

export default async function PlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string }>
}) {
  const { model } = await searchParams
  const query = model ? `?model=${encodeURIComponent(model)}` : ''

  redirect(`/dashboard/hexa${query}`)
}
