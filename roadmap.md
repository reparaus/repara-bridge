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
