import { createClient } from "@/lib/supabase/server";
import { NewQuoteClient } from "@/components/quotes/NewQuoteClient";

export default async function NewQuotePage() {
  const supabase = await createClient();

  const { data: customers } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");

  return <NewQuoteClient customers={customers ?? []} />;
}
