// The customer-facing proposal, laid out like Platinum Painters' own PDF
// proposals (3 Wallingford Street): a cover with the accreditation logos,
// the "PAINTING QUOTATION" letter, completed projects, extent of work,
// specification, site plan and equipment, methodology, pricing, terms and
// the certificate at the back. Every page has the logo top right and the
// red footer band, and prints as its own A4 page. Used for the customer's
// link and the staff preview.
import Image from "next/image";
import type { ProposalPricing } from "@/lib/quotes/proposalPricing";
import type { SalesContact } from "@/lib/quotes/hubContact";
import { ACCREDITATION_LOGOS, type ProposalTemplates } from "@/lib/quotes/proposalDefaults";
import { resolveSections, type SectionChoice, type SectionKey } from "@/lib/quotes/proposalSections";

export type ProposalImage = { path: string; caption?: string };
export type SpecRow = { surface: string; prime: string; coat1: string; coat2: string; coat3: string };

export type ProposalData = {
  proposal: {
    proposal_date: string;
    recipient_name: string | null;
    recipient_company: string | null;
    recipient_address: string | null;
    salutation: string | null;
    subject?: string | null;
    site_address: string | null;
    letter: string | null;
    extent_includes: string | null;
    extent_excludes: string | null;
    spec_intro: string | null;
    spec_rows: SpecRow[];
    site_plan: ProposalImage[];
    site_plan_notes: string | null;
    condition_photos?: ProposalImage[];
    sections?: SectionChoice[] | null;
    pricing: ProposalPricing;
  };
  settings: ProposalTemplates;
  quote: { location: string | null; valid_until: string | null };
  customer: { name: string | null };
  // The quote's salesperson, from their Profile in the Hub (not shown at
  // the moment - see the proposal link page).
  contact?: SalesContact | null;
};

// The red of Platinum Painters' proposals.
const RED = "#E3161C";
const BODY_FONT = { fontFamily: '"Century Gothic", "Questrial", "Avenir Next", "Segoe UI", sans-serif' };
const HEADING_FONT = { fontFamily: '"Times New Roman", Times, Georgia, serif' };

export function proposalImageUrl(path: string) {
  // Pictures that come with the app (the standard ones) start with "/".
  if (path.startsWith("/")) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/proposal-images/${path}`;
}

export const money = (n: number) =>
  "$" + n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "18th September 2026", with the "th" raised like the PDF.
function LongDate({ date }: { date: string }) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return (
    <>
      {day}
      <sup>{suffix}</sup> {d.toLocaleDateString("en-NZ", { month: "long", year: "numeric", timeZone: "UTC" })}
    </>
  );
}

const lines = (text: string | null | undefined) =>
  (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

// Free text as paragraphs: blank lines split paragraphs, a line ending in
// ":" is a heading, lines starting "•" or "-" are bullet points.
export function RichText({ text }: { text: string | null | undefined }) {
  const blocks = (text ?? "").split(/\n\s*\n/).map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean));
  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const bullets = block.every((l) => /^[•\-–]\s*/.test(l));
        if (bullets) {
          return <RedBullets key={i} items={block} />;
        }
        if (block.every((l) => /^\d+[.)]\s*/.test(l))) {
          return (
            <ol key={i} className="list-decimal space-y-1.5 pl-8">
              {block.map((l, j) => (
                <li key={j}>{l.replace(/^\d+[.)]\s*/, "")}</li>
              ))}
            </ol>
          );
        }
        return (
          <div key={i}>
            {block.map((l, j) =>
              l.endsWith(":") ? (
                <p key={j} className="font-bold text-black">
                  {l.slice(0, -1)}
                </p>
              ) : (
                <p key={j}>{l}</p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

function RedBullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-0.5">
      {items.map((l, j) => (
        <li key={j} className="flex gap-2">
          <span aria-hidden className="font-bold" style={{ color: RED }}>
            •
          </span>
          <span>{l.replace(/^[•\-–]\s*/, "")}</span>
        </li>
      ))}
    </ul>
  );
}

// The red footer band: "Platinum Painters NZ   www…   phone" spread across.
function Footer({ line }: { line: string }) {
  const parts = line.split(/\s{2,}|\s*\|\s*/).filter(Boolean);
  return (
    <div className="mt-auto flex items-center justify-between gap-2 px-[12mm] py-2 text-[11px] font-bold text-white" style={{ background: RED }}>
      {parts.map((p) => (
        <span key={p}>{p}</span>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[22px] font-bold" style={{ ...HEADING_FONT, color: RED }}>
      {children}
    </h2>
  );
}

// One A4 page: logo top right, the content, the red footer band.
function Page({
  footer,
  title,
  children,
  banner,
}: {
  footer: string;
  title?: string;
  children: React.ReactNode;
  banner?: string;
}) {
  return (
    <section className="mx-auto mb-6 flex min-h-[297mm] w-full max-w-[210mm] flex-col bg-white shadow-sm print:mb-0 print:max-w-none print:break-before-page print:shadow-none">
      <div className="flex justify-end px-[12mm] pt-[8mm]">
        <Image src="/measures-logo.webp" alt="Platinum Painters" width={160} height={64} className="h-auto w-32" />
      </div>
      {banner && (
        <div className="mt-4 py-3 text-center text-[30px] font-bold tracking-wide text-white" style={{ background: RED }}>
          {banner}
        </div>
      )}
      <div className="flex-1 px-[12mm] pb-[10mm] pt-5 text-[13.5px] leading-relaxed text-black">
        {title && <SectionTitle>{title}</SectionTitle>}
        {children}
      </div>
      <Footer line={footer} />
    </section>
  );
}

// A photo in a red frame, with an optional red caption bar under it.
function FramedPhoto({ src, caption, alt }: { src: string; caption?: string; alt?: string }) {
  return (
    <figure className="border-[3px]" style={{ borderColor: RED }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt ?? caption ?? ""} className="aspect-[4/3] w-full object-cover" />
      {caption && (
        <figcaption className="px-2 py-1 text-center text-[11px] font-bold text-white" style={{ background: RED }}>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function Logos({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-6 ${className}`}>
      <Image src={ACCREDITATION_LOGOS[0].src} alt={ACCREDITATION_LOGOS[0].alt} width={ACCREDITATION_LOGOS[0].width} height={ACCREDITATION_LOGOS[0].height} className="h-auto w-36" />
      <Image src={ACCREDITATION_LOGOS[1].src} alt={ACCREDITATION_LOGOS[1].alt} width={ACCREDITATION_LOGOS[1].width} height={ACCREDITATION_LOGOS[1].height} className="h-auto w-48" />
    </div>
  );
}

// "Surfaces" / "Exclusions": the red label box on the left, the list on the right.
function LabelledList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mb-4 grid grid-cols-[9.5rem_1fr] gap-4">
      <p className="self-start px-2 py-0.5 text-[13px] font-bold text-white" style={{ background: RED }}>
        {label}
      </p>
      <RedBullets items={items} />
    </div>
  );
}

const cell = "border px-2 py-1.5";

export function PricingTables({ pricing }: { pricing: ProposalPricing }) {
  const groups = [...new Set(pricing.options.map((o) => o.group))];
  const gst = <p className="mt-1 text-right text-[10px] text-black">GST will be added all pricing in this proposal.</p>;
  const head = (label: string) => (
    <thead>
      <tr className="text-left text-white" style={{ background: RED }}>
        <th className={`${cell} font-bold`} style={{ borderColor: RED }}>
          {label}
        </th>
        <th className={`${cell} w-36 text-center font-bold`} style={{ borderColor: RED }}>
          Price + GST
        </th>
      </tr>
    </thead>
  );
  return (
    <div className="space-y-6">
      <div>
        <table className="w-full border-collapse text-[13px]">
          {head("Surfaces")}
          <tbody>
            {pricing.items.map((l) => (
              <tr key={l.key}>
                <td className={cell} style={{ borderColor: RED }}>
                  {l.label}
                </td>
                <td className={`${cell} text-center`} style={{ borderColor: RED }}>
                  {money(l.price)}
                </td>
              </tr>
            ))}
            {pricing.items.length > 1 && (
              <tr>
                <td className={`${cell} font-bold`} style={{ borderColor: RED }}>
                  Total
                </td>
                <td className={`${cell} text-center font-bold`} style={{ borderColor: RED }}>
                  {money(pricing.total)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {gst}
      </div>
      {groups.map((g) => {
        const opts = pricing.options.filter((o) => o.group === g);
        return (
          <div key={g || "options"}>
            <table className="w-full border-collapse text-[13px]">
              {head(g || "Options")}
              <tbody>
                {opts.map((o, i) => (
                  <tr key={o.key}>
                    <td className={cell} style={{ borderColor: RED }}>
                      {opts.length > 1 && `Option ${i + 1} - `}
                      {o.label}
                    </td>
                    <td className={`${cell} text-center`} style={{ borderColor: RED }}>
                      {money(o.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {gst}
          </div>
        );
      })}
    </div>
  );
}

export function ProposalDocument({
  data,
  acceptance,
}: {
  data: ProposalData;
  // The customer's options / sign / accept section (interactive), or the
  // record of acceptance - shown on the last page.
  acceptance?: React.ReactNode;
}) {
  const { proposal: p, settings: s } = data;
  const footer = s.header_line;
  const site = lines(p.site_address);
  const siteLines = site.length ? site : lines(data.quote.location);
  const includes = lines(p.extent_includes);
  const excludes = lines(p.extent_excludes);
  const spec = (p.spec_rows ?? []).filter((r) => r.surface?.trim());
  const hasCoat3 = spec.some((r) => r.coat3?.trim());
  const projects = s.completed_projects ?? [];
  const plans = p.site_plan ?? [];
  // Six condition photos to a page, like the printed quotes.
  const condition = p.condition_photos ?? [];
  const conditionPages = Array.from({ length: Math.ceil(condition.length / 6) }, (_, i) => condition.slice(i * 6, i * 6 + 6));
  const equipment = s.equipment_photos ?? [];
  const signer = lines(s.signer);
  const sections = resolveSections(p.sections);

  // Each section's page(s); empty when there's nothing to show.
  type PageSpec = { title?: string; banner?: string; body: React.ReactNode };
  const equipmentBody = equipment.length > 0 && (
    <div className="border-[3px]" style={{ borderColor: RED }}>
      <div className="grid grid-cols-2 gap-1 p-1">
        {equipment.map((img) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={img.path} src={proposalImageUrl(img.path)} alt="" className="aspect-[4/3] w-full object-cover" />
        ))}
      </div>
      {s.equipment_caption && (
        <p className="px-2 py-1 text-center text-[11px] font-bold text-white" style={{ background: RED }}>
          {s.equipment_caption}
        </p>
      )}
    </div>
  );
  const pricingBody = (
    <>
      <p className="mb-4">To complete the work in accordance with the specification and scope of work, the costs are listed below:</p>
      <PricingTables pricing={p.pricing} />
    </>
  );
  const blocks: Record<SectionKey, PageSpec[]> = {
    letter: [{ banner: s.letter_banner || undefined, body: (<>
        <div className="mb-5 grid grid-cols-[1fr_13rem] gap-4">
          <div className="font-bold italic text-[#9A9A9A]">
            {p.recipient_name && <p>{p.recipient_name}</p>}
            {p.recipient_company && <p>{p.recipient_company}</p>}
            {lines(p.recipient_address).map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
          {s.company_block && (
            <div className="self-start bg-[#E6E6E6] px-3 py-2 text-right text-[10.5px] leading-snug text-black">
              {lines(s.company_block).map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          )}
        </div>
        <p className="mb-5">
          <LongDate date={p.proposal_date} />
        </p>
        <p className="mb-3">{p.salutation?.trim() || `Dear ${p.recipient_name?.split(" ")[0] ?? "Sir/Madam"},`}</p>
        {p.subject?.trim() && <p className="mb-3 text-center font-bold uppercase">{p.subject.trim()}</p>}
        <RichText text={p.letter} />
        <div className="mt-8">
          {lines(s.signoff).map((l, i) => (
            <p key={i} className={i === 0 ? "" : "font-bold"}>
              {l}
            </p>
          ))}
          {s.signature_path && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proposalImageUrl(s.signature_path)} alt="Signature" className="my-2 h-14 w-auto" />
          )}
          {signer.map((l, i) => (
            <p key={i} className={i === 0 ? "font-bold" : ""}>
              {l}
            </p>
          ))}
        </div>
</>) }],
    completed_projects: projects.length > 0 ? [{ title: "Completed Projects", body: (<>
          <div className="grid grid-cols-2 gap-1 border-[3px] p-1" style={{ borderColor: RED }}>
            {projects.map((img) => (
              <FramedPhoto key={img.path} src={proposalImageUrl(img.path)} caption={img.caption} />
            ))}
          </div>
          {s.about_text && (
            <div className="mt-6">
              <RichText text={s.about_text} />
            </div>
          )}
</>) }] : [],
    current_condition: conditionPages.map((page) => ({
      title: "Current Condition",
      body: (
        <div className="grid grid-cols-2 gap-1 border-[3px] p-1" style={{ borderColor: RED }}>
          {page.map((img) => (
            <FramedPhoto key={img.path} src={proposalImageUrl(img.path)} caption={img.caption} />
          ))}
        </div>
      ),
    })),
    site_plan: plans.length > 0 || p.site_plan_notes ? [{ title: "Site Plan", body: (<>
          <div className="space-y-3">
            {plans.map((img) => (
              <figure key={img.path} className="border-[3px]" style={{ borderColor: RED }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={proposalImageUrl(img.path)} alt={img.caption ?? "Site plan"} className="w-full" />
                {img.caption && <figcaption className="px-2 py-1 text-[12px]">{img.caption}</figcaption>}
              </figure>
            ))}
            {p.site_plan_notes && <RichText text={p.site_plan_notes} />}
          </div>
</>) }] : [],
    equipment: equipmentBody ? [{ title: s.equipment_title, body: equipmentBody }] : [],
    extent: includes.length > 0 || excludes.length > 0 ? [{ title: "Extent of Work", body: (<>
          {includes.length > 0 && <LabelledList label="Surfaces" items={includes} />}
          {excludes.length > 0 && <LabelledList label="Exclusions" items={excludes} />}
</>) }] : [],
    methodology: s.methodology ? [{ title: "Methodology", body: (<>
          <div className="text-[13px]">
            <RichText text={s.methodology} />
          </div>
</>) }] : [],
    specification: spec.length > 0 || p.spec_intro ? [{ title: "Specification", body: (<>
          {p.spec_intro && (
            <div className="mb-5">
              <RichText text={p.spec_intro} />
            </div>
          )}
          {spec.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className={cell} style={{ borderColor: RED }} />
                    {["Spot prime", "1st coat", "2nd coat", ...(hasCoat3 ? ["3rd coat"] : [])].map((h) => (
                      <th key={h} className={`${cell} text-center font-bold uppercase`} style={{ borderColor: RED }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spec.map((r, i) => (
                    <tr key={i}>
                      <td className={`${cell} font-bold`} style={{ borderColor: RED }}>
                        {r.surface}
                      </td>
                      {[r.prime, r.coat1, r.coat2, ...(hasCoat3 ? [r.coat3] : [])].map((v, j) => (
                        <td key={j} className={`${cell} text-center`} style={{ borderColor: RED }}>
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
</>) }] : [],
    pricing: [{ title: "Pricing", body: pricingBody }],
    why: s.why_text?.trim() ? [{ title: "Why Platinum Painters", body: <RichText text={s.why_text} /> }] : [],
    terms: s.terms ? [{ title: "Terms and Conditions:", body: (<>
          <div className="text-[12.5px]">
            <RichText text={s.terms} />
          </div>
          <Logos className="mt-10" />
</>) }] : [],
    back_pages: [],
  };
  // Equipment straight after the site plan, and Why Platinum Painters
  // straight after the pricing, share that page (as in the printed quotes).
  const SHARES_PAGE_WITH: Partial<Record<SectionKey, SectionKey>> = { equipment: "site_plan", why: "pricing" };
  const pages: PageSpec[] = [];
  let prev: SectionKey | null = null;
  for (const { key, on } of sections) {
    if (!on || !blocks[key].length) continue;
    const last = pages[pages.length - 1];
    if (last && prev && SHARES_PAGE_WITH[key] === prev) {
      const [b] = blocks[key];
      pages[pages.length - 1] = {
        ...last,
        body: (
          <>
            {last.body}
            <div className="mt-10 break-inside-avoid">
              <SectionTitle>{b.title}</SectionTitle>
              {b.body}
            </div>
          </>
        ),
      };
    } else {
      pages.push(...blocks[key]);
    }
    prev = key;
  }
  const backPages = sections.some((c) => c.key === "back_pages" && c.on) ? (s.back_pages ?? []) : [];

  return (
    <div className="bg-background py-6 print:bg-white print:py-0 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]" style={BODY_FONT}>
      {/* Full-bleed A4 pages when printed / saved as PDF. */}
      <style>{"@page { size: A4; margin: 0; }"}</style>

      {/* Cover */}
      <section className="mx-auto mb-6 flex min-h-[297mm] w-full max-w-[210mm] flex-col items-center bg-white px-[12mm] pb-[12mm] pt-[30mm] text-center shadow-sm print:mb-0 print:max-w-none print:shadow-none">
        <Image src="/measures-logo.webp" alt="Platinum Painters" width={420} height={168} priority className="h-auto w-[70%]" />
        <h1 className="mt-[25mm] text-[32px] font-bold tracking-wide text-black">{s.cover_title}</h1>
        <div className="mt-8 space-y-2 text-[19px] font-bold uppercase tracking-wide text-black">
          {siteLines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
        <div className="mt-auto flex w-full items-end justify-between gap-4">
          <Image src={ACCREDITATION_LOGOS[0].src} alt={ACCREDITATION_LOGOS[0].alt} width={ACCREDITATION_LOGOS[0].width} height={ACCREDITATION_LOGOS[0].height} className="h-auto w-28" />
          <a href="https://www.platinumpainters.co.nz" className="pb-1 text-[12px] text-[#1F4E8C] underline">
            www.platinumpainters.co.nz
          </a>
          <Image src={ACCREDITATION_LOGOS[1].src} alt={ACCREDITATION_LOGOS[1].alt} width={ACCREDITATION_LOGOS[1].width} height={ACCREDITATION_LOGOS[1].height} className="h-auto w-40" />
        </div>
      </section>

      {/* The sections this proposal includes, in its order. */}
      {pages.map((pg, i) => (
        <Page key={i} footer={footer} title={pg.title} banner={pg.banner}>
          {pg.body}
        </Page>
      ))}

      {acceptance && (
        <Page footer={footer} title="Acceptance">
          {acceptance}
        </Page>
      )}

      {backPages.map((img) => (
        <Page key={img.path} footer={footer}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proposalImageUrl(img.path)} alt={img.caption ?? ""} className="mx-auto w-[85%]" />
        </Page>
      ))}
    </div>
  );
}

// "Your contact": the salesperson's photo, name, title, phone, email, bio
// and signature. Turned off for now (see the proposal link page); kept for
// switching back on.
export function ContactCard({ contact: c }: { contact: SalesContact }) {
  const initials = c.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div className="mt-8 break-inside-avoid rounded-lg border border-border p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your contact</p>
      <div className="mt-3 flex items-center gap-4">
        {c.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-red text-lg font-bold text-white">{initials}</span>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-ink">{c.name}</p>
          {c.title && <p className="text-sm text-muted">{c.title}</p>}
          {c.phone && <p className="text-sm">{c.phone}</p>}
          {c.email && <p className="text-sm">{c.email}</p>}
        </div>
      </div>
      {c.bio && <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{c.bio}</p>}
      {c.signatureUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.signatureUrl} alt={`${c.name}'s signature`} className="mt-3 h-14 w-auto" />
      )}
    </div>
  );
}
