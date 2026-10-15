"use client";

// "Show: All vehicles / one vehicle" for the Fuel Log - kept in the address
// (?vehicle=<id>) so a filtered view can be bookmarked or shared.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { inputClass } from "@/components/fleet/Modal";

export function VehicleFilter({ vehicles, value }: { vehicles: { id: string; plate: string; make: string; model: string }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function choose(id: string) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("vehicle", id);
    else next.delete("vehicle");
    router.push(next.toString() ? `${pathname}?${next}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium text-ink">Vehicle</span>
      <select className={inputClass + " w-auto"} value={value} onChange={(e) => choose(e.target.value)}>
        <option value="">All vehicles</option>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.plate} — {v.make} {v.model}
          </option>
        ))}
      </select>
    </label>
  );
}
