// Plain-English device and place for the sign-in log and its emails.

// Common makers' model-code prefixes, so "SM-A536E" reads as Samsung.
const MAKERS: [RegExp, string][] = [
  [/^SM-|^Galaxy/i, "Samsung"],
  [/^Pixel/i, "Google"],
  [/^CPH|^OPPO/i, "OPPO"],
  [/^RMX/i, "realme"],
  [/^moto|^XT\d/i, "Motorola"],
  [/^Nokia/i, "Nokia"],
  [/^(Redmi|POCO)/i, "Xiaomi"],
  [/^vivo/i, "vivo"],
  [/^TCL/i, "TCL"],
];

// The phone's model on Android: from the model hint the Hub asks Chrome for
// (HubModel/"..."), else the user agent itself (Samsung Internet and older
// Chrome still put it there). "K" is Chrome's hidden-model placeholder.
function androidModel(ua: string): string | null {
  const hinted = ua.match(/HubModel\/"([^"]+)"/)?.[1];
  const inUa = ua.match(/Android [\d.]+; (?:[a-z]{2}[-_][a-z]{2}; )?([^;)]+?)(?: Build\/[^;)]*)?[;)]/i)?.[1]?.trim();
  const model = hinted || (inUa && inUa !== "K" && !/^(wv|Mobile)$/i.test(inUa) ? inUa : null);
  if (!model) return null;
  const maker = MAKERS.find(([re]) => re.test(model))?.[1];
  return maker && !model.toLowerCase().startsWith(maker.toLowerCase()) ? `${maker} ${model}` : model;
}

// The Hub's own id for a browser (the hub_device cookie), shortened: "#4F2A".
export function shortDeviceId(deviceId: string | null | undefined): string | null {
  return deviceId ? `#${deviceId.replace(/-/g, "").slice(0, 4).toUpperCase()}` : null;
}

// "Saimone's work phone (#4F2A)" when an admin has named it, else
// "Samsung SM-A536E · Chrome (#4F2A)".
export function deviceLabel(ua: string | null, deviceId: string | null | undefined, name?: string | null): string {
  const id = shortDeviceId(deviceId);
  const base = name ? name : describeDevice(ua);
  return id ? `${base} (${id})` : base;
}

export function describeDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? androidModel(ua) ?? (/Mobile/.test(ua) ? "Android phone" : "Android tablet")
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
