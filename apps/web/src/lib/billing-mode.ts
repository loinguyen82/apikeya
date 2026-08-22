export function isLiveBillingEnabled() {
  return process.env.BILLING_MODE === 'live'
}
