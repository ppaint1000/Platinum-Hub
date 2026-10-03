import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { editResenePrice, type EditBody } from "@/lib/resene/priceApi";

// Costing > Resene Paint Prices: correcting a product by hand. Admin only.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user?.id ?? "").maybeSingle<{ role: string }>();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Admins only." }, { status: 403 });

  let body: EditBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const r = await editResenePrice(body);
  return NextResponse.json(r.body, { status: r.status });
}
