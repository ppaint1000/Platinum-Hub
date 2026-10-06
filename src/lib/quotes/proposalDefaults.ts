// Starting wording for proposals, taken from Platinum Painters' own
// proposal (3 Wallingford Street). Used until the company templates are
// saved under Costing → Proposal templates, and to pre-fill a new proposal.
// Blank lines separate paragraphs; a line ending in ":" is a heading.

export const DEFAULT_HEADER_LINE = "Platinum Painters NZ   www.platinumpainters.co.nz   021 116 4005";

export const DEFAULT_LETTER_INTRO =
  "Thank you for the opportunity to submit our quotation for the painting of the above property.\n\n" +
  "Included in all pricing is paint, materials, labour and scaffold required to carry out your washing and painting within the New Zealand safety standards.\n\n" +
  "Platinum Painters are an approved Resene Eco Decorator and are audited on our workmanship, safety and waste management systems.";

// The letter ends: sign-off, signature, then who signed it. The company
// address sits in the grey box at the top of the letter.
export const DEFAULT_SIGNOFF = "Yours sincerely,\nPlatinum Painters NZ Ltd";
export const DEFAULT_SIGNER = "Nigel Richmond\nDirector";
export const DEFAULT_SIGNATURE = "/proposal/signature.png";
export const DEFAULT_LETTER_BANNER = "PAINTING QUOTATION";
export const DEFAULT_COMPANY_BLOCK = "PO Box 35218\nBrowns Bay\nNORTH SHORE CITY\nMOBILE 021 1164 005";

// Pictures from Platinum Painters' printed proposals (public/proposal), used
// until the templates have their own. Paths starting "/" are files in the
// app; anything else is in the proposal-images store.
export const DEFAULT_COMPLETED_PROJECTS = [
  { path: "/proposal/project-1.jpg", caption: "Tamaki Drive – Exterior repaint" },
  { path: "/proposal/project-2.jpg", caption: "Body corporate complex – Exterior repaint" },
  { path: "/proposal/project-3.jpg", caption: "Settlers Retirement Village – Exterior repaint" },
  { path: "/proposal/project-4.jpg", caption: "Body Corporate Apartments – Exterior repaint" },
  { path: "/proposal/project-5.jpg", caption: "Body Corporate Apartments – Exterior repaint" },
  { path: "/proposal/project-6.jpg", caption: "Body Corporate Apartments – Exterior repaint" },
];
export const DEFAULT_EQUIPMENT_TITLE = "Platinum Painters owned equipment";
export const DEFAULT_EQUIPMENT_CAPTION =
  "All EWP machines are fully certified, and our painters are trained and certified to use them";
export const DEFAULT_EQUIPMENT_PHOTOS = [{ path: "/proposal/equipment-1.jpg" }, { path: "/proposal/equipment-2.jpg" }];
// Whole pages at the back, e.g. the Resene Eco Decorator certificate.
export const DEFAULT_BACK_PAGES = [
  { path: "/proposal/ecodecorator-certificate.jpg", caption: "Resene Eco Decorator certificate" },
];
// Accreditation logos on the cover and after the terms.
export const ACCREDITATION_LOGOS = [
  { src: "/proposal/sitesafe.png", alt: "Site Safe member", width: 431, height: 306 },
  { src: "/proposal/ecodecorator.png", alt: "Resene Eco Decorator", width: 646, height: 224 },
];

// Under the pricing. Lines starting "1." etc. make a numbered list.
export const DEFAULT_WHY_TEXT = `Key benefits for choosing Platinum Painters for your projects.

1. Deal direct with the owner
2. We only have wages staff and do not sub contract our projects out
3. We are a local North Shore painting company
4. 25 years experience working with Body Corporates
5. Certified Resene Eco Decorator
6. Local sponsor of Albany Senior High Girls football team, Woman's club netball team and Browns Bay Bowling Club`;

export const DEFAULT_SPEC_INTRO =
  "The preparation of all surfaces and the application of all coatings will be in accordance with the Resene specification and standard industry practices.";

export const DEFAULT_EXCLUDES =
  "Aluminium joinery, balustrades & screens\nColorsteel box gutters, flashings & downpipes\nUnpainted brick & masonry\nAll other surfaces\nTrimming of trees and shrubs\nBuilding repairs";

export const DEFAULT_METHODOLOGY = `The preparation of all surfaces and the application of all coatings will be in accordance with standard industry practices.

All bare surfaces will be primed and any staining will be stain blocked prior to the finish coats.

Washing:
All surfaces being painted will be washed to remove any dirt and grime prior to the preparation and painting.

Rusted surfaces:
Any rusty nails will be punched, zinc coated and filled; any other rusty surfaces will be machine prepared and zinc coated.

Timber surfaces:
The surfaces will be power sanded where possible using 150 to 180 grit sandpaper then dusted off prior to priming and finish coats. Any gaps, nail holes or defects will be filled using either epoxy filler or Sika MS sealant, whichever is best suited for the situation.

Fibrolite and block surfaces:
The surfaces will be sanded using 180 grit sandpaper and dusted off prior to priming and finish coats. Fearing Cream (a type of epoxy filler) will be used to fill any nail/screw holes to the fibrolite surfaces and concrete filler will be used to fill any damaged blocks.

Textured surfaces:
Any damaged surfaces will be filled and re-textured to a close match of the existing texture.

Protection and cleaning:
We will provide adequate paint drop sheets to cover the ground and equipment from paint spots and splashes during the painting process. Old paint scrapings, debris, empty containers and waste materials will be disposed of to preserve a neat and tidy appearance. On completion of each section we will remove all scaffolding, plant and equipment and leave the area in a clean and orderly condition to your satisfaction.

Safety:
A full Site Specific Safety Plan will be created prior to any work starting. This will highlight any safety hazards for the owners / tenants and our staff. Safety signs, cones and barriers will be used to ensure our work areas meet the WorkSafe requirements to protect everyone onsite.`;

export const DEFAULT_TERMS = `Acceptance:
This quote is valid for 30 days and the price is guaranteed provided work is authorised to start within 90 days.

Payment:
Payment terms for all projects are 7 days from the date of invoice, unless otherwise noted. Platinum Painters NZ may raise progress claims during the course of the work. Late payment will be subject to an initial 10% penalty and interest charges of 15% per annum, at the sole discretion of Platinum Painters NZ.

Goods & Services Tax:
This quotation excludes any applicable Goods and Services Tax.

Changes in Government Charges:
During the term of the project, should any new laws or regulations be introduced by any level of government resulting in new/additional charges being imposed, our invoices will be adjusted accordingly for any increases or decreases in cost associated with these changes.

Insurance & Securities:
Platinum Painters NZ Ltd Public Liability Insurance cover is for a maximum of $10,000,000. Certificates of currency are available on request.

Guarantee:
Platinum Painters NZ Ltd workmanship will be guaranteed for 5 years for a one-off repaint or 7 years on a paint maintenance schedule. A written guarantee will be given once the repaint has been completed and there are no outstanding invoices.

Services:
Water, power and toilet facilities to be made available throughout the duration of the contract. If a portaloo is required, additional charges will apply and be added to the final invoice.

Weathertightness:
This quotation is for aesthetic purposes only, and will not resolve any issue of building design, construction, and/or materials that may be contributing to a lack of building weathertightness. A suitably qualified consultant should be engaged to assess the integrity of the building, and any required remedial work should be completed prior to painting. Any required remedial work to achieve building weathertightness will fall outside the painting scope of works and contract.`;

// The company templates as saved, with anything not set yet filled in from
// the standard wording and pictures above.
type Img = { path: string; caption?: string };
export type SettingsRow = Partial<{
  cover_title: string | null;
  header_line: string | null;
  letter_intro: string | null;
  signoff: string | null;
  about_text: string | null;
  methodology: string | null;
  terms: string | null;
  completed_projects: Img[] | null;
  letter_banner: string | null;
  company_block: string | null;
  signer: string | null;
  signature_path: string | null;
  equipment_title: string | null;
  equipment_caption: string | null;
  equipment_photos: Img[] | null;
  back_pages: Img[] | null;
  why_text: string | null;
  reference_photos: Img[] | null;
}>;

export function withTemplateDefaults(s: SettingsRow | null | undefined) {
  return {
    cover_title: s?.cover_title || "PAINTING PROPOSAL",
    header_line: s?.header_line || DEFAULT_HEADER_LINE,
    letter_intro: s?.letter_intro ?? DEFAULT_LETTER_INTRO,
    signoff: s?.signoff ?? DEFAULT_SIGNOFF,
    about_text: s?.about_text ?? "",
    methodology: s?.methodology ?? DEFAULT_METHODOLOGY,
    terms: s?.terms ?? DEFAULT_TERMS,
    completed_projects: s?.completed_projects?.length ? s.completed_projects : DEFAULT_COMPLETED_PROJECTS,
    letter_banner: s?.letter_banner ?? DEFAULT_LETTER_BANNER,
    company_block: s?.company_block ?? DEFAULT_COMPANY_BLOCK,
    signer: s?.signer ?? DEFAULT_SIGNER,
    signature_path: s?.signature_path === undefined || s?.signature_path === null ? DEFAULT_SIGNATURE : s.signature_path,
    equipment_title: s?.equipment_title ?? DEFAULT_EQUIPMENT_TITLE,
    equipment_caption: s?.equipment_caption ?? DEFAULT_EQUIPMENT_CAPTION,
    equipment_photos: s?.equipment_photos ?? DEFAULT_EQUIPMENT_PHOTOS,
    back_pages: s?.back_pages ?? DEFAULT_BACK_PAGES,
    why_text: s?.why_text ?? DEFAULT_WHY_TEXT,
    // The library to pick a proposal's reference photos from.
    reference_photos: s?.reference_photos ?? [],
  };
}

export type ProposalTemplates = ReturnType<typeof withTemplateDefaults>;
