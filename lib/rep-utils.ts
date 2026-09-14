export function matchesRep(targetRep?: string | null, userQuery?: string | null): boolean {
  if (!targetRep || !userQuery) return false;
  if (targetRep === "all" || userQuery === "all") return true;

  const t = targetRep.toLowerCase().trim();
  const q = userQuery.toLowerCase().trim();

  if (t === q) return true;
  if ((q.includes("hanan") || q.includes("حنان")) && (t.includes("حنان") || t.includes("hanan"))) return true;
  if ((q.includes("hamza") || q.includes("حمزة")) && (t.includes("حمزة") || t.includes("hamza"))) return true;
  if ((q.includes("sabreen") || q.includes("صابرين")) && (t.includes("صابرين") || t.includes("sabreen"))) return true;
  if ((q.includes("sara") || q.includes("سارة")) && (t.includes("سارة") || t.includes("sara"))) return true;
  if ((q.includes("haneen") || q.includes("حنين")) && (t.includes("حنين") || t.includes("haneen"))) return true;

  return false;
}
