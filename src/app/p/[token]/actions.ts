"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { proposalCodeCookie } from "@/lib/quotes/proposalCode";

export async function enterProposalCode(token: string, _prev: { error?: string } | undefined, formData: FormData) {
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { error: "Enter the 6-digit code from your email." };

  const supabase = await createClient();
  const { data: ok } = await supabase.rpc("proposal_code_ok", { p_token: token, p_code: code });
  if (!ok) return { error: "That code doesn't match this proposal - please check it and try again." };

  (await cookies()).set(proposalCodeCookie(token), code, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  redirect(`/p/${token}`);
}
