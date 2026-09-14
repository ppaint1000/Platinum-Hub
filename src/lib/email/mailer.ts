import nodemailer from "nodemailer";

export type SendEmailOptions = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer }[];
  /** Overrides the "from" display name for this send — defaults to the Orders app's name. */
  fromName?: string;
};

export type SendEmailResult = { sent: true } | { sent: false; reason: string };

const DEFAULT_FROM_NAME = "Platinum Painters Order";

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    return { sent: false, reason: "GMAIL_USER / GMAIL_APP_PASSWORD is not configured." };
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: `${options.fromName ?? DEFAULT_FROM_NAME} <${user}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Failed to send email." };
  }
}
