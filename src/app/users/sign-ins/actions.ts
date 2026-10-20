"use server";

// Users -> Sign-in log: an admin names a device ("Saimone's work phone"),
// or clears the name by saving it empty.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function nameDeviceAction(formData: FormData) {
  const supabase = await requireAdmin();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const deviceId = String(formData.get("deviceId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const back = String(formData.get("back") ?? "/users/sign-ins");
  if (!deviceId) redirect(back);

  const db = createAdminClient();
  const { error } = name
    ? await db
        .from("hub_device_names")
        .upsert({ device_id: deviceId, name, named_by: user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "device_id" })
    : await db.from("hub_device_names").delete().eq("device_id", deviceId);

  revalidatePath("/users/sign-ins");
  const sep = back.includes("?") ? "&" : "?";
  redirect(error ? `${back}${sep}err=${encodeURIComponent("Couldn't save the name - is the device names table set up?")}` : back);
}
