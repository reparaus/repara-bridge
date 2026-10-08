/**
 * Guest submission must never alter or redirect an existing customer
 * (security audit #3). Runs the real persistQuoteRequest against an in-memory
 * database stand-in, so nothing touches Supabase or sends notifications.
 *
 *   bun test
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
let nextId = 1;

function matches(row: Row, filters: Array<(r: Row) => boolean>) {
  return filters.every((f) => f(row));
}

function likeToRegExp(pattern: string) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

/** Minimal chainable stand-in for the supabase-js query builder. */
function table(name: string) {
  db[name] ??= [];
  const filters: Array<(r: Row) => boolean> = [];
  let mode: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row | Row[] | null = null;
  let max = Infinity;

  const run = () => {
    const rows = db[name]!;
    if (mode === "insert") {
      const list = (Array.isArray(payload) ? payload : [payload!]).map((r) => ({
        id: `${name}-${nextId++}`,
        request_number: `R-${nextId}`,
        ...r,
      }));
      rows.push(...list);
      return { data: list, error: null };
    }
    const hit = rows.filter((r) => matches(r, filters));
    if (mode === "update") hit.forEach((r) => Object.assign(r, payload));
    if (mode === "delete") db[name] = rows.filter((r) => !hit.includes(r));
    return { data: hit.slice(0, max), error: null };
  };

  const q: any = {
    select: () => q,
    insert: (row: Row | Row[]) => ((mode = "insert"), (payload = row), q),
    update: (patch: Row) => ((mode = "update"), (payload = patch), q),
    upsert: (row: Row | Row[]) => ((mode = "insert"), (payload = row), q),
    delete: () => ((mode = "delete"), q),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), q),
    ilike: (c: string, p: string) => (filters.push((r) => likeToRegExp(p).test(String(r[c] ?? ""))), q),
    order: () => q,
    limit: (n: number) => ((max = n), q),
    single: async () => {
      const { data } = run();
      return { data: data[0] ?? null, error: data[0] ? null : { message: "no rows" } };
    },
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve(run()),
  };
  return q;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: table, rpc: async () => ({ data: null, error: null }) },
}));
mock.module("@/lib/request-emails.server", () => ({ triggerRequestEmails: async () => {} }));
mock.module("@/lib/notify.server", () => ({
  matchAndNotifyProviders: async () => {},
  mintRequestToken: async () => "test-token",
}));

const { persistQuoteRequest } = await import("../src/lib/quote-submit.server");
const { quoteRequestSchema } = await import("../src/lib/quote-schema");

const VIN = "1HGCV1F30HA000001";

function submission(contact: Record<string, unknown>, vehicle: Record<string, unknown> = {}) {
  return quoteRequestSchema.parse({
    vehicle: { entryMethod: "vin", vin: VIN, year: 2017, make: "Honda", model: "Accord", trim: "EX", ...vehicle },
    services: [{ key: "diagnostic", label: "Diagnostic" }],
    details: { mileage: 98000, zipCode: "90001" },
    contact: { firstName: "Attacker", preferredContactMethod: "email", ...contact },
  });
}

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key];
  db["customers"] = [
    { id: "victim", first_name: "Victim", phone: "(404) 555-1234", email: "victim@example.com", preferred_contact_method: "email" },
  ];
  db["vehicles"] = [
    { id: "victim-car", customer_id: "victim", vin: VIN, year: 2017, make: "Honda", model: "Accord", trim: "EX", engine_code: null, drivetrain: "fwd", mileage: 90000 },
  ];
});

describe("guest submission vs existing customer", () => {
  test("same phone, different email: new customer, victim untouched", async () => {
    await persistQuoteRequest(submission({ phone: "404-555-1234", email: "attacker@example.com" }));
    const victim = db["customers"]!.find((c) => c.id === "victim")!;
    expect(victim.email).toBe("victim@example.com");
    expect(victim.first_name).toBe("Victim");
    expect(db["customers"]!.length).toBe(2);
    const request = db["service_requests"]![0]!;
    expect(request.customer_id).not.toBe("victim");
  });

  test("same email, no phone match: new customer, victim untouched", async () => {
    await persistQuoteRequest(submission({ email: "VICTIM@example.com", phone: "212-555-0000" }));
    expect(db["customers"]!.find((c) => c.id === "victim")!.phone).toBe("(404) 555-1234");
    expect(db["service_requests"]![0]!.customer_id).not.toBe("victim");
  });

  test("same phone AND email: reused, but no fields change", async () => {
    await persistQuoteRequest(
      submission({ phone: "404 555 1234", email: "victim@example.com", firstName: "Renamed", preferredContactMethod: "both", smsConsent: true }),
    );
    const victim = db["customers"]!.find((c) => c.id === "victim")!;
    expect(db["customers"]!.length).toBe(1);
    expect(victim.first_name).toBe("Victim");
    expect(victim.preferred_contact_method).toBe("email");
    expect(victim.sms_consent_at).toBeUndefined();
    expect(db["service_requests"]![0]!.customer_id).toBe("victim");
  });

  test("known vehicle: identity never overwritten, only missing details filled", async () => {
    await persistQuoteRequest(
      submission(
        { phone: "404-555-1234", email: "victim@example.com" },
        { year: 2001, make: "Ford", model: "Focus", trim: "", engineCode: "K24W1" },
      ),
    );
    const car = db["vehicles"]!.find((v) => v.id === "victim-car")!;
    expect(db["vehicles"]!.length).toBe(1);
    expect([car.year, car.make, car.model, car.trim]).toEqual([2017, "Honda", "Accord", "EX"]);
    expect(car.mileage).toBe(90000);
    expect(car.engine_code).toBe("K24W1");
    expect(db["service_requests"]![0]!.vehicle_id).toBe("victim-car");
  });

  test("new customer gets their own vehicle row even for a known VIN", async () => {
    await persistQuoteRequest(submission({ phone: "404-555-1234", email: "attacker@example.com" }, { make: "Ford" }));
    expect(db["vehicles"]!.find((v) => v.id === "victim-car")!.make).toBe("Honda");
    expect(db["vehicles"]!.length).toBe(2);
  });
});
