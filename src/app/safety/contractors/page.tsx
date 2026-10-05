// Contractors (subbies): who they are, their pre-qualification and when it
// and their insurance run out. Managers only.
import { redirect } from "next/navigation";
import { safetyContext } from "@/lib/safety/data";
import { SafetyContractors, type ContractorRow } from "@/components/safety/SafetyContractors";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export default async function SafetyContractorsPage() {
  const { supabase, isManager } = await safetyContext();
  if (!isManager) redirect("/safety");
  const { data } = await supabase
    .from("safety_contractors")
    .select("id, company, contact_name, email, phone, trades, prequal_status, prequal_expires_on, insurance_expires_on, notes, archived")
    .order("archived")
    .order("company")
    .returns<ContractorRow[]>();
  return <SafetyContractors rows={data ?? []} today={nzTodayDateString()} />;
}
