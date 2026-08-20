const vietnamDateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'short',
  timeStyle: 'medium',
})

const vietnamDateFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'short',
})

export function formatVietnamDateTime(value: string): string {
  return vietnamDateTimeFormatter.format(new Date(value))
}

export function formatVietnamDate(value: string): string {
  return vietnamDateFormatter.format(new Date(value))
}
