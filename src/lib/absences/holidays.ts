// NZ public holidays that apply to Platinum Painters: the national ones plus
// Auckland Anniversary Day (all staff work to the Auckland calendar). Used
// so the 9am absence check never runs on a day off. One-off closures (e.g.
// the Christmas shutdown) are the closed_days table instead.
//
// Weekend holidays are "Mondayised" as the Holidays Act says: Waitangi Day
// and ANZAC Day move to the Monday; Christmas/Boxing Day and 1/2 January
// move to the next weekdays that aren't already holidays.

// Matariki is set by law each year (Te Kāhui o Matariki Public Holiday Act
// 2022). Years past this list fall back to the closed days list.
const MATARIKI: Record<number, string> = {
  2025: "2025-06-20",
  2026: "2026-07-10",
  2027: "2027-06-25",
  2028: "2028-07-14",
  2029: "2029-07-06",
  2030: "2030-06-21",
  2031: "2031-07-11",
  2032: "2032-07-02",
  2033: "2033-06-24",
  2034: "2034-07-07",
  2035: "2035-06-29",
};

const key = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

// The nth given weekday (0 = Sunday) of a month.
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = utc(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utc(year, month, 1 + offset + (n - 1) * 7);
}

// Easter Sunday (anonymous Gregorian algorithm).
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

// A weekend holiday moves to the Monday.
function toMonday(d: Date): Date {
  if (d.getUTCDay() === 6) return addDays(d, 2);
  if (d.getUTCDay() === 0) return addDays(d, 1);
  return d;
}

// Two back-to-back holidays (Christmas + Boxing Day, 1 + 2 January): any
// that land on a weekend move to the next weekdays not already taken.
function mondayisePair(first: Date, second: Date): Date[] {
  const taken = new Set<string>();
  const out: Date[] = [];
  for (const d of [first, second]) {
    if (!isWeekend(d)) {
      taken.add(key(d));
      out.push(d);
    }
  }
  for (const d of [first, second]) {
    if (!isWeekend(d)) continue;
    let day = addDays(d, 1);
    while (isWeekend(day) || taken.has(key(day))) day = addDays(day, 1);
    taken.add(key(day));
    out.push(day);
  }
  return out;
}

// Auckland Anniversary: the Monday closest to 29 January.
function aucklandAnniversary(year: number): Date {
  const jan29 = utc(year, 1, 29);
  const dow = jan29.getUTCDay();
  const back = (dow + 6) % 7; // days since the previous Monday
  return back <= 3 ? addDays(jan29, -back) : addDays(jan29, 7 - back);
}

export type Holiday = { date: string; name: string };

export function nzPublicHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const [newYear, dayAfter] = mondayisePair(utc(year, 1, 1), utc(year, 1, 2));
  const [christmas, boxing] = mondayisePair(utc(year, 12, 25), utc(year, 12, 26));

  const list: Holiday[] = [
    { date: key(newYear), name: "New Year's Day" },
    { date: key(dayAfter), name: "Day after New Year's Day" },
    { date: key(aucklandAnniversary(year)), name: "Auckland Anniversary Day" },
    { date: key(toMonday(utc(year, 2, 6))), name: "Waitangi Day" },
    { date: key(addDays(easter, -2)), name: "Good Friday" },
    { date: key(addDays(easter, 1)), name: "Easter Monday" },
    { date: key(toMonday(utc(year, 4, 25))), name: "ANZAC Day" },
    { date: key(nthWeekday(year, 6, 1, 1)), name: "King's Birthday" },
    { date: key(nthWeekday(year, 10, 1, 4)), name: "Labour Day" },
    { date: key(christmas), name: "Christmas Day" },
    { date: key(boxing), name: "Boxing Day" },
  ];
  if (MATARIKI[year]) list.push({ date: MATARIKI[year], name: "Matariki" });

  return list.sort((a, b) => a.date.localeCompare(b.date));
}

// The public holiday on this YYYY-MM-DD date, if any.
export function publicHolidayOn(dateKey: string): Holiday | null {
  const year = Number(dateKey.slice(0, 4));
  return nzPublicHolidays(year).find((h) => h.date === dateKey) ?? null;
}
