import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/mailer";
import { fmtDate, fmtMoney } from "@/lib/orders/format";

type ItemRow = {
  description: string;
  colour: string | null;
  size: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type OrderRow = {
  supplier: string;
  project: string;
  project_number: string | null;
  order_date: string;
  order_items: ItemRow[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ sent: false, reason: "Not signed in." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ sent: false, reason: "Not authorized." }, { status: 403 });
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ sent: false, reason: "Invalid request." }, { status: 400 });
  }

  const email = body.email?.trim() ?? "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ sent: false, reason: "Enter a valid email address." }, { status: 400 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select(
      "supplier, project, project_number, order_date, order_items(description, colour, size, quantity, unit_price, line_total)"
    )
    .eq("id", id)
    .single<OrderRow>();

  if (!order) {
    return NextResponse.json({ sent: false, reason: "Order not found." }, { status: 404 });
  }

  const items = order.order_items ?? [];
  const total = items.reduce((s, i) => s + Number(i.line_total), 0);

  const rowsHtml = items
    .map((i) => {
      const detail = [i.colour, i.size].filter(Boolean).join(", ");
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e4e7;">${i.description}${
        detail ? ` — ${detail}` : ""
      }</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e4e7;text-align:right;">${i.quantity}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e4e7;text-align:right;">${fmtMoney(
          i.unit_price
        )}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e2e4e7;text-align:right;">${fmtMoney(
          i.line_total
        )}</td>
      </tr>`;
    })
    .join("");

  const subject = `Order ${order.project_number ?? ""} — ${order.project}`.trim();

  const html = `
    <div style="font-family:sans-serif;font-size:14px;color:#16181b;">
      <h2 style="margin:0 0 4px;">Order ${order.project_number ?? ""}</h2>
      <p style="margin:0 0 16px;color:#6b7280;">${order.project} — ${order.supplier} — ${fmtDate(
    order.order_date
  )}</p>
      <table style="border-collapse:collapse;width:100%;max-width:600px;">
        <thead>
          <tr style="text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">
            <th style="padding:6px 10px;border-bottom:1px solid #e2e4e7;">Description</th>
            <th style="padding:6px 10px;border-bottom:1px solid #e2e4e7;text-align:right;">Qty</th>
            <th style="padding:6px 10px;border-bottom:1px solid #e2e4e7;text-align:right;">Price</th>
            <th style="padding:6px 10px;border-bottom:1px solid #e2e4e7;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="margin-top:12px;font-weight:600;">Total: ${fmtMoney(total)}</p>
    </div>
  `;

  const text = `Order ${order.project_number ?? ""} — ${order.project} (${order.supplier}), ${fmtDate(
    order.order_date
  )}\n\n${items
    .map((i) => `${i.description}${i.colour ? ` — ${i.colour}` : ""}${i.size ? ` (${i.size})` : ""} x${i.quantity} @ ${fmtMoney(i.unit_price)} = ${fmtMoney(i.line_total)}`)
    .join("\n")}\n\nTotal: ${fmtMoney(total)}`;

  const result = await sendEmail({ to: email, subject, text, html });

  return NextResponse.json(result, { status: result.sent ? 200 : 502 });
}
