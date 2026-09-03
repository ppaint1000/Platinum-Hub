"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Field, inputClass } from "@/components/fleet/Modal";
import { ConfirmDialog } from "@/components/orders/ConfirmDialog";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/orders/format";

type LineItem = {
  key: string;
  isPaint: boolean;
  description: string;
  colour: string;
  size: string;
  quantity: string;
  unit_price: string;
};

type ExistingOrder = {
  id: string;
  supplier: string;
  project: string;
  project_number: string | null;
  order_date: string;
  updated_at: string | null;
  items: {
    id: string;
    is_paint: boolean;
    description: string;
    colour: string | null;
    size: string | null;
    quantity: number;
    unit_price: number;
  }[];
};

function emptyLine(): LineItem {
  return {
    key: crypto.randomUUID(),
    isPaint: false,
    description: "",
    colour: "",
    size: "",
    quantity: "1",
    unit_price: "",
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function OrderForm({ existing }: { existing?: ExistingOrder }) {
  const router = useRouter();
  const [supplier, setSupplier] = useState(existing?.supplier ?? "");
  const [project, setProject] = useState(existing?.project ?? "");
  const orderDate = existing?.order_date ?? todayISO();
  const [items, setItems] = useState<LineItem[]>(
    existing && existing.items.length > 0
      ? existing.items.map((i) => ({
          key: i.id,
          isPaint: i.is_paint,
          description: i.description,
          colour: i.colour ?? "",
          size: i.size ?? "",
          quantity: String(i.quantity),
          unit_price: String(i.unit_price),
        }))
      : [emptyLine()]
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supplierOptions, setSupplierOptions] = useState<string[]>([]);
  const [projectOptions, setProjectOptions] = useState<string[]>([]);
  const [descriptionOptions, setDescriptionOptions] = useState<string[]>([]);
  const [colourOptions, setColourOptions] = useState<string[]>([]);
  const [sizeOptions, setSizeOptions] = useState<string[]>([]);
  const [previewProjectNumber, setPreviewProjectNumber] = useState<string | null>(null);
  const [postSaveStep, setPostSaveStep] = useState<"ask" | "email" | null>(null);
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);
  const [emailAddress, setEmailAddress] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from("orders")
      .select("supplier")
      .then(({ data }) => {
        const counts = new Map<string, number>();
        for (const o of data ?? []) {
          const name = o.supplier.trim();
          if (!name) continue;
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        const byUsage = Array.from(counts.keys()).sort(
          (a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b)
        );
        setSupplierOptions(byUsage);
      });

    supabase
      .from("sites")
      .select("name")
      .eq("is_active", true)
      .then(({ data }) => {
        const unique = Array.from(
          new Set((data ?? []).map((s) => s.name.trim()).filter(Boolean))
        );
        unique.sort((a, b) => a.localeCompare(b));
        setProjectOptions(unique);
      });

    supabase
      .from("order_items")
      .select("description")
      .then(({ data }) => {
        const unique = Array.from(
          new Set((data ?? []).map((i) => i.description.trim()).filter(Boolean))
        );
        unique.sort((a, b) => a.localeCompare(b));
        setDescriptionOptions(unique);
      });

    supabase
      .from("order_items")
      .select("colour")
      .then(({ data }) => {
        const unique = Array.from(
          new Set((data ?? []).map((i) => (i.colour ?? "").trim()).filter(Boolean))
        );
        unique.sort((a, b) => a.localeCompare(b));
        setColourOptions(unique);
      });

    supabase
      .from("order_items")
      .select("size")
      .then(({ data }) => {
        const unique = Array.from(
          new Set((data ?? []).map((i) => (i.size ?? "").trim()).filter(Boolean))
        );
        unique.sort((a, b) => a.localeCompare(b));
        setSizeOptions(unique);
      });

    if (!existing) {
      supabase.rpc("next_project_number_preview").then(({ data }) => {
        if (typeof data === "string") setPreviewProjectNumber(data);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateItem(key: string, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyLine()]);
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  }

  const anyPaint = items.some((it) => it.isPaint);

  const total = items.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0
  );

  async function save() {
    if (!supplier.trim()) return setError("Supplier is required.");
    if (!project.trim()) return setError("Project is required.");

    const validItems = items.filter((it) => it.description.trim());
    if (validItems.length === 0) return setError("Add at least one line item.");

    setSaving(true);
    setError(null);
    const supabase = createClient();

    let orderId = existing?.id ?? null;
    if (orderId) {
      const { error } = await supabase
        .from("orders")
        .update({
          supplier: supplier.trim(),
          project: project.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (error) {
        setSaving(false);
        return setError("Couldn't save — " + error.message);
      }
    } else {
      const { data, error } = await supabase
        .from("orders")
        .insert({
          supplier: supplier.trim(),
          project: project.trim(),
        })
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        return setError("Couldn't save — " + (error?.message ?? "unknown error"));
      }
      orderId = data.id;
    }

    await supabase.from("order_items").delete().eq("order_id", orderId);
    const rows = validItems.map((it, i) => ({
      order_id: orderId,
      is_paint: it.isPaint,
      description: it.description.trim(),
      colour: it.isPaint ? it.colour.trim() || null : null,
      size: it.isPaint ? it.size.trim() || null : null,
      quantity: Number(it.quantity) || 0,
      unit_price: Number(it.unit_price) || 0,
      sort_order: i,
    }));
    const { error: itemsError } = await supabase.from("order_items").insert(rows);

    setSaving(false);
    if (itemsError) return setError("Couldn't save line items — " + itemsError.message);

    setSavedOrderId(orderId);
    setPostSaveStep("ask");
  }

  function leaveOrders() {
    router.push("/orders");
    router.refresh();
  }

  async function sendOrderEmail() {
    if (!emailAddress.trim()) return setEmailError("Enter an email address.");
    if (!savedOrderId) return;

    setEmailSending(true);
    setEmailError(null);
    try {
      const res = await fetch(`/api/orders/${savedOrderId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailAddress.trim() }),
      });
      const result = await res.json();
      setEmailSending(false);
      if (!res.ok || !result.sent) {
        setEmailError(result.reason || "Couldn't send the email.");
        return;
      }
      leaveOrders();
    } catch {
      setEmailSending(false);
      setEmailError("Couldn't send the email — check your connection and try again.");
    }
  }

  async function remove() {
    if (!existing) return;
    setDeleting(true);
    setDeleteError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("orders")
      .delete()
      .eq("id", existing.id)
      .select("id");
    setDeleting(false);
    if (error) {
      setDeleteError("Couldn't delete — " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      setDeleteError(
        'Nothing was deleted — your account may not have permission to delete orders. Check that your profile\'s role is set to "admin" in Supabase.'
      );
      return;
    }
    router.push("/orders");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">{existing ? "Edit order" : "New order"}</h1>
        {existing && (
          <button
            onClick={() => {
              setDeleteError(null);
              setConfirmingDelete(true);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-brand-red transition hover:bg-background"
          >
            <Trash2 className="h-4 w-4" />
            Delete order
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Supplier" required>
            <input
              className={inputClass}
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="e.g. Resene"
              list="supplier-options"
              autoComplete="off"
            />
            <datalist id="supplier-options">
              {supplierOptions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Project" required>
            <input
              className={inputClass}
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="e.g. 14 Queen St repaint"
              list="project-options"
              autoComplete="off"
            />
            <datalist id="project-options">
              {projectOptions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="Project number">
            <div className="flex h-[38px] items-center text-sm text-ink">
              {existing ? (
                <span className="font-mono">{existing.project_number ?? "—"}</span>
              ) : previewProjectNumber ? (
                <span className="font-mono">{previewProjectNumber}</span>
              ) : (
                <span className="text-muted">Assigning…</span>
              )}
            </div>
          </Field>
          <Field label="Date">
            <div className="flex h-[38px] items-center gap-2 text-sm text-ink">
              <span>{fmtDate(orderDate)}</span>
              {existing?.updated_at && (
                <span className="text-brand-red">(edited {fmtDateTime(existing.updated_at)})</span>
              )}
            </div>
          </Field>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted">Line items</span>
            <button
              onClick={addItem}
              className="flex items-center gap-1 text-xs font-semibold text-brand-red-dark transition hover:text-brand-red"
            >
              <Plus className="h-3.5 w-3.5" />
              Add line
            </button>
          </div>

          <datalist id="description-options">
            {descriptionOptions.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <datalist id="colour-options">
            {colourOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <datalist id="size-options">
            {sizeOptions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-background text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="w-16 px-3 py-2 text-center">Paint</th>
                  <th className="w-72 px-3 py-2">Description</th>
                  {anyPaint && (
                    <>
                      <th className="w-56 px-3 py-2">Colour</th>
                      <th className="w-40 px-3 py-2">Size</th>
                    </>
                  )}
                  <th className="w-24 px-3 py-2">Qty</th>
                  <th className="w-32 px-3 py-2">Price</th>
                  <th className="w-32 px-3 py-2">Line total</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.key} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={it.isPaint}
                        onChange={(e) => updateItem(it.key, { isPaint: e.target.checked })}
                        aria-label="Paint"
                        className="h-4 w-4 accent-brand-red"
                      />
                    </td>
                    {it.isPaint ? (
                      <>
                        <td className="px-3 py-2">
                          <input
                            className={inputClass + " w-full"}
                            value={it.description}
                            onChange={(e) => updateItem(it.key, { description: e.target.value })}
                            list="description-options"
                            autoComplete="off"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={inputClass + " w-full"}
                            value={it.colour}
                            onChange={(e) => updateItem(it.key, { colour: e.target.value })}
                            list="colour-options"
                            autoComplete="off"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className={inputClass + " w-full"}
                            value={it.size}
                            onChange={(e) => updateItem(it.key, { size: e.target.value })}
                            list="size-options"
                            autoComplete="off"
                          />
                        </td>
                      </>
                    ) : (
                      <td className="px-3 py-2" colSpan={anyPaint ? 3 : 1}>
                        <input
                          className={inputClass + " w-full"}
                          value={it.description}
                          onChange={(e) => updateItem(it.key, { description: e.target.value })}
                          list="description-options"
                          autoComplete="off"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        className={inputClass + " w-full"}
                        value={it.quantity}
                        onChange={(e) => updateItem(it.key, { quantity: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        className={inputClass + " w-full"}
                        value={it.unit_price}
                        onChange={(e) => updateItem(it.key, { unit_price: e.target.value })}
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink">
                      {fmtMoney((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeItem(it.key)}
                        aria-label="Remove line"
                        className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-brand-red"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex justify-end">
            <div className="text-sm">
              <span className="text-muted">Total: </span>
              <span className="font-semibold text-ink">{fmtMoney(total)}</span>
            </div>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-brand-red">{error}</p>}

        <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
          <button
            onClick={() => router.push("/orders")}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-background"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save order"}
          </button>
        </div>
      </div>

      {confirmingDelete && existing && (
        <ConfirmDialog
          title="Delete order"
          message={`Delete order for "${existing.project}"? This can't be undone.`}
          confirming={deleting}
          confirmingLabel="Deleting…"
          error={deleteError}
          onConfirm={remove}
          onCancel={() => {
            setConfirmingDelete(false);
            setDeleteError(null);
          }}
        />
      )}

      {postSaveStep === "ask" && (
        <ConfirmDialog
          title="Order saved"
          message="Would you like to email this order?"
          confirmLabel="Yes, email it"
          cancelLabel="No thanks"
          tone="primary"
          onConfirm={() => setPostSaveStep("email")}
          onCancel={leaveOrders}
        />
      )}

      {postSaveStep === "email" && (
        <ConfirmDialog
          title="Email order"
          message="Enter the email address to send this order to:"
          confirmLabel="Send"
          confirmingLabel="Sending…"
          cancelLabel="Skip"
          tone="primary"
          confirming={emailSending}
          error={emailError}
          onConfirm={sendOrderEmail}
          onCancel={leaveOrders}
        >
          <input
            type="email"
            autoFocus
            className={inputClass + " w-full"}
            value={emailAddress}
            onChange={(e) => setEmailAddress(e.target.value)}
            placeholder="name@example.com"
          />
        </ConfirmDialog>
      )}
    </div>
  );
}
