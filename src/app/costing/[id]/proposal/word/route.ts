// The proposal as a Word document (.docx) to download and edit: the same
// sections, in the proposal's order, with its photos, specification and
// pricing (as last saved). Staff who can open the costing only.
import { NextRequest, NextResponse } from "next/server";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { createClient } from "@/lib/supabase/server";
import { withTemplateDefaults, type SettingsRow } from "@/lib/quotes/proposalDefaults";
import { resolveSections, type SectionKey } from "@/lib/quotes/proposalSections";
import type { ProposalPricing } from "@/lib/quotes/proposalPricing";

const RED = "E3161C";
const FONT = "Century Gothic";

type Img = { path: string; caption?: string };
type SpecRow = { surface: string; prime: string; coat1: string; coat2: string; coat3: string };

const money = (n: number) => "$" + n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const lines = (t: string | null | undefined) => (t ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

function longDate(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix} ${d.toLocaleDateString("en-NZ", { month: "long", year: "numeric", timeZone: "UTC" })}`;
}

const text = (t: string, opts: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
  new TextRun({ text: t, font: FONT, size: opts.size ?? 21, bold: opts.bold, color: opts.color, italics: opts.italics });

const para = (t: string, opts: { bold?: boolean; size?: number; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number } = {}) =>
  new Paragraph({ children: [text(t, opts)], alignment: opts.align, spacing: { after: opts.after ?? 80 } });

const heading = (t: string) =>
  new Paragraph({ children: [new TextRun({ text: t, font: "Times New Roman", size: 40, bold: true, color: RED })], spacing: { after: 200 } });

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

// Free text as in the proposal: blank lines split paragraphs, a line ending
// in ":" is a heading, "•"/"-" lines are bullets, "1." lines numbered.
function richText(t: string | null | undefined): Paragraph[] {
  const out: Paragraph[] = [];
  const blocks = (t ?? "").split(/\n\s*\n/).map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean));
  for (const block of blocks) {
    for (const l of block) {
      if (/^[•\-–]\s*/.test(l)) {
        out.push(new Paragraph({ children: [text("•  ", { bold: true, color: RED }), text(l.replace(/^[•\-–]\s*/, ""))], indent: { left: 360 }, spacing: { after: 40 } }));
      } else if (l.endsWith(":")) {
        out.push(para(l.slice(0, -1), { bold: true }));
      } else {
        out.push(para(l));
      }
    }
    out.push(new Paragraph({ children: [], spacing: { after: 60 } }));
  }
  return out;
}

// Width and height of a PNG or JPEG, so pictures keep their shape.
function imageInfo(buf: Buffer): { type: "png" | "jpg"; w: number; h: number } | null {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) return { type: "png", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { type: "jpg", h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: proposal }, { data: quote }, { data: settingsRow }] = await Promise.all([
    supabase.from("proposals").select("*").eq("quote_id", id).maybeSingle(),
    supabase.from("quotes").select("location, project, customers:clients(name)").eq("id", id).maybeSingle(),
    supabase.from("proposal_settings").select("*").maybeSingle(),
  ]);
  if (!proposal || !quote) return NextResponse.json({ error: "Save the proposal first." }, { status: 404 });

  const p = proposal as Record<string, unknown> & {
    proposal_date: string;
    pricing: ProposalPricing | null;
    spec_rows: SpecRow[] | null;
  };
  const s = withTemplateDefaults(settingsRow as SettingsRow);
  const origin = request.nextUrl.origin;
  const imageUrl = (path: string) =>
    path.startsWith("/") ? `${origin}${path}` : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/proposal-images/${path}`;

  // Fetch each picture once; anything that isn't a PNG/JPEG is left out.
  const cache = new Map<string, { buf: Buffer; info: NonNullable<ReturnType<typeof imageInfo>> } | null>();
  async function picture(path: string, maxW: number, maxH = 9999): Promise<ImageRun | null> {
    if (!cache.has(path)) {
      try {
        const res = await fetch(imageUrl(path));
        const buf = Buffer.from(await res.arrayBuffer());
        const info = res.ok ? imageInfo(buf) : null;
        cache.set(path, info ? { buf, info } : null);
      } catch {
        cache.set(path, null);
      }
    }
    const got = cache.get(path);
    if (!got) return null;
    const scale = Math.min(maxW / got.info.w, maxH / got.info.h, 1);
    return new ImageRun({ type: got.info.type, data: got.buf, transformation: { width: Math.round(got.info.w * scale), height: Math.round(got.info.h * scale) } });
  }

  const noBorders = {
    top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  };
  // Photos two to a row with captions underneath.
  async function photoGrid(images: Img[]): Promise<(Paragraph | Table)[]> {
    const cells: TableCell[] = [];
    for (const img of images) {
      const pic = await picture(img.path, 300, 225);
      cells.push(
        new TableCell({
          borders: noBorders,
          width: { size: 50, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({ children: pic ? [pic] : [text("(picture)")], alignment: AlignmentType.CENTER }),
            ...(img.caption ? [para(img.caption, { bold: true, size: 18, align: AlignmentType.CENTER })] : []),
          ],
        })
      );
    }
    if (!cells.length) return [];
    const rows: TableRow[] = [];
    for (let i = 0; i < cells.length; i += 2)
      rows.push(new TableRow({ children: [cells[i], cells[i + 1] ?? new TableCell({ borders: noBorders, children: [new Paragraph("")] })] }));
    return [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })];
  }

  const cellBorders = {
    top: { style: BorderStyle.SINGLE, size: 6, color: RED },
    bottom: { style: BorderStyle.SINGLE, size: 6, color: RED },
    left: { style: BorderStyle.SINGLE, size: 6, color: RED },
    right: { style: BorderStyle.SINGLE, size: 6, color: RED },
  };
  const cellOf = (t: string, bold = false, align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT) =>
    new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [text(t, { bold, size: 19 })], alignment: align })] });

  const site = lines(p.site_address as string | null);
  const siteLines = site.length ? site : lines(quote.location);
  const sections = resolveSections(p.sections);
  const body: (Paragraph | Table)[] = [];

  // Cover.
  const logo = await picture("/platinum-painters-logo.png", 420, 200);
  body.push(
    new Paragraph({ children: logo ? [logo] : [text("PLATINUM PAINTERS", { bold: true, size: 48, color: RED })], alignment: AlignmentType.CENTER, spacing: { before: 800, after: 800 } }),
    para(s.cover_title, { bold: true, size: 56, align: AlignmentType.CENTER, after: 400 }),
    ...siteLines.map((l) => para(l.toUpperCase(), { bold: true, size: 36, align: AlignmentType.CENTER })),
    para("www.platinumpainters.co.nz", { align: AlignmentType.CENTER, color: "1F4E8C" })
  );

  const add = async (key: SectionKey) => {
    const start = () => body.push(pageBreak());
    switch (key) {
      case "letter": {
        start();
        if (s.letter_banner) body.push(para(s.letter_banner, { bold: true, size: 44, color: RED, align: AlignmentType.CENTER, after: 300 }));
        for (const l of [p.recipient_name, p.recipient_company, ...lines(p.recipient_address as string | null)] as (string | null)[])
          if (l) body.push(para(l, { bold: true, color: "808080" }));
        // Bigger gaps: address, then the date, then "Dear ..."
        body.push(new Paragraph({ children: [], spacing: { after: 600 } }), para(longDate(p.proposal_date), { after: 720 }));
        const first = (p.recipient_name as string | null)?.split(" ")[0];
        body.push(para((p.salutation as string | null)?.trim() || `Dear ${first ?? "Sir/Madam"},`, { after: 160 }));
        if ((p.subject as string | null)?.trim()) body.push(para((p.subject as string).trim().toUpperCase(), { bold: true, align: AlignmentType.CENTER, after: 160 }));
        body.push(...richText(p.letter as string | null));
        lines(s.signoff).forEach((l, i) => body.push(para(l, { bold: i > 0 })));
        if (s.signature_path) {
          const sig = await picture(s.signature_path, 200, 70);
          if (sig) body.push(new Paragraph({ children: [sig] }));
        }
        lines(s.signer).forEach((l, i) => body.push(para(l, { bold: i === 0 })));
        break;
      }
      case "completed_projects": {
        if (!s.completed_projects.length) return;
        start();
        body.push(heading("Completed Projects"), ...(await photoGrid(s.completed_projects)), ...(s.about_text ? richText(s.about_text) : []));
        break;
      }
      case "reference_photos": {
        const refs = (p.reference_photos as Img[] | null) ?? [];
        if (!refs.length) return;
        start();
        body.push(heading("Reference Photos"), ...(await photoGrid(refs)));
        break;
      }
      case "current_condition": {
        const photos = (p.condition_photos as Img[] | null) ?? [];
        if (!photos.length) return;
        start();
        body.push(heading("Current Condition"), ...(await photoGrid(photos)));
        break;
      }
      case "site_plan": {
        const plans = (p.site_plan as Img[] | null) ?? [];
        if (!plans.length && !p.site_plan_notes) return;
        start();
        body.push(heading("Site Plan"));
        for (const img of plans) {
          const pic = await picture(img.path, 600, 700);
          if (pic) body.push(new Paragraph({ children: [pic] }));
          if (img.caption) body.push(para(img.caption, { size: 18 }));
        }
        body.push(...richText(p.site_plan_notes as string | null));
        break;
      }
      case "equipment": {
        if (!s.equipment_photos.length) return;
        body.push(new Paragraph({ children: [], spacing: { after: 200 } }), heading(s.equipment_title), ...(await photoGrid(s.equipment_photos)));
        if (s.equipment_caption) body.push(para(s.equipment_caption, { bold: true, align: AlignmentType.CENTER }));
        break;
      }
      case "extent": {
        const inc = lines(p.extent_includes as string | null);
        const exc = lines(p.extent_excludes as string | null);
        if (!inc.length && !exc.length) return;
        start();
        body.push(heading("Extent of Work"));
        if (inc.length) body.push(para("Surfaces", { bold: true, color: RED }), ...richText(inc.map((l) => `• ${l}`).join("\n")));
        if (exc.length) body.push(para("Exclusions", { bold: true, color: RED }), ...richText(exc.map((l) => `• ${l}`).join("\n")));
        break;
      }
      case "methodology": {
        if (!s.methodology) return;
        start();
        body.push(heading("Methodology"), ...richText(s.methodology));
        break;
      }
      case "specification": {
        const spec = (p.spec_rows ?? []).filter((r) => r.surface?.trim());
        if (!spec.length && !p.spec_intro) return;
        start();
        body.push(heading("Specification"), ...richText(p.spec_intro as string | null));
        if (spec.length) {
          const coat3 = spec.some((r) => r.coat3?.trim());
          const head = ["", "Spot prime", "1st coat", "2nd coat", ...(coat3 ? ["3rd coat"] : [])];
          body.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({ children: head.map((h) => cellOf(h.toUpperCase(), true, AlignmentType.CENTER)) }),
                ...spec.map(
                  (r) =>
                    new TableRow({
                      children: [cellOf(r.surface, true), ...[r.prime, r.coat1, r.coat2, ...(coat3 ? [r.coat3] : [])].map((v) => cellOf(v ?? "", false, AlignmentType.CENTER))],
                    })
                ),
              ],
            })
          );
        }
        break;
      }
      case "pricing": {
        const pricing = p.pricing;
        start();
        body.push(heading("Pricing"), para("To complete the work in accordance with the specification and scope of work, the costs are listed below:", { after: 200 }));
        if (pricing) {
          body.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                ...pricing.items.map((i) => new TableRow({ children: [cellOf(i.label), cellOf(money(i.price), false, AlignmentType.RIGHT)] })),
                new TableRow({
                  children: [
                    new TableCell({ borders: cellBorders, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F2F2F2" }, children: [para("Total (excluding GST)", { bold: true })] }),
                    new TableCell({ borders: cellBorders, shading: { type: ShadingType.CLEAR, color: "auto", fill: "F2F2F2" }, children: [para(money(pricing.total), { bold: true, align: AlignmentType.RIGHT })] }),
                  ],
                }),
              ],
            })
          );
          if (pricing.options.length) {
            body.push(para("Options", { bold: true, color: RED }));
            body.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: pricing.options.map((o) => new TableRow({ children: [cellOf(o.group ? `${o.group}: ${o.label}` : o.label), cellOf(money(o.price), false, AlignmentType.RIGHT)] })),
              })
            );
          }
        }
        break;
      }
      case "why": {
        if (!s.why_text?.trim()) return;
        body.push(new Paragraph({ children: [], spacing: { after: 200 } }), heading("Why Platinum Painters"), ...richText(s.why_text));
        break;
      }
      case "terms": {
        if (!s.terms) return;
        start();
        body.push(heading("Terms and Conditions"), ...richText(s.terms));
        break;
      }
      case "back_pages": {
        for (const img of s.back_pages ?? []) {
          const pic = await picture(img.path, 560, 800);
          if (!pic) continue;
          start();
          body.push(new Paragraph({ children: [pic], alignment: AlignmentType.CENTER }));
        }
        break;
      }
    }
  };
  for (const { key, on } of sections) if (on && key !== "back_pages") await add(key);

  // Acceptance, then the back pages.
  body.push(
    pageBreak(),
    heading("Acceptance"),
    para("I accept this proposal, including the terms and conditions.", { after: 400 }),
    para("Name: ______________________________________", { after: 400 }),
    para("Signature: __________________________________", { after: 400 }),
    para("Date: ______________________________________")
  );
  if (sections.some((c) => c.key === "back_pages" && c.on)) await add("back_pages");

  const doc = new Document({
    creator: "Platinum Painters",
    title: `Painting proposal - ${quote.location ?? ""}`,
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
        footers: { default: new Footer({ children: [para(s.header_line, { bold: true, size: 16, color: RED, align: AlignmentType.CENTER })] }) },
        children: body,
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  const name = `Proposal - ${(quote.location || quote.project || "painting").replace(/[^\w\s.-]+/g, "").trim()}.docx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
