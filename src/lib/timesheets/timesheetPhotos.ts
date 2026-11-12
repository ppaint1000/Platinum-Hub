// Staff timesheet photos from the office Gmail, for a pay week: every email
// a staff member sent with an attachment (their timesheet photo or PDF),
// zipped as a "Week ending DD-MM-YYYY" folder with each file named
// "<person> - Week ending DD-MM-YYYY.<ext>". Reads Gmail over IMAP with the same
// app password the Hub sends email with (GMAIL_USER / GMAIL_APP_PASSWORD).
// Server-side only.
import "server-only";
import { ImapFlow, type MessageStructureObject } from "imapflow";
import JSZip from "jszip";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, nzTodayDateString } from "@/lib/timesheets/formatNZ";

// "08-11-2026" for 2026-11-08.
export const weekEndingLabel = (sunday: string) => `${sunday.slice(8, 10)}-${sunday.slice(5, 7)}-${sunday.slice(0, 4)}`;

// The Sunday that ended the last full week (Mon-Sun) before today, and the
// ones before it.
export function recentWeekEndings(count = 6, today = nzTodayDateString()): string[] {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const last = addDays(today, -(dow === 0 ? 7 : dow));
  return Array.from({ length: count }, (_, i) => addDays(last, -7 * i));
}

type Attachment = { person: string; filename: string; content: Buffer };
export type PhotosResult = { zip: Buffer; folder: string; files: string[]; people: string[] };

const gmailDate = (day: string) => day.replaceAll("-", "/");
const TIMESHEET_SUBJECT = /time\s*-?\s*sheet/i;

function attachmentParts(node: MessageStructureObject | undefined, out: MessageStructureObject[] = []) {
  if (!node) return out;
  if (node.childNodes?.length) {
    for (const child of node.childNodes) attachmentParts(child, out);
    return out;
  }
  const filename = node.dispositionParameters?.filename ?? node.parameters?.name;
  const disposition = (node.disposition ?? "").toLowerCase();
  // Real attachments, and phone photos sent inline - not tiny signature logos.
  if (node.part && filename && (disposition === "attachment" || (node.size ?? 0) > 30_000)) out.push(node);
  return out;
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\r\n]+/g, "_").trim();

export async function collectTimesheetPhotos(weekEnding: string): Promise<PhotosResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("Email isn't set up on the Hub (GMAIL_USER / GMAIL_APP_PASSWORD).");

  // Staff send their week from the Saturday it ends on through the next
  // Friday or so - search that window.
  const from = addDays(weekEnding, -1);
  const to = addDays(weekEnding, 6);

  // Staff by their Hub login email, so we can name the files after them.
  const { data: staff } = await createAdminClient()
    .from("profiles")
    .select("full_name, email")
    .is("deleted_at", null)
    .returns<{ full_name: string; email: string | null }[]>();
  const staffByEmail = new Map(
    (staff ?? []).filter((p) => p.email).map((p) => [p.email!.trim().toLowerCase(), p.full_name.replace(/\s+/g, " ").trim()]),
  );

  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();
  const found: Attachment[] = [];
  try {
    const lock = await client.getMailboxLock("[Gmail]/All Mail");
    try {
      const uids = await client.search(
        { gmraw: `has:attachment after:${gmailDate(from)} before:${gmailDate(to)} -from:me -in:spam -in:trash` },
        { uid: true },
      );
      if (uids && uids.length) {
        const messages = await client.fetchAll(uids, { envelope: true, bodyStructure: true, uid: true }, { uid: true });
        for (const msg of messages) {
          const sender = msg.envelope?.from?.[0];
          const address = sender?.address?.trim().toLowerCase() ?? "";
          if (!address || address === user.toLowerCase()) continue;
          const staffName = staffByEmail.get(address);
          if (!staffName && !TIMESHEET_SUBJECT.test(msg.envelope?.subject ?? "")) continue;
          const person = safeName(staffName ?? sender?.name ?? address.split("@")[0]);
          for (const part of attachmentParts(msg.bodyStructure)) {
            const dl = await client.download(String(msg.uid), part.part!, { uid: true });
            if (!("content" in dl) || !dl.content) continue;
            const chunks: Buffer[] = [];
            for await (const chunk of dl.content) chunks.push(Buffer.from(chunk));
            const filename = safeName(part.dispositionParameters?.filename ?? part.parameters?.name ?? "attachment");
            found.push({ person, filename, content: Buffer.concat(chunks) });
          }
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  const folder = `Week ending ${weekEndingLabel(weekEnding)}`;
  const zip = new JSZip();
  const dir = zip.folder(folder)!;
  const used = new Set<string>();
  const files: string[] = [];
  // "Amir Sadeghi - Week ending 08-11-2026.jpg"; a second file from the
  // same person gets " (2)", and so on.
  for (const a of found.sort((x, y) => x.person.localeCompare(y.person))) {
    const dot = a.filename.lastIndexOf(".");
    const ext = dot > 0 ? a.filename.slice(dot).toLowerCase() : "";
    const stem = `${a.person} - ${folder}`;
    let name = `${stem}${ext}`;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${stem} (${k})${ext}`;
    used.add(name.toLowerCase());
    dir.file(name, a.content);
    files.push(name);
  }
  return {
    zip: await zip.generateAsync({ type: "nodebuffer", compression: "STORE" }),
    folder,
    files,
    people: [...new Set(found.map((a) => a.person))],
  };
}
