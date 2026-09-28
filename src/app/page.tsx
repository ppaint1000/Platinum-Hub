import { redirect } from "next/navigation";

export default function RootPage() {
  // The proxy already redirects "/" to each user's landing page (see
  // src/lib/auth/landing.ts), so this only runs if that's bypassed. The
  // Dashboard page itself sends non-admins on to the Hub.
  redirect("/dashboard");
}
