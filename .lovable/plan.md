# Repara V1 Completion Build

## Goal
Consolidate the existing vehicle-centered driver, provider, shop, and public experiences into a cohesive V1 without parallel systems or destructive schema changes.

## Planned work
- Audit current implementations and reuse points across Garage, vehicle history, closeout, providers, service requests, notifications, documents, maintenance, homepage, auth, and RLS.
- Close only confirmed functional gaps using existing tables and workflows; create one additive migration only where necessary.
- Connect completed Repara work to customer-visible history exactly once, while preserving provenance and excluding internal or unperformed work.
- Polish the public homepage and core driver/provider screens into one coherent product.
- Validate public, guest, authenticated driver, provider, admin, and history flows without claiming unperformed device tests.

## Constraints
- No duplicate vehicle, provider, service taxonomy, auth, request, job, or history systems.
- No destructive data changes, fake providers/history/maintenance, marketplace ranking, payments, booking, proprietary scraping, or native apps.
- Preserve EN/ES, MFA, RLS, VIN scanning, guest intake, AI, messaging, quotes, and Job Workspace behavior.
