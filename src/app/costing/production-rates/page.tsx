import { redirect } from "next/navigation";

// Moved into Settings (admin only).
export default function MovedPage() {
  redirect("/settings/production-rates");
}
