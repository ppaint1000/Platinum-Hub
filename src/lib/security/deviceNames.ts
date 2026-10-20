// Names admins give devices (Users -> Sign-in log), by the Hub's device id.
// Table: supabase/device_names.sql. Never throws - no names if it's missing.
import { createAdminClient } from "@/lib/supabase/admin";

export async function deviceNames(deviceIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(deviceIds.filter((d): d is string => !!d))];
  if (!ids.length) return new Map();
  try {
    const { data, error } = await createAdminClient().from("hub_device_names").select("device_id, name").in("device_id", ids);
    if (error) return new Map();
    return new Map((data ?? []).map((d) => [d.device_id as string, d.name as string]));
  } catch {
    return new Map();
  }
}
