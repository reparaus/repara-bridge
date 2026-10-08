# CLAUDE.md

Engineering decisions and invariants live in AGENTS.md (imported below). This file is the product context and development history.

@AGENTS.md

---

# REPARA — PRODUCT CONTEXT & DEVELOPMENT HISTORY

This section is the persistent product context for Repara.

The goal is for Claude Code to understand not only the codebase, but WHY the product is being built, what has already been decided, and what direction the product is moving toward.

Treat these decisions as the current product direction unless explicitly changed by the founder.

---

# 1. WHAT REPARA IS

Repara is building the operating layer between:

Vehicle Owner
→ Repara
→ Repair Provider
→ Parts / Supplier Ecosystem

The long-term vision is not simply "a marketplace for mechanics."

Repara should understand the vehicle, understand the service need, help coordinate diagnosis and repair, connect the customer with qualified providers, support quoting, eventually connect legitimate parts/supplier data, and preserve the vehicle's service history.

The vehicle is the center of the platform.

Core positioning:

"Repara is building the operating layer between the vehicle owner, repair provider, and automotive parts ecosystem."

The customer experience should eventually feel like:

"This app knows my car."

---

# 2. CORE PRODUCT WORKFLOW

The intended end-to-end workflow is:

Vehicle
→ VIN / exact vehicle configuration
→ Customer concern
→ Repara intake
→ Diagnosis
→ Findings
→ Recommendations
→ Compatible parts
→ Supplier availability/pricing
→ Provider quote
→ Customer approval
→ Parts procurement
→ Repair
→ Service history
→ Future maintenance intelligence

The current product does not have every piece connected yet.

Do not pretend that unfinished integrations exist.

Build toward this architecture incrementally.

---

# 3. CUSTOMER EXPERIENCE

The customer should NOT need to know the technical diagnosis before requesting service.

The ideal mental model is:

"Something is wrong with my car. I'll tell Repara what I'm experiencing."

Instead of:

"I need a water pump replacement."

Repara should help translate the customer's concern into a useful service/diagnostic workflow.

Example:

Customer:
"My check engine light came on and the car feels weird."

Repara:
- gathers relevant information
- asks follow-up questions
- structures the concern
- routes the request appropriately
- eventually supports provider diagnosis
- presents findings/recommendations in understandable language

The customer should not be overwhelmed with technician terminology.

---

# 4. AI COPILOT VISION

AI should be present DURING the workflow, not only after submission.

Target workflow:

Customer intake
→ AI helps structure concern
→ Provider diagnosis
→ AI helps organize findings
→ Recommendations
→ Quote
→ Customer approval
→ Repair
→ Closeout

The provider diagnosis experience should be simple.

The provider should be able to answer naturally:

"What did you find?"

Repara AI can structure the underlying information behind the scenes.

Findings should eventually support simple categories such as:

GREEN = normal / no concern
YELLOW = monitor / recommended
RED = repair / safety concern

Do not fabricate diagnostic results.

AI should assist with organization and interpretation, not invent findings.

---

# 5. GARAGE / VEHICLE COMPANION

Garage is one of the most important parts of Repara.

The vehicle should be the anchor for:

- VIN
- vehicle configuration
- mileage
- service requests
- quotes
- repairs
- findings
- recommendations
- maintenance
- recalls
- service history
- photos/documents where appropriate
- future vehicle builds/customizations

Garage should feel like a personal automotive command center.

Avoid fake "vehicle health scores."

If there isn't enough real data, say so.

For example:

"Not enough information yet"

is better than inventing a 78/100 health score.

Garage should become increasingly intelligent as real vehicle/service data accumulates.

---

# 6. MAINTENANCE INTELLIGENCE

Repara should eventually answer:

"What does my car need next?"

This should be integrated into the Garage/vehicle experience rather than being an unnecessary separate destination.

Examples:

- oil service approaching
- brakes may be due soon
- scheduled maintenance
- inspection recommended
- recall information
- previously identified recommendations

The system must distinguish between:

Known
Estimated
Recommended
Unknown

Never present an inference as a confirmed fact.

---

# 7. VEHICLE IDENTIFICATION

VIN is extremely important.

Repara should eventually support:

VIN scan
→ exact vehicle
→ year/make/model/trim
→ engine
→ fuel
→ drivetrain
→ exact configuration
→ parts/fitment

Current implementation already uses VIN identity and NHTSA vPIC decoding.

Do not remove or bypass VIN-based vehicle identity with unnecessary manual vehicle entry.

Barcode scanning and future integrations may supplement this.

---

# 8. PROVIDER MARKETPLACE MODEL

Repara should NOT make choosing a provider the primary workflow.

The normal workflow should be:

Customer describes what is happening
→ Repara understands the service need
→ eligible providers are identified
→ providers choose whether/how to quote
→ customer compares quotes
→ customer accepts a provider

Provider profiles are a secondary discovery/trust layer.

Customers can optionally choose a specific provider when appropriate.

Provider setup should tell Repara:

- what services they perform
- whether they are in-shop/mobile
- where they operate
- service radius where applicable
- pricing
- hours
- notification preferences

Matching should primarily be:

SERVICE
+
GEOGRAPHY

Do not introduce arbitrary ZIP-prefix matching.

---

# 9. PROVIDER TYPES

Repara is intended to support providers such as:

- independent mechanics
- dealer service
- mobile mechanics
- mobile detailers
- glass
- tint
- tire shops
- body/paint
- performance shops
- other automotive service businesses

Do not assume Repara is only for mechanics.

---

# 10. PROVIDER PORTAL

Provider portal currently contains concepts including:

Home
Requests
Customers
Profile
Settings

Provider onboarding:

Draft
→ Pending Review
→ Active

Paused providers should not behave like active providers.

Provider data must remain isolated between provider businesses/accounts.

Provider-facing vehicle information should generally include:

- year
- make
- model
- trim
- engine
- fuel
- drivetrain
- mileage
- service concern
- customer notes

VIN should NOT be exposed to providers unless explicitly required.

---

# 11. PROVIDER QUOTE SYSTEM

The current quote architecture supports:

Vehicle
→ Parts
→ Labor
→ Fees
→ Review
→ Send

Provider can add:

Parts
Labor
Fees
Tax

Provider parts data can include private internal cost.

Customer must NEVER see:

- internal part cost
- supplier cost
- private procurement information
- private provider metadata

Customer should see the customer-facing price/quote.

Fitment confirmation is important.

The provider should confirm fitment before sending a quote.

Do not fabricate part fitment.

---

# 12. LABOR

Labor rate and labor time are separate concepts.

Labor rate:
Example:
$125/hour

Labor time:
Example:
2.5 hours

The provider controls their labor rate.

Labor time should eventually come from legitimate sources such as:

- licensed reference data
- Repara observed data
- provider defaults
- manual provider input

Potential future sources discussed include:

MOTOR
Mitchell 1
ALLDATA

Do not create fake labor-time data.

Long-term Repara should be able to learn from actual completed jobs.

Potential future data:

Estimated hours
Actual hours
Difficulty
Warranty vs customer-pay
Provider feedback
Observed outcomes

Do not automatically alter provider pricing based on early observations.

---

# 13. PARTS ECOSYSTEM

Parts integration is a major strategic component.

Repara should NOT scrape automotive retailer websites.

Do not scrape:

- AutoZone
- O'Reilly
- supplier websites
- catalogs
- pricing pages

Repara wants legitimate licensed data/API relationships.

The desired future architecture is:

VIN
→ Exact vehicle configuration
→ Compatible parts
→ OEM/aftermarket equivalents
→ Supplier
→ Real pricing
→ Real availability
→ Location
→ Ordering
→ Order status

Potential integration/data partners explored:

PartsTech
WHI / Nexpart
OEC / OEConnection
Auto Care Association
TecAlliance / TecDoc / TecCom
O'Reilly

No partnership should ever be represented as finalized unless it actually is.

---

# 14. CURRENT PARTS INTEGRATION STATUS

Repara's quote architecture was intentionally prepared for legitimate parts integrations.

Migration 0026 is already applied.

It added infrastructure for concepts including:

- provider quote line items
- parts
- labor
- fees
- private provider cost
- supplier information
- fitment
- supplier price/availability
- customer-safe quote lines
- quote versioning
- provider labor rates
- vehicle configuration data

Supplier tables may currently be empty.

That is expected until a legitimate data source is connected.

Never invent supplier prices or availability just to make the UI look complete.

---

# 15. PARTS PARTNERSHIP OUTREACH STATUS

Current outreach history:

PARTSTECH:
- API agreement/process investigated
- Test User/sandbox discussed
- Production pricing/licensing/account structure questions sent
- Goal: determine whether PartsTech can become the parts procurement layer

WHI / NEXPART:
- Contact established
- Danni Withers, Partnership Strategy & Development Manager
- Meeting booked:
  Thursday, October 15, 2026
  9:00–9:30 AM Pacific
- Meeting is specifically associated with Nexpart Multi-Seller
- Goal: understand capabilities, account structure, pricing, licensing, multi-supplier procurement, API/integration options

O'REILLY:
- Initial inquiry sent
- Directed to sales_admin@oreillyauto.com
- Ticket reference existed

OEC / OEConnection:
- Integration inquiry sent
- Interested in EPCLink/OEM catalog/fitment/pricing/availability/order workflows

AUTO CARE ASSOCIATION:
- ACES/PIES/IPO data/API investigated
- Interested in vehicle/parts/fitment data rather than supplier procurement alone

TECALLIANCE:
- Inquiry sent for:
  TecDoc Catalogue
  TecDoc Web Service
  TecDoc OE Parts Data
  TecCom Order
- Response received that inquiry was forwarded to the appropriate U.S. sales contact
- Awaiting follow-up

Do not send duplicate outreach unless explicitly requested.

---

# 16. SERVICE REQUEST WORKFLOW

Target workflow:

Customer intake
→ request created
→ providers matched
→ providers invited
→ quotes
→ customer comparison
→ provider acceptance
→ repair
→ completion

The system supports signed-in and guest workflows.

Guest customers should be able to access their request through a secure request-specific link without creating an account.

Authenticated customers should be routed into their Garage/request experience.

---

# 17. GUEST EXPERIENCE

Guest workflows are important.

A guest should be able to:

- submit a request
- receive a secure request link
- view request status
- view quotes
- accept/decline quotes
- communicate
- receive notifications according to consent

Do not force account creation unnecessarily.

If a guest later creates an account, the system should have a secure and deliberate claim/linking process.

VIN alone should not be treated as sufficient proof of vehicle ownership.

---

# 18. REQUEST FOLLOW-UP UX

A known UX issue has been follow-up questions appearing lower on the page after submission while the viewport remains at the top.

This can make users think they are finished.

Desired behavior:

When new required questions appear:
- old questions should be cleared/collapsed appropriately
- user should be taken directly to the new unanswered questions
- the interface should clearly communicate that additional information is required

Do not leave new required questions hidden below the fold.

---

# 19. AUTHENTICATION

Important existing UX decisions:

If a user attempts to sign up with an email that already exists:

Show a clear message that an existing account was found.

Offer:
- Sign In
- Reset Password

Do not show a generic:
"Check your email"

message when the real issue is an existing account.

Driver sign-in should include:

Forgot password

Provider login already has this behavior.

---

# 20. MESSAGING / NOTIFICATIONS

Repara supports:

- in-app messaging
- email
- SMS
- notification preferences

Customer communication should preserve consent requirements.

Guests should receive secure request-specific links.

Authenticated users should receive the appropriate Garage/request destination.

Do not remove or bypass existing notification preference logic.

---

# 21. SERVICE HISTORY

Service history should become one of Repara's long-term moats.

Every completed service should ideally contribute to the vehicle's permanent history.

Eventually:

Vehicle
→ Concern
→ Diagnosis
→ Findings
→ Parts
→ Labor
→ Repair
→ Provider
→ Date
→ Mileage
→ Recommendations

This history should help Repara understand the vehicle over time.

---

# 22. FUTURE VEHICLE BUILD / 3D VISION

A future Garage experience may include an interactive vehicle visualization.

Concept:

360-degree vehicle
→ Stock
→ Daily
→ Show Build
→ Track

Possible customization:

- ride height
- wheels
- paint
- tint
- spoilers
- body kits
- lighting
- other modifications

Future experience should support VIN-specific compatibility and estimated ranges where legitimate data exists.

User wants this to feel more like a polished automotive version of GTA-style vehicle customization, not a generic configurator.

Current 3D implementation is still experimental and should not be treated as complete.

---

# 22b. 360° BUILD + CAR SCAN PLAN (agreed direction, October 2026)

Goal: a car-community "future build" in the Garage. The owner spins a 360°
model of THEIR car and swaps components — wheels, tires, ride height /
suspension, paint, tint, carbon hood, spoilers, body kits (OEM or, mostly,
aftermarket) — sees them fitted, and saves the build. Each component maps to
a real part with real fitment, so a build can become a provider quote, then
an install, then service history. This is a Repara moat, not a toy.

## Architecture (layers)

1. Identity — VIN decode (exists) → year / make / model / trim / body.
2. Base 3D model — the VIN picks a clean, LICENSED glTF/GLB model of that
   exact vehicle. Customization happens on this model, never on a raw scan.
   Models carry named attachment points ("slots": wheel_FL…, hood, spoiler,
   bumpers, glass, body paint) so parts swap by slot.
3. Parts + fitment — every selectable part comes from real catalog/fitment
   data (wheel diameter/width/offset/bolt pattern, tire sizes, body-part
   applicability). Never invent fitment (§11, §13).
4. Part visuals — wheels/tires can be largely procedural (generated from real
   dimensions + finish); body parts (hoods, spoilers, kits) need per-vehicle
   3D assets from a licensed source.
5. Configurator — React Three Fiber today (Build3DViewer.tsx); rules in §22a
   keep it portable to native. Paint/tint/ride height are material and
   transform changes driven by visual_config.
6. Persistence — reuse vehicle_builds (+ visual_config), build_modifications
   and build_estimates (0019/0021/0022); "Request Actual Quotes" already links
   a build to a service request.
7. Customer capture (scan) — personalizes, does not replace, the base model.

## Customer scan / capture — cross-platform by design

- Phase A (any phone, web app today): guided photo walkaround (8–12 set
  angles) saved to the vehicle as a dated condition record. Uses the secured
  signed-upload path (0030). Feeds paint color, existing mods, damage.
- Phase B: VIN-matched base model + configurator (the core build experience).
- Phase C (native app): guided scan. The phone only CAPTURES (photos/video +
  ARKit/ARCore pose/depth when available); a cloud GPU service reconstructs,
  so iPhone and Android/Samsung get the same result (GLB/splat stored per
  vehicle). iPhone on-device Object Capture is an optional fast path only.
  Car paint/glass/chrome are hard for photogrammetry — scans are for
  realism/condition, not the editable model.

## Candidate vendors (to evaluate — NOT partners; verify terms/pricing)

- Wheel/tire fitment + visualization: RideStyler (API, wheel/tire/suspension
  visualizer, 490+ brands, 82k+ vehicles), Wheel-Size API, DriveRightData.
- Aftermarket product data: SEMA Data (verify).
- Licensed vehicle 3D models: TurboSquid (Hum3D/Squir collections; brand use
  approved case-by-case by automakers), 3DTuning (large tuning library — ask
  about B2B licensing), or commissioned models for top vehicles.
- 3D configurator platforms (buy vs build): Threekit.
- Scan processing: KIRI Engine, Luma AI (enterprise API), Polycam; or
  self-hosted open-source photogrammetry/splats on a GPU host (Modal/RunPod).

Rules: no scraped models or catalogs; automaker trade dress needs licensed
assets; no fabricated parts, prices or fitment; start narrow (a few popular
vehicles) and expand with real data.

---

# 22a. MOBILE-READINESS RULES (iOS / Android later)

Repara will become a native app (likely React Native / Expo) on the SAME
backend (Supabase + Cloudflare). Every change should keep that move cheap:

- Business logic lives in plain server modules (`*.server.ts`, e.g.
  src/lib/garage/garage.server.ts) that take plain inputs. TanStack server
  functions stay thin wrappers, so a mobile API route can call the same code.
- Database security (RLS, grants, server-only tables) is the real boundary —
  a mobile app talks to Supabase directly. Never rely on the web UI to enforce
  a rule.
- Shared shapes (zod schemas, constants such as quote-schema.ts) stay free of
  DOM/React imports so they can move into a shared package.
- 3D: vehicle models are glTF/GLB files; per-vehicle looks are plain JSON
  (vehicle_builds.visual_config). Keep rendering code separate from that data
  so a native renderer (react-three-fiber native, SceneKit/RealityKit,
  Filament) can reuse the same models and configs. Models will move from
  public/models to Storage with a DB mapping (make/model/body → model file)
  when real per-vehicle models arrive.
- Notifications are channel-based (notification_deliveries); push becomes
  another channel, not a rewrite.
- Do not build the mobile app or a public API speculatively; follow these
  rules as features are touched.

---

# 23. DESIGN DIRECTION

Repara should feel:

Premium automotive
+
Modern fintech
+
Trustworthy
+
Clean
+
Technical without being intimidating

Avoid:
- excessive gradients
- excessive animations
- excessive emojis
- clutter
- gimmicky dashboards
- fake data

The UI should feel polished and intentional.

Information hierarchy matters more than visual decoration.

---

# 24. GARAGE DESIGN PHILOSOPHY

Garage should not feel empty just because the user has little data.

If data is missing:
- explain what can be added
- provide useful next actions
- keep the layout polished
- do not fabricate information

The Garage should progressively become more useful as the vehicle accumulates data.

---

# 25. CURRENT CODEBASE STATE

Architecture:
- TanStack Start / Router
- React 19
- TypeScript
- TanStack Query
- Tailwind 4
- shadcn/Radix
- Supabase (own project rlrpnsqrjxvuxisquric)
- Bun (package manager; bun.lock resolves from the public npm registry)
- Nitro build → Cloudflare Worker `repara` (see AGENTS.md "Hosting")
- AI: Google Gemini via src/lib/ai/provider.server.ts

Database:
- migrations 0001–0031 in supabase/external
- 0025, 0026 applied; 0027 appears live/applied
- 0028 exists but was not confirmed/applied
- 0031 (provider directory lockdown) applied October 2026; anonymous reads of provider tables and is_staff refused (401), public profile verified
- 0030 (rate limits + upload lockdown) applied October 2026; verified live (limiter, policy removed, anonymous upload refused)
- 0029 (garage link hardening) applied October 2026; supabase/external/tests/0029_garage_link_hardening.test.sql passed 13/13 on the live database

Important known issues:
- stale generated Supabase types
- large lint/format backlog
- duplicate/dead matching code
- legacy/duplicate systems
- limited automated tests
- supplier/labor data currently empty
- remaining security issues from the audit (section 26)
- README.md is still the original V1 build prompt, not real documentation

Do not fix all of these at once.

---

# 26. SECURITY ISSUES IDENTIFIED BY AUDIT

These are high-priority tasks.

1. Vehicle IDOR / ownership linking — fixed (0029 + garage code), verified live
2. VIN-only guest vehicle takeover — fixed with #1
3. Guest submission overwriting existing customer information — fixed (customer reused only on exact phone+email match, never updated; vehicles never overwritten; tests/quote-submit.test.ts)
4. Anonymous exposure of provider columns — fixed (0031: provider tables server-only for non-owners; directory/profile read server-side with public fields; role-probe helpers not callable anonymously)
5. Broad access to licensed labor/parts pricing — open
6. Public AI/photo endpoints without sufficient rate limiting — fixed (0030: consume_rate_limit + src/lib/rate-limit.server.ts; signed photo uploads; bucket size/type limits)
7. Database/repository migration drift — open
8. Lovable infrastructure lock-in — resolved (see section 27)

These need deliberate security work.

Do not "fix" them by guessing.

Inspect the exact implementation, explain the risk, then implement a targeted solution.

---

# 27. LOVABLE → CLAUDE CODE TRANSITION (COMPLETE)

Repara was originally developed in Lovable. As of October 2026 it is fully independent:

- Lovable project deleted; GitHub repo reparaus/repara-bridge is the only source of truth
- reparaus.com (registered at GoDaddy, DNS on Cloudflare) is served by the Cloudflare Worker `repara`
- Build uses a standard TanStack Start + Vite config (no @lovable.dev packages)
- Logo images are self-hosted in src/assets
- AI calls Google Gemini directly (no Lovable AI gateway)

Lovable-era history in this file and in supabase/external/README.md is background only.

---

# 28. LOGO / ASSETS

The logo lives in src/assets/repara-lockup.png and src/assets/repara-mark.png
(the original artwork, copied byte-for-byte from the former Lovable assets) and
is rendered by src/components/brand/Logo.tsx.

Do not fabricate replacement logo artwork.

---

# 29. DEVELOPMENT PHILOSOPHY

The founder is intentionally moving from:

"make the UI work"

toward:

"build a real product foundation."

Therefore prioritize:

Security
→ Data correctness
→ Architecture
→ Core workflows
→ Integrations
→ UX
→ Visual polish

Do not optimize only for quick demos.

At the same time, do not over-engineer hypothetical future features.

Build the smallest real foundation that supports the intended product.

---

# 30. HOW TO WORK WITH THE FOUNDER

The founder prefers:

- direct answers
- practical recommendations
- minimal unnecessary explanation
- copy/paste-ready implementation prompts when useful
- consolidated changes rather than many tiny steps
- preserving existing work
- understanding the reasoning behind major architecture decisions
- testing real workflows instead of assuming code works

When a task touches multiple parts of the system, inspect the full workflow first.

Do not make the founder manually relay context between tools.

Use this CLAUDE.md and the repository itself as the primary development context.

If something is unclear, inspect the existing implementation before asking a question.

Only ask the founder when a product decision genuinely cannot be inferred from the existing product direction.

---

# 31. IMPORTANT PRODUCT PRINCIPLE

Repara should eventually become more valuable every time a vehicle is serviced.

The flywheel is:

More vehicle history
→ better understanding of the vehicle
→ better service recommendations
→ better provider matching
→ better quotes
→ better parts/fitment
→ better repair outcomes
→ better future vehicle intelligence

The product should compound knowledge around the vehicle.

That is more important than simply generating leads.

---

# 32. CURRENT STRATEGIC PRIORITY

The immediate goal is NOT to add random features.

The current goal is:

1. Establish a secure, independent codebase
2. Resolve critical data-access/security issues
3. Clean up the database/type foundation
4. Remove critical Lovable lock-in
5. Verify core customer/provider/quote workflows
6. Continue building the Garage and provider experience
7. Integrate legitimate parts/labor data when commercial partnerships are ready

The founder is currently transitioning active development from Lovable to Claude Code.

Preserve the existing product while making the foundation progressively more independent and production-ready.
