// Work order — the crew's copy of a costing: every area's surfaces with
// coats, paint, litres and hours, plus access and other items, but no prices.
// Printable. Shown in the app (/costing/<id>/work-order) and on the crew's
// link (/w/<token>, opened from the Hub when clocking in).
import { PrintButton } from "@/components/quotes/PrintButton";

export type Line = {
  id: string;
  line_type: string | null;
  surface_name: string;
  qty: number;
  coats: number;
  hours: number;
  litres: number;
  prep_hours: number;
  paint_product_id: string | null;
  unit_price: number | null;
  sort_order: number;
};
export type Building = {
  id: string;
  name: string | null;
  category: string | null;
  excludes: string | null;
  note: string | null;
  paint_product_id: string | null;
  sheeting_up_enabled: boolean;
  sheeting_up_pct: number;
  sort_order: number;
  is_option?: boolean | null;
  quote_building_lines: Line[] | null;
};
export type Item = {
  id: string;
  building_id: string | null;
  description: string;
  quantity: number;
  is_access: boolean | null;
  is_option?: boolean | null;
};
export type Product = { id: string; name: string; brand: string | null; is_default: boolean };

const hrs = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-NZ", { maximumFractionDigits: 2 });
const litres = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("en-NZ", { maximumFractionDigits: 1 })} L`;
const qtyFmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-NZ", { maximumFractionDigits: 2 });

export type WorkOrderData = {
  location: string | null;
  notes: string | null;
  customerName: string | null;
  buildings: Building[];
  items: Item[];
  products: Product[];
};

export function WorkOrderView({ data }: { data: WorkOrderData }) {
  const quote = { location: data.location, notes: data.notes };
  const products = data.products;
  const defaultPaintId = products.find((p) => p.is_default)?.id ?? null;
  const productName = (pid: string | null) => {
    const p = products.find((x) => x.id === pid);
    return p ? `${p.name}${p.brand ? ` (${p.brand})` : ""}` : "—";
  };
  const customerName = data.customerName ?? "—";
  // Only items actually in the job (a quantity entered), like the surfaces.
  const items = data.items.filter((i) => Number(i.quantity) > 0);

  const litresByProduct = new Map<string, number>();

  const areas = data.buildings.map((b) => {
    const lines = [...(b.quote_building_lines ?? [])].sort((x, y) => x.sort_order - y.sort_order);
    // Only rows actually in the job (a quantity entered).
    const surfaces = lines
      .filter((l) => (l.line_type ?? "surface") === "surface" && Number(l.qty) > 0)
      .map((l) => {
        const paintId = l.paint_product_id ?? b.paint_product_id ?? defaultPaintId;
        // Options only happen if the customer accepts them - not in the paint list.
        if (!b.is_option && paintId && l.litres > 0)
          litresByProduct.set(paintId, (litresByProduct.get(paintId) ?? 0) + Number(l.litres));
        return { ...l, paint: productName(paintId) };
      });
    const timed = lines.filter((l) => (l.line_type === "wash" || l.line_type === "hourly" || l.line_type === "sundry") && Number(l.hours) > 0);

    const surfaceHours = lines.reduce((s, l) => s + Number(l.hours), 0);
    const prepHours = lines.reduce((s, l) => s + Number(l.prep_hours), 0);
    // Sheeting up: the same share of hours as the costing and its Summary
    // - not of a hand-priced wash or hourly items.
    const notSheeted = lines
      .filter((l) => l.line_type === "hourly" || (l.line_type === "wash" && l.unit_price != null))
      .reduce((s, l) => s + Number(l.hours), 0);
    const sheetingHours = b.sheeting_up_enabled ? Number(b.sheeting_up_pct) * (surfaceHours - notSheeted) : 0;

    return {
      id: b.id,
      name: b.name || "Untitled area",
      category: b.category === "External" ? "Exterior" : "Interior",
      isOption: !!b.is_option,
      excludes: b.excludes,
      note: b.note,
      surfaces,
      timed,
      prepHours,
      sheetingHours,
      totalHours: surfaceHours + prepHours + sheetingHours,
      items: items.filter((i) => i.building_id === b.id),
    };
  });

  const otherItems = items.filter((i) => !i.building_id);
  // Options aren't in the job unless the customer accepts them.
  const totalHours = areas.filter((a) => !a.isOption).reduce((s, a) => s + a.totalHours, 0);
  const paint = [...litresByProduct.entries()]
    .map(([pid, l]) => ({ name: productName(pid), litres: l }))
    .sort((a, b) => b.litres - a.litres);

  const th = "px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted";
  const td = "px-2 py-1.5";

  return (
    <div className="mx-auto max-w-4xl text-sm text-ink print:max-w-none print:text-[11px]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Work order</p>
          <h1 className="text-2xl font-semibold">{quote.location || "Untitled job"}</h1>
          <p className="text-muted">{customerName}</p>
        </div>
        <PrintButton label="Print work order" />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Total hours</p>
          <p className="text-2xl font-semibold">{hrs(totalHours)}</p>
          <p className="text-xs text-muted">Includes prep and sheeting up · not options</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Paint needed</p>
          {paint.length === 0 ? (
            <p className="text-muted">—</p>
          ) : (
            <ul className="space-y-0.5">
              {paint.map((p) => (
                <li key={p.name} className="flex justify-between gap-3">
                  <span>{p.name}</span>
                  <span className="font-semibold">{litres(p.litres)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {quote.notes && (
        <div className="mb-6 rounded-lg border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Job notes</p>
          <p className="whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}

      <div className="space-y-6">
        {areas.map((a) => (
          <section
            key={a.id}
            className={`break-inside-avoid rounded-lg border ${a.isOption ? "border-dashed border-amber-500" : "border-border"}`}
          >
            {a.isOption && (
              <p className="bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                Option — only if the customer accepts it
              </p>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-background px-3 py-2">
              <h2 className="text-base font-semibold">
                {a.name} <span className="text-sm font-normal text-muted">· {a.category}</span>
              </h2>
              <span className="font-semibold">{hrs(a.totalHours)} hrs</span>
            </div>

            {a.surfaces.length > 0 && (
              <table className="w-full border-collapse">
                <thead className="border-b border-border">
                  <tr>
                    <th className={th}>Surface</th>
                    <th className={`${th} text-right`}>Qty</th>
                    <th className={`${th} text-right`}>Coats</th>
                    <th className={th}>Paint</th>
                    <th className={`${th} text-right`}>Litres</th>
                    <th className={`${th} text-right`}>Hours</th>
                    <th className={`${th} text-right`}>Prep hrs</th>
                  </tr>
                </thead>
                <tbody>
                  {a.surfaces.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className={`${td} font-medium`}>{l.surface_name}</td>
                      <td className={`${td} text-right`}>{qtyFmt(Number(l.qty))}</td>
                      <td className={`${td} text-right`}>{l.coats}</td>
                      <td className={td}>{l.paint}</td>
                      <td className={`${td} text-right`}>{litres(Number(l.litres))}</td>
                      <td className={`${td} text-right`}>{hrs(Number(l.hours))}</td>
                      <td className={`${td} text-right`}>{Number(l.prep_hours) > 0 ? hrs(Number(l.prep_hours)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <ul className="space-y-0.5 px-3 py-2">
              {a.timed.map((l) => (
                <li key={l.id} className="flex justify-between gap-3">
                  <span>{l.surface_name}</span>
                  <span>{hrs(Number(l.hours))} hrs</span>
                </li>
              ))}
              {a.sheetingHours > 0 && (
                <li className="flex justify-between gap-3">
                  <span>Sheeting up</span>
                  <span>{hrs(a.sheetingHours)} hrs</span>
                </li>
              )}
              {a.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>
                    {i.is_access ? "Access: " : ""}
                    {i.description}
                    {i.is_option && !a.isOption ? " (option — only if accepted)" : ""}
                  </span>
                  <span>× {qtyFmt(Number(i.quantity))}</span>
                </li>
              ))}
            </ul>

            {(a.excludes || a.note) && (
              <div className="space-y-1 border-t border-border px-3 py-2">
                {a.excludes && (
                  <p>
                    <span className="font-semibold">Excludes: </span>
                    {a.excludes}
                  </p>
                )}
                {a.note && (
                  <p>
                    <span className="font-semibold">Note: </span>
                    {a.note}
                  </p>
                )}
              </div>
            )}
          </section>
        ))}

        {otherItems.length > 0 && (
          <section className="break-inside-avoid rounded-lg border border-border">
            <div className="border-b border-border bg-background px-3 py-2">
              <h2 className="text-base font-semibold">Other items</h2>
            </div>
            <ul className="space-y-0.5 px-3 py-2">
              {otherItems.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>
                    {i.description}
                    {i.is_option ? " (option — only if accepted)" : ""}
                  </span>
                  <span>× {qtyFmt(Number(i.quantity))}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {areas.length === 0 && <p className="text-muted">This costing has no areas yet.</p>}
      </div>
    </div>
  );
}
