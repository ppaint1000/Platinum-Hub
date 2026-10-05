// Health & safety templates (HazardCo's library): what each one is for,
// a link to it where the Hub already does it, and the template file once
// an admin has uploaded it.
import { safetyContext } from "@/lib/safety/data";
import { SafetyTemplates, type TemplateFile } from "@/components/safety/SafetyTemplates";

export default async function SafetyTemplatesPage() {
  const { supabase, isManager } = await safetyContext();
  const { data } = await supabase
    .from("safety_documents")
    .select("id, name, template_key")
    .eq("category", "template")
    .order("created_at")
    .returns<TemplateFile[]>();
  return <SafetyTemplates files={data ?? []} canManage={isManager} />;
}
