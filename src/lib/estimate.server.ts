/**
 * Instant estimated price range for a request. Not a quote.
 * Built only from data that exists: source-tagged labor times (0027), real
 * provider labor rates, and priced part offers (0026). If any input is
 * missing or ambiguous, returns { available: false } — never a guessed number.
 */
type Db = { from: (t: string) => any };

export type RequestEstimate =
  | { available: true; lowCents: number; highCents: number; operationName: string }
  | { available: false };

type Vehicle = { year: number | null; make: string | null; model: string | null; trim: string | null; engine: string | null; drivetrain: string | null };

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const NO_PARTS_OPS = new Set(["diagnostic"]);
const PRICE_MAX_AGE_MS = 30 * 24 * 3600 * 1000;

function applies(row: any, v: Vehicle): boolean {
  if (row.year_from != null || row.year_to != null) {
    if (v.year == null) return false;
    if (row.year_from != null && v.year < Number(row.year_from)) return false;
    if (row.year_to != null && v.year > Number(row.year_to)) return false;
  }
  for (const k of ["make", "model", "trim", "drivetrain"] as const) {
    if (row[k] != null && norm(row[k]) !== norm(v[k])) return false;
  }
  if (row.engine != null && !norm(v.engine).includes(norm(row.engine))) return false;
  return true;
}

export async function estimateForRequest(
  db: Db,
  input: { categoryKey: string | null; vehicle: Vehicle | null; invitedProviderIds: string[] },
): Promise<RequestEstimate> {
  const none: RequestEstimate = { available: false };
  try {
    const v = input.vehicle;
    if (!input.categoryKey || !v?.make || !v.model || !v.year) return none;

    // 1. Exactly one repair operation must match the requested service.
    const { data: ops, error: opErr } = await db
      .from("repair_operations")
      .select("key, name, category_keys")
      .eq("is_active", true)
      .contains("category_keys", [input.categoryKey]);
    if (opErr || !ops || ops.length !== 1) return none;
    const op = ops[0];

    // 2. Vehicle-applicable labor times (no test data, no warranty times).
    const { data: times } = await db
      .from("labor_time_estimates")
      .select("hours, year_from, year_to, make, model, trim, engine, drivetrain")
      .eq("operation_key", op.key)
      .eq("is_test_data", false)
      .eq("is_warranty_time", false);
    const hours = ((times ?? []) as any[]).filter((t) => applies(t, v)).map((t) => Number(t.hours)).filter((h) => h > 0);
    if (!hours.length) return none;

    // 3. Real provider labor rates: invited providers first, else active providers.
    let rq = db.from("service_providers").select("labor_rate_cents").eq("status", "active").not("labor_rate_cents", "is", null);
    if (input.invitedProviderIds.length) rq = rq.in("id", input.invitedProviderIds);
    const { data: rateRows } = await rq.limit(200);
    const rates = ((rateRows ?? []) as any[]).map((r) => Number(r.labor_rate_cents)).filter((n) => n > 0);
    if (!rates.length) return none;

    // 4. Priced, recent, vehicle-fitting part offers for this operation.
    let partsLow = 0;
    let partsHigh = 0;
    if (!NO_PARTS_OPS.has(String(op.key))) {
      const { data: offers } = await db
        .from("part_offers")
        .select("cost_cents, price_checked_at, fitment")
        .eq("fitment->>operation_key", op.key)
        .not("cost_cents", "is", null);
      const now = Date.now();
      const byRole = new Map<string, number[]>();
      for (const o of (offers ?? []) as any[]) {
        const f = o.fitment ?? {};
        if (!o.price_checked_at || now - new Date(o.price_checked_at).getTime() > PRICE_MAX_AGE_MS) continue;
        if (!applies(f, v)) continue;
        const role = String(f.part_role ?? "part");
        byRole.set(role, [...(byRole.get(role) ?? []), Number(o.cost_cents) * Number(f.quantity ?? 1)]);
      }
      if (!byRole.size) return none;
      for (const c of byRole.values()) {
        partsLow += Math.min(...c);
        partsHigh += Math.max(...c);
      }
    }

    const low = Math.round(Math.min(...hours) * Math.min(...rates) + partsLow);
    const high = Math.round(Math.max(...hours) * Math.max(...rates) + partsHigh);
    if (!(low > 0) || high < low) return none;
    const round = (c: number, up: boolean) => (up ? Math.ceil(c / 1000) : Math.floor(c / 1000)) * 1000;
    return { available: true, lowCents: round(low, false), highCents: round(high, true), operationName: String(op.name) };
  } catch (e) {
    console.error("estimate", e);
    return none;
  }
}
