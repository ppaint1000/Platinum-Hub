const STORAGE_KEY = 'platinum_device_id'

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing) return existing

    const id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
    return id
  } catch {
    // localStorage unavailable (private browsing, etc.) - a per-session id
    // still lets same-session anomalies show up, just not across days.
    return crypto.randomUUID()
  }
}

export function getDeviceLabel(): string {
  const ua = navigator.userAgent

  let os = 'Unknown OS'
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Macintosh/.test(ua)) os = 'Mac'
  else if (/Linux/.test(ua)) os = 'Linux'

  let browser = 'Unknown browser'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome'
  else if (/CriOS/.test(ua)) browser = 'Chrome'
  else if (/FxiOS|Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari'

  return `${os} · ${browser}`
}
