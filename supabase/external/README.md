# Repara — migrating the backend to a Supabase project you own

This folder holds everything needed to stand Repara's backend up in **your own
Supabase project**, independent of Lovable Cloud.

## Important constraint (read first)

A Lovable project can be attached to **either** Lovable Cloud **or** your own
Supabase project — not both, and Lovable cannot flip an existing Cloud project
onto an external Supabase automatically. So the switch is a deliberate,
one-time cutover that needs an action from you (details at the bottom).

Nothing in this folder touches the running Lovable Cloud backend. It is safe
prep work: you can build the external backend, verify it, and only then cut over.

## What the app depends on today

| Concern | Current implementation |
| --- | --- |
| Tables | `customers`, `vehicles`, `service_requests`, `mileage_records`, `request_attachments`, `quotes`, `quote_items`, `appointments`, `user_roles` |
| Public quote submission | server function `submitQuoteRequest` (`src/lib/quote.functions.ts`) using the **service role** — the browser never writes to tables |
| Public quote page | server function reads by `quotes.public_token` (service role), so no anon table access |
| Admin reads/writes | server functions in `src/lib/admin.functions.ts` behind `requireSupabaseAuth` + `user_roles`/`has_role` |
| VIN decoding | `src/lib/vin.functions.ts` → NHTSA vPIC (no backend dependency) |
| Photos | browser upload to private bucket `request-photos`, rows in `request_attachments` |
| Env vars | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (browser) · `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only) |

Because every privileged path already runs server-side, the migration is purely
"point the same env vars at a different project" — no UI, quote flow, VIN,
multi-service, mileage, photo or request-number logic changes.

## Steps

1. **Create your Supabase project** (or use an existing one).
2. Open **SQL Editor → New query**, paste `0001_repara_backend.sql`, run it.
   This creates every current table plus the forward-looking ones:
   `requested_services`, `service_records`, `service_record_items`,
   `inspections`, `inspection_items`, `maintenance_intervals`,
   `maintenance_recommendations` — with indexes, FKs, `updated_at` triggers,
   least-privilege RLS, and the private `request-photos` bucket.
3. **Create your admin user** in Authentication → Users, then insert the role
   row shown at the bottom of the SQL file.
4. **Copy existing data** (optional — current Cloud data is mostly test rows).
   Ask me and I'll export the live rows as an `INSERT` script you can paste.
5. **Cut over** (see below), then run the end-to-end test:
   quote → VIN decode → multi-service → mileage/ZIP → photos → contact →
   submit → confirmation number → rows visible in *your* project.

## Security model

- `anon` has **no** table privileges at all — it cannot list customers, browse
  vehicles, read quote requests, or touch service history. Verify with a REST
  call using your publishable key: every table returns a permission error.
- `authenticated` access is gated by `is_staff(auth.uid())`, backed by the
  separate `user_roles` table (never a role column on a profile).
- `service_role` is used only inside server functions and never reaches the browser.
- `request-photos` is private: anon may `insert` only; reads require staff or a
  server-generated signed URL.

## What I need from you to complete the cutover

Lovable cannot detach this project from Cloud on its own. Do this:

1. Push the code to **GitHub** (chat `+` menu → GitHub → Connect project) so you
   own the source regardless of what happens next.
2. A workspace **admin** disconnects Lovable Cloud: **Cloud tab → Advanced →
   Disconnect**. This is irreversible and deletes the Cloud database, so do it
   only after step 2–3 above are done and you've asked me to export any rows you
   want to keep.
3. Connect your own Supabase from the chat `+` menu → **Supabase → Connect**,
   and authorize the project you created.
4. Tell me it's connected. I'll re-point the integration files, confirm the env
   vars resolve, and run the full end-to-end test against your project.

I will never ask you to paste the database password or service-role key into
source code or chat — connecting through the Supabase authorization flow wires
those in as environment variables automatically.
