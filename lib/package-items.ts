// A package is one thing you sell, made of several things you ship.
//
// Catalogue names carry that shape in the name itself —
// "بكج رباعي بلازما [شامبو + بلسم + تريتمنت + سيروم]" — which reads as an unbroken wall of text in
// a list and, worse, invited the eye to count four products where one was ordered. Splitting the
// name lets a screen show the package as the line item it is, with what is inside it underneath.
//
// This is presentation only. What was ordered, priced and reserved is the package; the components
// are already handled where it matters (migration 037 moves stock on the component bottles). So
// this never changes a quantity or a price — it only decides how a name is drawn.

/**
 * Split a line on '+' at bracket depth zero only.
 *
 * "أ + ب" is two products. "بكج [أ + ب]" is one product whose name happens to list its contents,
 * and splitting there turned one package into several items — in the WhatsApp parser it created
 * phantom order lines, and on the delivery board it showed one package as several things to carry.
 */
export function splitOutsideBrackets(line: string): string[] {
  const parts: string[] = [];
  let depth = 0, current = "";
  for (const ch of line ?? "") {
    if (ch === "[" || ch === "(" || ch === "{") depth++;
    else if (ch === "]" || ch === ")" || ch === "}") depth = Math.max(0, depth - 1);
    if (ch === "+" && depth === 0) { parts.push(current); current = ""; continue; }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export interface PackageName {
  /** The package itself: "بكج رباعي بلازما" */
  title: string;
  /** What is inside it, in order: ["شامبو", "بلسم", "تريتمنت", "سيروم"]. Empty for a plain product. */
  contents: string[];
}

/**
 * Split a product name into the package and its contents.
 *
 * A plain product returns its own name and no contents, so callers can render one shape for both
 * and simply get nothing extra when there is nothing extra to show.
 */
export function splitPackageName(name: string): PackageName {
  const raw = (name ?? "").trim();
  // The last bracketed group, so a name that happens to contain an earlier bracket is not mangled.
  const match = raw.match(/^(.*?)\s*[[(]([^\][()]+)[\])]\s*$/);
  if (!match) return {title: raw, contents: []};
  const [, title, inside] = match;
  const contents = inside
    .split(/[+،,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  // A bracket holding one thing is a note, not a package: "(محلي / أردني)" should stay in the title.
  if (contents.length < 2) return {title: raw, contents: []};
  return {title: title.trim() || raw, contents};
}

/** Whether this name describes a package worth drawing as a parent with children. */
export const isPackageName = (name: string): boolean => splitPackageName(name).contents.length > 0;
