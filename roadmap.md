# V1 completion roadmap

- [x] Audit driver, provider, history, homepage, security, and existing migrations
- [x] Finalize a scoped implementation plan for approval
- [x] Implement approved consolidation changes
- [x] Verify public homepage, guest quote entry, card redirect, app manifest, and signed-out access gates
- [ ] Verify signed-in driver, provider, admin, and exact-once history flows — `0017_v1_completion.sql` is applied; blocked because this workspace cannot provide an authenticated session for the external project

# V1 testing fixes + Mileage Intelligence
- [x] Expanded service taxonomy + whole-word intent matching
- [x] Signed-in request confirmation (Return to My Garage / View Request / Request Another Service), linked to the same Garage vehicle
- [x] Swappable vehicle visual resolver (honest silhouette fallback)
- [x] Mileage provenance, source-priority, estimate-safe current mileage (`0018_mileage_intelligence.sql`)
- [ ] Run `0018_mileage_intelligence.sql` on the external project (user)
- [ ] Signed-in driver/provider/admin QA — needs an authenticated external-project session

# Build Configurator V4
- [x] Phase 1: builds (create/rename/duplicate/active/archive), modification categories, keyword suggestions, estimate-unavailable state, Request Actual Quotes → request linked to build (`0019_vehicle_builds.sql`)
- [ ] Run `0019_vehicle_builds.sql` (user)

- [x] Phase 3: per-modification questions, budget, ZIP/service provider matching, driver provider selection, "notify me", install → verified (`0021_build_completion.sql`)
- [ ] Run `0021_build_completion.sql` (user, after 0020)
- [ ] Signed-in build → quote → completion QA — needs an authenticated session
- [x] Phase 2: provider invites, provider quotes with versions, driver compare/approve/decline, request timeline (`0020_provider_quotes.sql`)
- [ ] Run `0020_provider_quotes.sql` (user, after 0019)

- [ ] Run supabase/external/0022_build_visual_config.sql (3D build preview saving)
- [ ] Licensed 2021 Accord 3D model (blocked: needs asset purchase)
- [ ] 3D rounds 2+: tint, body parts, AI build assistant, live estimate in studio

# Notifications + Messaging + Provider Dashboard
- [x] Notifications with links/audience, delivery log, request-scoped guest links, request messaging, provider matching, preset pricing, appointment-pending (`0023_messaging_notifications.sql`)
- [x] Guest request page `/r/$token`, provider workspace tabs + dashboard, messages on both request pages, notification centers, email preferences, admin delivery view
- [ ] Run `0023_messaging_notifications.sql` (user)
- [ ] Redeploy `send-service-request-emails` edge function (user)
- [ ] Signed-in/guest end-to-end QA — needs migration + authenticated session

# SMS delivery correction
- [x] Preserve SMS number and consent on both new and returning customer records
- [x] Prevent older-schema fallback from changing a Text-only request into email delivery
- [x] Keep SMS independent from email-provider configuration and prohibit Text-only email fallback
- [ ] Redeploy `send-service-request-emails` after this correction (user)
- [ ] Verify a fresh Text-only request against Twilio delivery logs (blocked until redeploy/live request)
