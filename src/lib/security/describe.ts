// Plain-English device and place for the sign-in log and its emails.

export function describeDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? /Mobile/.test(ua)
          ? "Android phone"
          : "Android tablet"
        : /Windows/.test(ua)
          ? "Windows computer"
          : /Macintosh|Mac OS X/.test(ua)
            ? "Mac"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : /Linux/.test(ua)
                ? "Linux computer"
                : "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /CriOS|Chrome\//.test(ua)
        ? "Chrome"
        : /FxiOS|Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  return browser ? `${device} · ${browser}` : device;
}

const COUNTRIES: Record<string, string> = { NZ: "New Zealand", AU: "Australia", US: "United States", GB: "United Kingdom" };

export function describePlace(city: string | null, country: string | null, ip: string | null): string {
  const where = [city, country ? (COUNTRIES[country] ?? country) : null].filter(Boolean).join(", ");
  if (where && ip) return `${where} (IP ${ip})`;
  return where || (ip ? `IP ${ip}` : "Unknown");
}

export function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
