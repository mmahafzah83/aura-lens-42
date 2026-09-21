/**
 * announcementPeople.ts — WHO AN ANNOUNCEMENT NAMES.
 *
 * An appointment, a board change or a resignation names people. Those names are
 * the way in: a record with a named person is a door, a record without one is a
 * notice. This reads only the STORED page text of a record we already hold, and
 * keeps nothing but a name, a public role title, the sentence that named them,
 * and whether the page states their role IN THIS MATTER.
 *
 * Two laws, the same as everywhere else:
 *   1. A quote that cannot be found in the stored page text is dropped, and the
 *      person with it.
 *   2. No email address, no telephone number, nothing personal. The table has
 *      nowhere to put them and the prompt is told not to return them.
 */

export type NamedPerson = {
  full_name: string;
  role_title: string | null;
  /** True only when the page presents the person as speaking for the organisation. */
  is_public_spokesperson: boolean;
  /** True only when the page states this person's role IN THIS ANNOUNCEMENT. */
  role_in_matter: boolean;
  /** The reason, in the page's own words, that the role in the matter is stated. */
  role_in_matter_reason: string | null;
  quote: string;
};

export const PEOPLE_SYSTEM =
  `You read one stored announcement and list every person it names in a public professional role. ` +
  `Return strict JSON {people:[{full_name, role_title, is_public_spokesperson, role_in_matter, role_in_matter_reason, quote}]}. ` +
  `Include only people the text itself names. role_title is the public role the text gives them, or null. ` +
  `is_public_spokesperson is true only when the text presents the person as speaking for the organisation. ` +
  `role_in_matter is true ONLY when the text states what this person does IN THE MATTER the announcement is about ` +
  `(they are the one appointed, the one leaving, the one who decides, the one to contact, the one chairing it). ` +
  `A person merely quoted for colour, or named as background, has role_in_matter false. ` +
  `role_in_matter_reason is a short phrase from the text saying why, or null. ` +
  `quote is a verbatim run from the text that names the person. ` +
  `Never return an email address, a telephone number, an address or any personal detail. ` +
  `If the text names nobody, people is an empty array.`;

const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, " ").replace(/\s+/g, " ").trim();

/** Contact detail, in any shape. A row carrying it is dropped, not cleaned. */
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{7,}/;

const A_NAME = /^[\p{L}][\p{L}'’.\- ]{3,79}$/u;

/**
 * A byline is not a public role at the organisation. The person who wrote the
 * article, or reported it, is not part of the matter and is not stored.
 */
const A_BYLINE = /\b(writer|author|reporter|correspondent|journalist|editor|editorial|contributor|staff)\b|كاتب|كاتبة|محرر|مراسل|صحفي|صحفية/i;

/** Keep only what the stored page can prove. */
export function verifyPeople(raw: unknown, pageText: string): NamedPerson[] {
  const list = Array.isArray((raw as any)?.people) ? (raw as any).people : [];
  const hay = norm(pageText);
  if (hay.length < 100) return [];

  const out: NamedPerson[] = [];
  const seen = new Set<string>();

  for (const p of list) {
    const full_name = String(p?.full_name ?? "").trim();
    const role_title = String(p?.role_title ?? "").trim() || null;
    const quote = String(p?.quote ?? "").trim();

    if (!A_NAME.test(full_name)) continue;
    if (CONTACT.test(full_name) || (role_title && CONTACT.test(role_title)) || CONTACT.test(quote)) continue;
    if (role_title && A_BYLINE.test(role_title)) continue;
    // The name itself must be in the page, and so must the sentence that names it.
    if (!hay.includes(norm(full_name))) continue;
    if (norm(quote).length < 12 || !hay.includes(norm(quote))) continue;

    const key = norm(full_name);
    if (seen.has(key)) continue;
    seen.add(key);

    const reason = String(p?.role_in_matter_reason ?? "").trim();
    out.push({
      full_name,
      role_title: role_title ? role_title.slice(0, 160) : null,
      is_public_spokesperson: p?.is_public_spokesperson === true,
      role_in_matter: p?.role_in_matter === true && reason.length > 0,
      role_in_matter_reason: reason ? reason.slice(0, 240) : null,
      quote: quote.slice(0, 400),
    });
  }
  return out;
}

/** A record that names people only matters when it is about people moving. */
export const ANNOUNCEMENT_HINT =
  /appoint|appointed|named|names|board|chair|chairman|chairperson|director|resign|resigns|resigned|steps down|succeed|successor|joins|takes over|elected|nominat|تعيين|عيّن|مجلس|رئيس|استقال|خلف|انتخاب/i;
