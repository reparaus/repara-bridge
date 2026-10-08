/**
 * Security regression tests (audit #3: guest submissions; audit #6: rate
 * limits and photo uploads). Runs the real server code against an in-memory
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

/** Controls what public.consume_rate_limit returns in each test. */
let rpcResult: { data: unknown; error: { message: string } | null } = { data: true, error: null };
const rpcCalls: Array<Record<string, unknown>> = [];

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: table,
    rpc: async (_fn: string, args: Record<string, unknown>) => (rpcCalls.push(args), rpcResult),
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => ({ data: { path, token: `token-for-${path}` }, error: null }),
      }),
    },
  },
}));
mock.module("@/lib/request-emails.server", () => ({ triggerRequestEmails: async () => {} }));
mock.module("@/lib/notify.server", () => ({
  matchAndNotifyProviders: async () => {},
  mintRequestToken: async () => "test-token",
}));

const { persistQuoteRequest } = await import("../src/lib/quote-submit.server");
const { quoteRequestSchema } = await import("../src/lib/quote-schema");
const { createPhotoUploads } = await import("../src/lib/quote-submit.server");
const { consumeRateLimit, LIMITS } = await import("../src/lib/rate-limit.server");

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
  rpcResult = { data: true, error: null };
  rpcCalls.length = 0;
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

describe("rate limits", () => {
  test("allowed and blocked follow consume_rate_limit", async () => {
    expect(await consumeRateLimit("intakeQuestions", "visitor-1")).toBe(true);
    expect(rpcCalls[0]).toEqual({
      _key: "intakeQuestions:visitor-1",
      _max: LIMITS.intakeQuestions.max,
      _window_seconds: LIMITS.intakeQuestions.windowSeconds,
    });
    rpcResult = { data: false, error: null };
    expect(await consumeRateLimit("intakeQuestions", "visitor-1")).toBe(false);
  });

  test("a database error fails open", async () => {
    rpcResult = { data: null, error: { message: "function missing" } };
    expect(await consumeRateLimit("askRepara", "user-1")).toBe(true);
  });
});

describe("photo upload links", () => {
  test("one random, sanitized path per file", async () => {
    const { uploads } = await createPhotoUploads([
      { name: "../../etc/passwd photo.jpg", type: "image/jpeg", size: 1000 },
      { name: "b.png", type: "image/png", size: 1000 },
    ]);
    expect(uploads.length).toBe(2);
    const [first, second] = uploads.map((u) => u.path);
    expect(first!.split("/")[0]).toBe(second!.split("/")[0]);
    expect(first).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}-\.\._\.\._etc_passwd_photo\.jpg$/);
    expect(rpcCalls.length).toBe(2);
  });

  test("refused once the visitor's limit is used up", async () => {
    rpcResult = { data: false, error: null };
    await expect(createPhotoUploads([{ name: "a.jpg", type: "image/jpeg", size: 1 }])).rejects.toThrow("Too many photo uploads");
  });
});
