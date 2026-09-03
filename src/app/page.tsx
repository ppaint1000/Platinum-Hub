import { redirect } from "next/navigation";

export default function RootPage() {
  // Proxy already routes unauthenticated users to /sign-in and non-admins
  // to /fleet/log, so anyone reaching here is a signed-in admin.
  redirect("/hub");
}
