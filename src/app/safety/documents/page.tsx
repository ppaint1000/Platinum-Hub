// Safety documents (H&S policy, SDS sheets, emergency plan...) - everyone
// with the tick can open them; managers upload and remove.
import { safetyContext } from "@/lib/safety/data";
import { SafetyDocuments, type DocRow } from "@/components/safety/SafetyDocuments";

export default async function SafetyDocumentsPage() {
  const { supabase, isManager } = await safetyContext();
  const { data } = await supabase
    .from("safety_documents")
    .select("id, name, category, created_at")
    .order("category")
    .order("name")
    .returns<DocRow[]>();
  return <SafetyDocuments rows={data ?? []} canManage={isManager} />;
}
