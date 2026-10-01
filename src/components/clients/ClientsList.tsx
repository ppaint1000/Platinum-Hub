"use client";

// The Clients list as a table: search, a salesperson filter, sortable
// columns, and a Columns menu to choose which ones show (remembered on this
// device). Admins can tick clients and set their salesperson in one go.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Columns3, Filter, Plus, Search } from "lucide-react";
import { createClientAction, setClientsSalesPersonAction } from "@/app/clients/actions";
import { Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";

export type ClientRow = {
  id: string;
  name: string;
  notes: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  sales_person_id: string | null;
  created_at: string;
  updated_at: string;
  contactCount: number;
  quoteCount: number;
  wonCount: number;
  wonValue: number;
};

type SalesPerson = { id: string; name: string };

type ColumnKey =
  | "email"
  | "phone"
  | "address"
  | "salesperson"
  | "contacts"
  | "quotes"
  | "won"
  | "updated"
  | "created";
type SortKey = "name" | ColumnKey;

const COLUMNS: { key: ColumnKey; label: string; defaultOn: boolean }[] = [
  { key: "email", label: "Email", defaultOn: true },
  { key: "phone", label: "Phone", defaultOn: true },
  { key: "address", label: "Address", defaultOn: false },
  { key: "salesperson", label: "Salesperson", defaultOn: true },
  { key: "contacts", label: "Contacts", defaultOn: false },
  { key: "quotes", label: "Quotes", defaultOn: true },
  { key: "won", label: "Won $", defaultOn: false },
  { key: "updated", label: "Updated", defaultOn: true },
  { key: "created", label: "Created", defaultOn: true },
];
const DEFAULT_COLUMNS = COLUMNS.filter((c) => c.defaultOn).map((c) => c.key);
const STORAGE_KEY = "clients-table-columns";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland" });
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-NZ");

export function ClientsList({
  clients,
  salesTeam,
  currentUserId,
  isAdmin,
}: {
  clients: ClientRow[];
  salesTeam: SalesPerson[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const nameOf = useMemo(() => new Map(salesTeam.map((p) => [p.id, p.name])), [salesTeam]);
  const salesName = (c: ClientRow) =>
    c.sales_person_id ? nameOf.get(c.sales_person_id) ?? "Former salesperson" : "";

  // ── Columns shown (remembered on this device) ──
  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
      if (Array.isArray(saved)) {
        const valid = saved.filter((k): k is ColumnKey => COLUMNS.some((c) => c.key === k));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from storage after mount
        setColumns(valid);
      }
    } catch {
      // No storage (private window etc.) - keep the defaults.
    }
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState<ColumnKey[]>(columns);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Element;
      if (menuRef.current?.contains(target) || target.closest("[data-columns-button]")) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  function openMenu() {
    setDraftColumns(columns);
    setMenuOpen((v) => !v);
  }
  function saveColumns() {
    setColumns(draftColumns);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draftColumns));
    } catch {
      // Not remembered - fine.
    }
    setMenuOpen(false);
  }
  const shows = (k: ColumnKey) => columns.includes(k);

  // ── Search, filter, sort ──
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  // "" = everyone's clients, "none" = no salesperson yet.
  const [salesFilter, setSalesFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "name", desc: false });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = clients.filter(
      (c) =>
        (!salesFilter || (salesFilter === "none" ? !c.sales_person_id : c.sales_person_id === salesFilter)) &&
        (!q ||
          [c.name, c.email, c.phone, c.address, c.notes].some((v) => v?.toLowerCase().includes(q)))
    );
    const value = (c: ClientRow): string | number => {
      switch (sort.key) {
        case "name": return c.name.toLowerCase();
        case "email": return (c.email ?? "").toLowerCase();
        case "phone": return c.phone ?? "";
        case "address": return (c.address ?? "").toLowerCase();
        case "salesperson": return salesName(c).toLowerCase();
        case "contacts": return c.contactCount;
        case "quotes": return c.quoteCount;
        case "won": return c.wonValue;
        case "updated": return c.updated_at;
        case "created": return c.created_at;
      }
    };
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      // Blanks always last, whichever way it's sorted.
      if (va === "" && vb !== "") return 1;
      if (vb === "" && va !== "") return -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sort.desc ? -cmp : cmp;
    });
    // salesName only depends on nameOf
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, query, salesFilter, sort, nameOf]);

  function sortBy(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, desc: !s.desc }
        : // Dates and numbers start biggest/newest first.
          { key, desc: ["updated", "created", "quotes", "won", "contacts"].includes(key) }
    );
  }

  // ── Ticking clients (admins: set the salesperson on several at once) ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSalesPerson, setBulkSalesPerson] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const allVisibleTicked = visible.length > 0 && visible.every((c) => selected.has(c.id));
  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allVisibleTicked ? new Set() : new Set(visible.map((c) => c.id)));
  }
  async function applyBulk() {
    setBulkSaving(true);
    setError(null);
    const result = await setClientsSalesPersonAction([...selected], bulkSalesPerson || null);
    setBulkSaving(false);
    if (result.error) return setError(result.error);
    setSelected(new Set());
    router.refresh();
  }

  // ── New client ──
  const defaultSalesPerson = nameOf.has(currentUserId) ? currentUserId : "";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [salesPersonId, setSalesPersonId] = useState(defaultSalesPerson);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await createClientAction({ name, notes, salesPersonId: salesPersonId || null });
    setSaving(false);
    if (result.error) return setError(result.error);
    setName("");
    setNotes("");
    setSalesPersonId(defaultSalesPerson);
    setOpen(false);
    router.refresh();
  }

  const th = "px-3 py-3 text-left text-sm font-semibold whitespace-nowrap";
  const td = "px-3 py-3 align-top";

  function sortHeader(k: SortKey, label: string, right = false) {
    const active = sort.key === k;
    return (
      <th key={k} className={`${th} ${right ? "text-right" : ""}`} aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}>
        <button type="button" onClick={() => sortBy(k)} className="inline-flex items-center gap-1 hover:underline">
          {label}
          {active ? (
            sort.desc ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />
          ) : null}
        </button>
      </th>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Clients</h1>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#1F4E8C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#183e70]"
        >
          <Plus className="h-4 w-4" />
          {open ? "Cancel" : "New Client"}
        </button>
      </div>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="grid gap-3 rounded-lg border border-line bg-paper-raised p-4 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Name</span>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded border border-line px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Salesperson</span>
            <select
              value={salesPersonId}
              onChange={(e) => setSalesPersonId(e.target.value)}
              className="rounded border border-line px-2 py-1.5"
            >
              <option value="">No one yet</option>
              {salesTeam.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-ink">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded border border-line px-2 py-1.5"
            />
          </label>
          <p className="text-xs text-ink-soft sm:col-span-2">
            Add email, phone, address and contacts on the client&apos;s page once it&apos;s created.
          </p>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add client"}
            </Button>
          </div>
        </form>
      )}

      {/* Search and filter */}
      <div className="rounded-lg border border-line bg-paper-raised p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, phone or address…"
              className="w-full rounded-md border border-transparent bg-transparent py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-line focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ${
              salesFilter ? "bg-[#1F4E8C] text-white" : "bg-[#E7E9EE] text-ink hover:bg-[#dcdfe6]"
            }`}
          >
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
        {filterOpen && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-ink-soft">Salesperson</span>
              <select
                value={salesFilter}
                onChange={(e) => setSalesFilter(e.target.value)}
                className="rounded border border-line px-2 py-1.5"
              >
                <option value="">Everyone&apos;s clients</option>
                {salesTeam.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="none">No salesperson yet</option>
              </select>
            </label>
            {salesFilter && (
              <button type="button" onClick={() => setSalesFilter("")} className="text-accent hover:underline">
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Ticked clients (admins) */}
      {isAdmin && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#1F4E8C]/30 bg-[#EEF3FA] px-3 py-2 text-sm">
          <span className="font-semibold">{selected.size} ticked</span>
          <span className="text-ink-soft">· set salesperson to</span>
          <select
            value={bulkSalesPerson}
            onChange={(e) => setBulkSalesPerson(e.target.value)}
            className="rounded border border-line bg-white px-2 py-1"
          >
            <option value="">No one</option>
            {salesTeam.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button onClick={applyBulk} disabled={bulkSaving}>
            {bulkSaving ? "Saving…" : "Apply"}
          </Button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-accent hover:underline">
            Untick all
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}

      {/* The table */}
      {/* Not overflow-hidden, so the Columns menu is never cut off. */}
      <div className="relative rounded-lg border border-line bg-paper-raised">
        <div className="overflow-x-auto rounded-t-lg">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-[#2E3A4F] text-white">
              <tr>
                {isAdmin && (
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleTicked}
                      onChange={toggleAll}
                      aria-label="Tick all clients shown"
                      className="h-4 w-4"
                    />
                  </th>
                )}
                {sortHeader("name", "Name")}
                {shows("email") && sortHeader("email", "Email")}
                {shows("phone") && sortHeader("phone", "Phone")}
                {shows("address") && sortHeader("address", "Address")}
                {shows("salesperson") && sortHeader("salesperson", "Salesperson")}
                {shows("contacts") && sortHeader("contacts", "Contacts", true)}
                {shows("quotes") && sortHeader("quotes", "Quotes", true)}
                {shows("won") && sortHeader("won", "Won $", true)}
                {shows("updated") && sortHeader("updated", "Updated")}
                {shows("created") && sortHeader("created", "Created")}
                <th className="w-12 px-2 py-3 text-right">
                  <div data-columns-button className="inline-block text-left">
                    <button
                      type="button"
                      onClick={openMenu}
                      aria-expanded={menuOpen}
                      aria-label="Choose columns"
                      title="Choose columns"
                      className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 hover:bg-white/10"
                    >
                      <Columns3 className="h-4 w-4" />
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/clients/${c.id}`)}
                  className={`cursor-pointer border-t border-line hover:bg-[#F5F7FA] ${selected.has(c.id) ? "bg-[#EEF3FA]" : ""}`}
                >
                  {isAdmin && (
                    <td className={td} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        aria-label={`Tick ${c.name}`}
                        className="h-4 w-4"
                      />
                    </td>
                  )}
                  <td className={`${td} min-w-[10rem] font-medium text-ink`}>
                    <Link href={`/clients/${c.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  {shows("email") && <td className={`${td} break-all text-ink-soft`}>{c.email ?? ""}</td>}
                  {shows("phone") && <td className={`${td} whitespace-nowrap text-ink-soft`}>{c.phone ?? ""}</td>}
                  {shows("address") && <td className={`${td} min-w-[12rem] text-ink-soft`}>{c.address ?? ""}</td>}
                  {shows("salesperson") && (
                    <td className={`${td} whitespace-nowrap`}>
                      {salesName(c) || <span className="text-ink-faint">No one yet</span>}
                    </td>
                  )}
                  {shows("contacts") && <td className={`${td} text-right`}>{c.contactCount}</td>}
                  {shows("quotes") && (
                    <td className={`${td} whitespace-nowrap text-right`}>
                      {c.quoteCount}
                      {c.wonCount > 0 && <span className="text-ink-soft"> · {c.wonCount} won</span>}
                    </td>
                  )}
                  {shows("won") && <td className={`${td} whitespace-nowrap text-right`}>{c.wonValue > 0 ? money(c.wonValue) : ""}</td>}
                  {shows("updated") && <td className={`${td} whitespace-nowrap text-ink-soft`}>{fmtDate(c.updated_at)}</td>}
                  {shows("created") && <td className={`${td} whitespace-nowrap text-ink-soft`}>{fmtDate(c.created_at)}</td>}
                  <td className={td} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {menuOpen && (
          <div ref={menuRef} className="absolute right-2 top-12 z-30 w-56 rounded-lg border border-line bg-white p-2 text-ink shadow-xl">
            <ul className="flex flex-col gap-1">
              <li className="flex items-center justify-between rounded-md bg-[#F1F2F5] px-3 py-2 text-sm text-ink-soft">
                Name
                <Check className="h-4 w-4" />
              </li>
              {COLUMNS.map((c) => {
                const on = draftColumns.includes(c.key);
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={on}
                      onClick={() =>
                        setDraftColumns((d) =>
                          on ? d.filter((k) => k !== c.key) : COLUMNS.map((x) => x.key).filter((k) => k === c.key || d.includes(k))
                        )
                      }
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-normal ${
                        on ? "bg-[#F1F2F5]" : "hover:bg-[#F7F8FA]"
                      }`}
                    >
                      {c.label}
                      {on ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#2E3A4F] text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : (
                        <span className="h-4 w-4 rounded-full border-2 border-[#2E3A4F]" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="px-2 py-1.5 text-sm font-semibold text-ink-soft hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveColumns}
                className="rounded-md bg-[#1F4E8C] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#183e70]"
              >
                Done
              </button>
            </div>
          </div>
        )}
        {visible.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-soft">
            {clients.length === 0 ? "No clients yet." : "No clients match."}
          </p>
        )}
        <p className="border-t border-line px-3 py-2 text-xs text-ink-soft">
          {visible.length} of {clients.length} client{clients.length === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
