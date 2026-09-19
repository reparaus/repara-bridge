# Repara V1 Completion Build

## Goal
Unify the existing driver Garage, provider network, Job Workspace, and public site around the canonical vehicle record. Reuse the current authentication, service requests, AI, quote, messaging, provider, maintenance, repair-knowledge, and history systems; add only the missing connections and customer-facing polish.

## 1. Public product experience
- Replace the Toyota/Lexus and single-technician homepage positioning with the Repara product promise: **“Your car, understood.”**
- Build a concise mobile-first homepage covering Your Garage, Ask Repara, Find Service, persistent service history, and Repara for Providers.
- Wire Create Your Garage, Sign In, Ask Repara, and Become a Repara Provider to the existing real flows.
- Keep EN/ES copy aligned and remove unsupported credentials, counts, pricing, reviews, or provider claims.
- Add lightweight installable-web-app metadata and icons using existing Repara brand assets; do not build a native app.

## 2. Garage and My Car
- Keep `/garage` as the authenticated driver home and improve the primary vehicle presentation, honest status language, mileage prompt, upcoming/unknown maintenance, and provenance-aware recent activity.
- Add complete multi-vehicle controls: view all cars, choose the active car, make a car primary, and ensure Ask Repara, Service, and provider requests always retain the intentionally selected vehicle.
- Make My Car usable with multiple vehicles rather than always redirecting to the primary car.
- Preserve the existing VIN scanner/decoder and vehicle visual abstraction.
- Add retry/error states so failed data reads are not presented as empty data.

## 3. Digital service book
- Turn history entries into readable detail views showing only stored date, mileage, service/category, provider, provenance, verification, amount, completed items, customer-safe notes, and associated Repara job/document links when present.
- Expand owner-added history with category, amount, and notes while always labeling it **Owner Record / Owner Provided**.
- Keep service records, service-record items, vehicle documents, and maintenance state as the single existing data model; no duplicate history or document tables.
- Keep maintenance evidence-based. Unknown remains explicit; no intervals or completion claims are inferred.

## 4. Job closeout → verified history
- Refine closeout around per-service/per-concern outcomes: Completed, Recommended, Declined, or Not performed.
- Add an editable customer-facing completion summary and mileage confirmation. AI may draft from existing technician evidence, but the technician must approve it.
- Synchronize only actual completed work into one idempotent Repara Verified history record per job.
- Include the selected provider, service category, source record ID, accepted customer-safe totals, completed items, completion date, and mileage when actually available.
- Exclude diagnosis-only content, unperformed/recommended/declined work, internal notes, internal costs, and private communications.
- Prevent duplicate history items and duplicate mileage readings when a job is reopened or closed again.
- Surface the completed history in Garage activity and My Car history immediately after closeout.

## 5. Provider network and Job Workspace connection
- Preserve the existing three-step onboarding, dashboard, public profile, shared service taxonomy, active-only discovery, and admin review.
- Tighten onboarding validation, resume/save behavior, progress feedback, errors, and profile status guidance.
- Add request grouping for New, In progress, and Completed using existing request states.
- Let the owning provider open only requests intentionally routed to that provider and continue into the existing Job Workspace without creating a second job system.
- Use a shared server authorization boundary: verified MFA admin or the owner of the provider assigned to that request. Extend RLS only to the necessary request/job rows.
- Keep admin provider search/filter/review/activate/pause and MFA unchanged.
- Improve provider lookup errors and service-area filtering; continue showing only real active non-demo providers with no ranking claims.

## 6. Ask Repara, requests, and messages
- Preserve the existing vehicle-aware AI and intake architecture.
- Carry AI-classified category and vehicle selection into the request; add a visible retry path for failed AI responses.
- Verify every Garage/Service/provider-profile request carries the exact selected vehicle, account/contact details, VIN/YMMT, mileage, language, service category, provider, and AI context when available.
- Keep guest intake unchanged.
- Present customer/provider messages with clear vehicle, request, provider, and job context while keeping internal notes private.

## 7. Real notification foundation
- Add one additive notification table only because no in-app notification model exists.
- Store notifications for a real recipient and optional vehicle/request/provider/job context, with event type, title/body, read state, and timestamps.
- Add strict owner-only RLS and server functions for a driver notification list and mark-as-read.
- Create notifications only from real application events implemented in this pass, initially job completion/history update; do not seed or fabricate notifications.
- Add a compact Garage notification screen/header entry with loading, empty (“You’re all caught up”), error, retry, and read states. Existing email preferences remain unchanged.

## 8. Additive migration
Create `supabase/external/0017_v1_completion.sql` only for confirmed schema/security gaps:
- Customer-facing closeout summary and any missing service-history/provider relationship needed for durable attribution.
- Idempotency for job-sourced mileage/history updates.
- In-app notifications with required grants, indexes, and owner/admin policies.
- Provider access policies scoped to requests routed to the provider they own and the minimum related Job Workspace rows.
- No drops, renames, destructive updates, fake seed data, or duplicate domain tables.

## 9. Verification
- Run focused type checks/tests and inspect the final migration for grants and RLS on every new table.
- Exercise public homepage, sign-in, Garage, multi-car selection, mileage, My Car/history, owner record, Ask Repara, Service, provider profile/request prefill, provider onboarding/dashboard/requests, admin provider controls, guest quote, and core Job Workspace pages.
- Execute a signed-in provider authorization test: own routed request allowed; another provider’s request denied.
- Execute the completed-job history test against available test data: one record, correct vehicle/job/provider/provenance, no duplicates on re-close, and no recommended/declined/internal content.
- Run the security scan and report that the external database itself remains unverified if the project connection is unavailable.
- Do not claim physical iPhone/Android testing; preserve the existing scanner implementation unchanged.

## Deliberately out of scope
Payments, subscriptions, booking/calendar, dispatch, marketplace ranking, fake provider/history/maintenance data, native apps, proprietary repair-data scraping, document OCR, and external shop-system integrations.
