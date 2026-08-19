type UserLike = { id: string; email?: string | null; user_metadata?: { display_name?: string } }

export async function ensureUserAccount(
  admin: any,
  user: UserLike,
  options: { seedBalance: boolean; displayName?: string } = { seedBalance: false },
) {
  const displayName = options.displayName || user.user_metadata?.display_name || user.email?.split('@')[0] || 'User'
  const { error: profileError } = await admin.from('profiles').upsert({ id: user.id, display_name: displayName })
  if (profileError) throw new Error('PROFILE_BOOTSTRAP_FAILED')

  const seedMicros = '100000000'

  const { data: wallet, error } = await admin
    .from('wallets')
    .select('user_id,available_micros,reserved_micros')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (!wallet) {
    const availableMicros = options.seedBalance ? seedMicros : '0'
    const { error: walletInsertError } = await admin.from('wallets').insert({
      user_id: user.id,
      available_micros: availableMicros,
    })
    if (walletInsertError) throw new Error('WALLET_BOOTSTRAP_FAILED')
    if (options.seedBalance) {
      const { error: ledgerError } = await admin.from('wallet_ledger').insert({
        user_id: user.id,
        kind: 'bonus',
        delta_available_micros: seedMicros,
        delta_reserved_micros: '0',
        reference_type: 'user_signup',
        reference_id: user.id,
        idempotency_key: `signup-bonus:${user.id}`,
        metadata: { reason: 'signup_trial_credit' },
      })
      if (ledgerError) throw new Error('WALLET_LEDGER_BOOTSTRAP_FAILED')
    }
    return
  }

  // Only a newly-created account receives the local demo credit. Login must never reset a wallet.
  if (options.seedBalance && wallet.available_micros === '0' && wallet.reserved_micros === '0') {
    const { error: walletUpdateError } = await admin
      .from('wallets')
      .update({ available_micros: seedMicros })
      .eq('user_id', user.id)
    if (walletUpdateError) throw new Error('WALLET_BOOTSTRAP_FAILED')

    const { error: ledgerError } = await admin.from('wallet_ledger').insert({
      user_id: user.id,
      kind: 'bonus',
      delta_available_micros: seedMicros,
      delta_reserved_micros: '0',
      reference_type: 'user_signup',
      reference_id: user.id,
      idempotency_key: `signup-bonus:${user.id}`,
      metadata: { reason: 'signup_trial_credit' },
    })
    if (ledgerError && !ledgerError.message.includes('duplicate')) {
      throw new Error('WALLET_LEDGER_BOOTSTRAP_FAILED')
    }
  }
}
