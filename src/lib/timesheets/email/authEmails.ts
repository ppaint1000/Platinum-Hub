import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/mailer'
import { SITE_URL } from '@/lib/timesheets/siteUrl'

type AuthEmailType = 'invite' | 'recovery'

const FROM_NAME = 'Platinum Painters Timesheets'

// Supabase's built-in invite/recovery emails link straight to a one-time
// verification endpoint - any automated link scanner in a company inbox
// (Microsoft Safe Links, Google Workspace security add-ons, etc.) that
// pre-fetches links to check for phishing burns that link before the real
// person ever clicks it. Sending our own email, pointing at /accept-invite
// (which only exchanges the token on an actual button click), sidesteps
// that entirely. Customizing Supabase's own email templates isn't an
// option either - that requires a paid plan or custom SMTP unless you're
// on Supabase's default free-tier email sender.
export async function sendAuthEmail(
  email: string,
  type: AuthEmailType,
  fullName?: string
): Promise<{ error?: string; userId?: string }> {
  const adminClient = createAdminClient()
  const { data, error } =
    type === 'invite'
      ? await adminClient.auth.admin.generateLink({
          type,
          email,
          options: { data: { full_name: fullName } },
        })
      : await adminClient.auth.admin.generateLink({ type, email })

  if (error || !data.properties?.hashed_token) {
    return { error: error?.message ?? 'Could not generate a link.' }
  }

  const link = `${SITE_URL}/accept-invite?token_hash=${data.properties.hashed_token}&type=${type}`

  const subject =
    type === 'invite'
      ? "You've been invited to Platinum Painters Timesheets"
      : 'Reset your Platinum Painters Timesheets password'
  const actionText = type === 'invite' ? 'set up your account' : 'reset your password'

  const result = await sendEmail({
    to: email,
    subject,
    text: `Follow this link to ${actionText}: ${link}\n\nIf you didn't expect this email, you can ignore it.`,
    html: `<p>Follow this link to ${actionText}:</p><p><a href="${link}">${actionText[0].toUpperCase()}${actionText.slice(1)}</a></p><p>If you didn't expect this email, you can ignore it.</p>`,
    fromName: FROM_NAME,
  })

  if (!result.sent) return { error: result.reason }
  return { userId: data.user?.id }
}
