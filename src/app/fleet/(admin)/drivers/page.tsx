import { createClient } from "@/lib/supabase/server";

type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  staff_type: { name: string } | null;
};

type Vehicle = { id: string; plate: string; make: string; model: string; assigned_driver_id: string | null };

export default async function DriversPage() {
  const supabase = await createClient();

  const [{ data: profiles }, { data: vehicles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active, staff_type:staff_types(name)")
      .neq("role", "admin")
      .order("full_name")
      .returns<Profile[]>(),
    supabase
      .from("vehicles")
      .select("id, plate, make, model, assigned_driver_id")
      .returns<Vehicle[]>(),
  ]);

  const drivers = profiles ?? [];
  const vList = vehicles ?? [];

  const assignedVehicle = (driverId: string) => vList.find((v) => v.assigned_driver_id === driverId);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Drivers</h1>
        <p className="mt-1 text-sm text-muted">
          {drivers.length} staff member{drivers.length === 1 ? "" : "s"} who can log fuel entries
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {drivers.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No staff on file yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Assigned vehicle</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => {
                const v = assignedVehicle(d.id);
                return (
                  <tr key={d.id} className="border-b border-border last:border-b-0 hover:bg-background">
                    <td className="whitespace-nowrap px-5 py-3">{d.full_name}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-muted">{d.email}</td>
                    <td className="whitespace-nowrap px-5 py-3">{d.staff_type?.name ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          d.is_active ? "bg-green-50 text-green-700" : "bg-border/50 text-muted"
                        }`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {d.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {v ? `${v.make} ${v.model} — ${v.plate}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
