// Marketing emails to body corporate / building managers: fills in the
// placeholders for one contact, shows the buildings we've painted for their
// company (or our featured ones if we haven't worked with them yet), and adds
// the sender details and unsubscribe link every marketing email must carry
// (Unsolicited Electronic Messages Act 2007).
import { SITE_URL } from "@/lib/timesheets/siteUrl";

export const MARKETING_PLACEHOLDERS = [
  ["{first_name}", "Their first name"],
  ["{company}", "Their company"],
  ["{our_buildings}", "Buildings we've painted for their company, with photos"],
] as const;

export const DEFAULT_SUBJECT = "Body corporate painting - Platinum Painters";
export const DEFAULT_BODY = `Hi {first_name},

I'm getting in touch from Platinum Painters, an Auckland painting company specialising in body corporate, commercial and residential repaints.

{our_buildings}

We prepare detailed proposals to Resene specifications, work around residents, and keep committees updated from start to finish.

If you have any buildings coming up for maintenance or a repaint, we'd be glad to measure up and provide a proposal at no cost.

Kind regards,
Platinum Painters`;

const PHONE = "021 116 4005";
const SENDER_LINE = "Platinum Painters NZ Ltd · 21 Poland Road, Wairau Valley, Auckland · " + PHONE;

export type MailBuilding = { name: string; address: string | null; year_painted: number | null; description: string | null; photos: { url: string }[] };
export type MailContact = { name: string; email: string; unsubscribe_token: string; company: string | null };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

function buildingLine(b: MailBuilding) {
  return [b.name, b.address && b.address !== b.name ? b.address : null, b.year_painted ? `painted ${b.year_painted}` : null].filter(Boolean).join(" - ");
}

export function renderMarketingEmail(
  subject: string,
  body: string,
  contact: MailContact,
  buildings: MailBuilding[],
  ownCompanyWork: boolean,
): { subject: string; text: string; html: string } {
  const unsub = `${SITE_URL}/mu/${contact.unsubscribe_token}`;
  const fill = (s: string) => s.replace(/\{first_name\}/g, firstName(contact.name)).replace(/\{company\}/g, contact.company ?? "your company");
  const intro = !buildings.length
    ? ""
    : ownCompanyWork
      ? `Some of the buildings we've painted that ${contact.company ?? "your company"} manages:`
      : "Some of the body corporate buildings we've painted recently:";

  // Plain text
  const textBuildings = buildings.length ? `${intro}\n${buildings.map((b) => `• ${buildingLine(b)}`).join("\n")}` : "";
  const text =
    fill(body).replace(/\{our_buildings\}/g, textBuildings).replace(/\n{3,}/g, "\n\n").trim() +
    `\n\n--\n${SENDER_LINE}\nDon't want these emails? Unsubscribe: ${unsub}\n`;

  // HTML
  const cards = buildings
    .map((b) => {
      const photo = b.photos[0]?.url;
      return `<tr><td style="padding:0 0 16px 0">
${photo ? `<img src="${esc(photo)}" alt="${esc(b.name)}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border-radius:8px;border:0" />` : ""}
<div style="font-weight:bold;margin-top:6px">${esc(b.name)}</div>
<div style="color:#5B6472;font-size:13px">${esc([b.address && b.address !== b.name ? b.address : null, b.year_painted ? `Painted ${b.year_painted}` : null].filter(Boolean).join(" · "))}</div>
${b.description ? `<div style="font-size:13px;margin-top:2px">${esc(b.description)}</div>` : ""}
</td></tr>`;
    })
    .join("");
  const htmlBuildings = buildings.length ? `<p style="margin:0 0 10px 0">${esc(intro)}</p><table role="presentation" cellpadding="0" cellspacing="0" width="100%">${cards}</table>` : "";
  const paragraphs = fill(body)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p === "{our_buildings}" ? htmlBuildings : `<p style="margin:0 0 14px 0">${esc(p).replace(/\{our_buildings\}/g, "").replace(/\n/g, "<br>")}</p>`))
    .join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#16202E;max-width:560px">${paragraphs}
<hr style="border:0;border-top:1px solid #E3E1DA;margin:20px 0 10px 0">
<p style="font-size:12px;color:#5B6472;margin:0">${esc(SENDER_LINE)}<br>Don't want these emails? <a href="${esc(unsub)}" style="color:#5B6472">Unsubscribe</a></p></div>`;

  return { subject: fill(subject), text, html };
}
