// Users → Sign-in log: who signed in to the Hub, when, on what device and
// from roughly where - plus a GPS stamp for sales and supervisor sign-ins.
// Recorded by the request gate (lib/security/signInGate.ts). Admin-only.
import Link from "next/link";
import { DASHBOARD_THEME } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { Panel } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatNZDateTime } from "@/lib/timesheets/formatNZ";
import { describeDevice, describePlace, mapsLink } from "@/lib/security/describe";

type Row = {
  session_id: string;
  user_id: string;
  user_agent: string | null;
  ip: string | null;
  city: string | null;
  country: string | null;
  new_device: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  location_status: string | null;
  created_at: string;
};

const ROLE: Record<string, string> = { admin: "Admin", sales: "Sales", supervisor: "Supervisor", painter: "Painter" };

export default async function SignInLogPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  await requireAdmin();
  const { person } = await searchParams;
  const db = createAdminClient();

  let q = db
    .from("hub_sign_ins")
    .select(
      "session_id, user_id, user_agent, ip, city, country, new_device, latitude, longitude, accuracy_m, location_status, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (person) q = q.eq("user_id", person);

  const [{ data: rows }, { data: people }] = await Promise.all([
    q.returns<Row[]>(),
    db.from("profiles").select("id, full_name, role").is("deleted_at", null).order("full_name"),
  ]);
  const byId = new Map((people ?? []).map((p) => [p.id as string, p as { id: string; full_name: string; role: string }]));

  return (
    <div
      className={`${dashboardFontClass} flex min-h-screen flex-col bg-[#F5F4F0] [font-family:var(--font-body)]`}
      style={DASHBOARD_THEME}
    >
      <TopBar items={ADMIN_NAV} activeHref="/users" />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/users" className="text-sm text-ink-soft underline">
              ← Users
            </Link>
            <h1 className="mt-1 text-3xl font-bold text-ink">Sign-in log</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Each sign-in to the Hub. &ldquo;Where&rdquo; is worked out from the internet connection, so it&apos;s only
              roughly right; sales and supervisors also get a GPS stamp when they sign in.
            </p>
          </div>
          <form className="flex items-center gap-2 text-sm">
            <select name="person" defaultValue={person ?? ""} className="rounded border border-line bg-paper-raised px-2 py-1.5">
              <option value="">Everyone</option>
              {(people ?? []).map((p) => (
                <option key={p.id as string} value={p.id as string}>
                  {p.full_name as string}
                </option>
              ))}
            </select>
            <button className="rounded bg-accent px-3 py-1.5 font-semibold text-white hover:bg-accent-hover">Show</button>
          </form>
        </div>

        <Panel className="overflow-x-auto p-4">
          {!rows?.length ? (
            <p className="text-sm text-ink-soft">No sign-ins recorded yet.</p>
          ) : (
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Person</th>
                  <th className="py-2 pr-3">Device</th>
                  <th className="py-2 pr-3">Where (from connection)</th>
                  <th className="py-2">GPS</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = byId.get(r.user_id);
                  return (
                    <tr key={r.session_id} className="border-t border-line align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">{formatNZDateTime(r.created_at)}</td>
                      <td className="py-2 pr-3">
                        <span className="font-semibold">{p?.full_name ?? "Unknown"}</span>
                        {p?.role && <span className="ml-1 text-ink-soft">· {ROLE[p.role] ?? p.role}</span>}
                      </td>
                      <td className="py-2 pr-3">
                        {describeDevice(r.user_agent)}
                        {r.new_device && (
                          <span className="ml-2 rounded-full bg-[#FFF8E1] px-2 py-0.5 text-xs font-semibold text-[#8A6100]">
                            New device
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{describePlace(r.city, r.country, r.ip)}</td>
                      <td className="py-2">
                        {r.latitude != null && r.longitude != null ? (
                          <a href={mapsLink(r.latitude, r.longitude)} target="_blank" rel="noreferrer" className="underline">
                            Map{r.accuracy_m != null ? ` (±${Math.round(r.accuracy_m)} m)` : ""}
                          </a>
                        ) : r.location_status === "denied" ? (
                          <span className="font-semibold text-red-700">Location refused</span>
                        ) : r.location_status === "unavailable" ? (
                          <span className="text-ink-soft">Couldn&apos;t get location</span>
                        ) : (
                          <span className="text-ink-soft">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </main>
    </div>
  );
}
