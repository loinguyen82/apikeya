export interface BankConfig {
  bankId: string
  bankName: string
  accountNo: string
  accountName: string
}

export const defaultBankConfig: BankConfig = {
  bankId: process.env.NEXT_PUBLIC_BANK_ID || 'VCB',
  bankName: process.env.NEXT_PUBLIC_BANK_NAME || 'Ngân hàng TMCP Ngoại Thương Việt Nam (Vietcombank)',
  accountNo: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NO || '9345521253',
  accountName: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME || 'NGUYEN DINH LOI',
}

export function generateVietQrUrl({
  bankId = defaultBankConfig.bankId,
  accountNo = defaultBankConfig.accountNo,
  accountName = defaultBankConfig.accountName,
  amount,
  memo,
}: {
  bankId?: string
  accountNo?: string
  accountName?: string
  amount: number
  memo: string
}): string {
  const cleanAccountNo = accountNo.replace(/\s+/g, '')
  const cleanMemo = encodeURIComponent(memo)
  const cleanName = encodeURIComponent(accountName)
  return `https://img.vietqr.io/image/${bankId}-${cleanAccountNo}-compact2.png?amount=${amount}&addInfo=${cleanMemo}&accountName=${cleanName}`
}
