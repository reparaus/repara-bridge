# Repara Quote Flow

Build a production-ready responsive web app for my automotive service business called Repara.

BUSINESS OVERVIEW

Repara is a modern automotive service company focused on making car maintenance and repair more convenient, transparent, and affordable than traditional dealerships.

The business currently starts with one technician, but the software should be structured so it can later scale into a platform with multiple technicians, customer accounts, technician assignment, scheduling, service history, payments, and automated quoting.

For now, DO NOT build a marketplace or multi-technician system. Build a clean V1 focused on customer quote intake and an internal admin dashboard.

The goal is:

QR code → Repara website → vehicle information → service request → quote request submitted → admin receives request → admin creates quote → customer can review quote → customer accepts/declines → booking can be added later.

The app must be mobile-first because most customers will enter through a QR code on a business card.

--------------------------------------------------

BRAND / DESIGN DIRECTION

--------------------------------------------------

Brand name: REPARA

Visual style:

- Premium automotive

- Modern

- Minimal

- Clean

- Trustworthy

- Dark luxury aesthetic

- Not a generic mechanic-shop website

- Avoid flames, gears, racing graphics, checkered flags, cartoon cars, etc.

Colors:

- Black / near-black backgrounds

- White

- Silver / chrome accents

- Subtle gray borders

- No bright colors unless needed for status indicators

Typography:

- Modern geometric sans-serif

- Bold headings

- Excellent readability on mobile

The visual feel should be closer to a premium automotive technology company than a local repair shop.

Use generous spacing, subtle borders, rounded corners, smooth micro-interactions, and polished loading states.

Do not overuse gradients.

--------------------------------------------------

TECH STACK

--------------------------------------------------

Use:

- React

- TypeScript

- Tailwind CSS

- Supabase

- GitHub-compatible code structure

Use Supabase for:

- Database

- Authentication

- Storage

- Server-side/backend functions when needed

Structure the code cleanly so a developer can work on it later without needing to rebuild the app.

Do not hardcode important business data into UI components if it belongs in the database.

--------------------------------------------------

CUSTOMER EXPERIENCE

--------------------------------------------------

The primary CTA throughout the app should be:

GET A QUOTE

The customer should be able to request a quote without creating an account.

The quote process should feel fast and conversational, not like a long insurance form.

Use one clear step at a time.

Create a progress indicator such as:

Vehicle → Service → Details → Contact

Keep the entire flow optimized for phone screens.

--------------------------------------------------

PAGE 1: LANDING PAGE

--------------------------------------------------

Create a premium mobile-first landing page.

Header:

- Repara logo placeholder

- Minimal navigation

- Get a Quote button

Hero:

Headline:

Dealer-Level Care.

Without Dealer Prices.

Supporting copy:

Professional automotive service with straightforward pricing and convenient service.

Primary button:

GET A QUOTE

Secondary button:

VIEW SERVICES

Include a small trust section below:

- Dealer technician experience

- Transparent pricing

- Convenient service

Do not clutter the homepage.

Include sections for:

1. How It Works

Step 1:

Tell us what you drive

Step 2:

Choose what your vehicle needs

Step 3:

Receive your personalized quote

Step 4:

Approve and schedule service

2. Services

Cards for:

- Oil Change

- Brakes

- Fluid Services

- Battery

- Suspension

- Diagnostics

- Other Repairs

Do not show made-up exact prices.

Allow optional "Starting at" pricing to be added later from the database.

3. Why Repara

Use concise messaging around:

- Dealer-level experience

- Transparent estimates

- No unnecessary dealership overhead

- Convenient communication

4. Reviews

Create a review section that can later pull real reviews.

5. Final CTA

Need service?

GET YOUR QUOTE

--------------------------------------------------

QUOTE FLOW

--------------------------------------------------

Route:

 /quote

This should be the most important part of the app.

STEP 1 — VEHICLE

Heading:

What do you drive?

Allow two methods:

OPTION A:

Year

Make

Model

OPTION B:

VIN

VIN field:

- 17-character validation

- automatically uppercase input

- remove spaces

- show friendly error message for invalid VIN length

Include button:

DECODE VIN

For V1, create the architecture for VIN decoding but do not depend on a paid provider.

Create a service/function such as:

decodeVin(vin)

Make the integration replaceable later.

If no external VIN API is configured, allow the user to continue manually.

Include a future placeholder/button:

SCAN VIN

This button does NOT need functional camera scanning yet.

Design it so a VIN barcode/camera scanning feature can easily be added later.

If VIN decoding succeeds, show:

Vehicle Found

2021 Lexus RX 350

VIN: *****************

Customer confirms:

THIS IS MY VEHICLE

Store:

- year

- make

- model

- VIN if provided

STEP 2 — SERVICE

Heading:

What does your vehicle need?

Use large tappable service cards.

Options:

Oil Change

Brakes

Fluid Service

Battery

Suspension

Diagnostics

Maintenance

Other

Use conditional questions.

If Brakes:

Ask:

Which area?

Front

Rear

Both

Not Sure

Then ask symptoms:

- Grinding

- Squeaking

- Vibration

- Brake warning light

- None / routine replacement

- Other

If Oil Change:

Ask:

Oil change type

Standard

Synthetic

Not Sure

Ask mileage optionally.

If Fluid Service:

Ask which fluid:

- Brake fluid

- Coolant

- Transmission fluid

- Differential fluid

- Other

- Not Sure

If Battery:

Ask:

- No start

- Slow crank

- Warning light

- Battery replacement

- Other

If Diagnostics:

Ask the customer to describe the concern.

Show optional fields:

Warning lights?

When did it start?

If Other:

Show a large textarea:

Tell us what your vehicle needs or what you're experiencing.

STEP 3 — DETAILS

Heading:

A few more details

Fields:

Current mileage

Optional

ZIP code

Required

Preferred service location:

- Mobile service

- I'll provide location later

Customer notes

Optional

Photo upload

Optional

Allow customers to upload photos related to:

- warning lights

- damaged parts

- tires

- leaks

- vehicle condition

Store uploads securely in Supabase Storage.

STEP 4 — CONTACT

Heading:

Where should we send your quote?

Fields:

First name

Required

Last name

Optional

Mobile phone

Required

Email

Optional

Preferred contact method:

- Text

- Call

- Email

Default to Text.

Include consent text near submit:

By submitting, you agree that Repara may contact you regarding this quote request.

Primary button:

GET MY QUOTE

Do not require account creation.

--------------------------------------------------

SUBMISSION CONFIRMATION

--------------------------------------------------

After submit, show a polished confirmation screen.

Headline:

We've got it.

Copy:

Your quote request has been received.

We'll review your vehicle and service request and contact you with pricing and availability.

Display:

Quote Request #R-XXXX

Vehicle

Service requested

Buttons:

RETURN HOME

Optional:

ADD ANOTHER VEHICLE

Do not promise an exact response time yet.

--------------------------------------------------

CUSTOMER QUOTE VIEW

--------------------------------------------------

Create route:

/quote/[publicToken]

This page will later be sent to the customer through text/email.

It must NOT require login.

Use a secure random public token rather than exposing sequential database IDs.

Show:

REPARA

Your Quote

Customer:

First name

Vehicle:

Year Make Model

Service:

Requested service

Quote breakdown:

Parts

$___

Labor

$___

Fees

$___

Estimated total

$___

Optional notes from technician

Disclaimer:

Final pricing may change if additional issues are discovered or the requested service changes. Any additional work must be approved before being performed.

Buttons:

ACCEPT QUOTE

DECLINE

CONTACT REPARA

Accepted quotes should update status in the database.

Do not implement payment yet.

--------------------------------------------------

ADMIN DASHBOARD

--------------------------------------------------

Route:

/admin

Require Supabase authentication.

No public signup for admins.

Create an admin dashboard designed primarily for desktop but fully responsive.

Dashboard home:

Cards showing:

New Requests

Quotes Sent

Accepted

Scheduled

Completed

Main table:

Customer

Vehicle

Service

Submitted

Status

Action

Status options:

New

Reviewing

Quoted

Accepted

Declined

Scheduled

In Progress

Completed

Cancelled

Use status badges.

Allow filtering by:

- Status

- Service type

- Date

Allow search by:

- Customer name

- Phone

- VIN

- Vehicle

--------------------------------------------------

ADMIN REQUEST VIEW

--------------------------------------------------

Route:

/admin/requests/[id]

Show:

CUSTOMER

Name

Phone

Email

Preferred contact method

ZIP

VEHICLE

Year

Make

Model

VIN

Mileage

SERVICE REQUEST

Category

Subcategory

Symptoms

Customer notes

Uploaded photos

TIMELINE

Submitted

Quote created

Quote sent

Accepted

Scheduled

Completed

Admin actions:

CREATE QUOTE

EDIT REQUEST

MARK DECLINED

--------------------------------------------------

QUOTE BUILDER

--------------------------------------------------

Inside the admin request page, create a professional quote builder.

Allow admin to add line items.

Each line item:

Description

Type:

- Labor

- Part

- Fee

- Discount

Quantity

Unit price

Total

Automatically calculate:

Parts subtotal

Labor subtotal

Fees

Discounts

Estimated total

Optional tax field architecture should exist but do not assume tax rules.

Quote fields:

Expiration date

Technician notes

Customer-facing notes

Buttons:

SAVE DRAFT

SEND QUOTE

For V1, "Send Quote" should:

- set quote status to Sent

- generate public quote token

- create public quote URL

- allow admin to copy that URL

Do not require Twilio/email integration yet.

Show:

COPY CUSTOMER LINK

Later, this will integrate with texting.

--------------------------------------------------

DATABASE DESIGN

--------------------------------------------------

Create Supabase migrations/schema for:

customers

id

first_name

last_name

phone

email

preferred_contact_method

created_at

updated_at

vehicles

id

customer_id

vin

year

make

model

mileage

created_at

updated_at

service_requests

id

request_number

customer_id

vehicle_id

service_category

service_subcategory

symptoms

notes

zip_code

service_location_type

status

created_at

updated_at

request_attachments

id

service_request_id

storage_path

file_type

created_at

quotes

id

service_request_id

public_token

status

parts_subtotal

labor_subtotal

fees_total

discount_total

estimated_total

customer_notes

internal_notes

expiration_date

created_at

updated_at

sent_at

accepted_at

declined_at

quote_items

id

quote_id

item_type

description

quantity

unit_price

line_total

created_at

Add an appointments table now for future use:

appointments

id

service_request_id

customer_id

vehicle_id

scheduled_start

scheduled_end

status

service_location

notes

created_at

updated_at

Do NOT build a full scheduling UI yet.

--------------------------------------------------

DATA RELATIONSHIPS

--------------------------------------------------

One customer can have many vehicles.

One vehicle can have many service requests.

One service request belongs to one customer and one vehicle.

One service request can have multiple quote versions eventually.

Structure the database so quote revisions can be supported later.

Do not duplicate customer and vehicle information unnecessarily.

--------------------------------------------------

SECURITY

--------------------------------------------------

Set up proper Supabase Row Level Security.

Public users may:

- create quote requests

- upload files only for their own request flow

- view a quote only through a secure public token

Public users must NOT:

- browse customers

- browse vehicles

- browse service requests

- access admin data

Authenticated admin may access all business data.

Never expose Supabase service role keys in the frontend.

Use environment variables correctly.

Validate and sanitize user input.

Restrict file uploads by:

- file type

- reasonable file size

- images only for V1

--------------------------------------------------

UI COMPONENTS

--------------------------------------------------

Build reusable components for:

Button

Input

Select

Textarea

Card

ServiceCard

VehicleCard

StatusBadge

ProgressStepper

QuoteLineItem

PriceSummary

CustomerInfoCard

VehicleInfoCard

LoadingState

EmptyState

ConfirmationModal

Keep business logic out of presentation components when practical.

--------------------------------------------------

MOBILE UX

--------------------------------------------------

Mobile experience is the priority.

Large tap targets.

No tiny dropdowns.

Use native-friendly controls.

Quote flow should not feel like one giant form.

One logical section per screen.

Keep the main CTA reachable.

Avoid horizontal scrolling.

Handle mobile keyboards properly.

Persist quote-form progress locally so accidentally refreshing or leaving the page does not erase everything.

--------------------------------------------------

ERROR HANDLING

--------------------------------------------------

Create clean user-facing states for:

VIN lookup failed

Network error

Upload failed

Submission failed

Quote expired

Quote not found

Unauthorized admin

Empty dashboard

Loading

Do not expose raw technical error messages to customers.

--------------------------------------------------

ANALYTICS EVENTS

--------------------------------------------------

Create an analytics wrapper/interface but do not require a specific provider yet.

Track events such as:

landing_view

quote_started

vehicle_added

vin_entered

vin_decoded

service_selected

quote_form_completed

quote_submitted

public_quote_viewed

quote_accepted

quote_declined

This should make it easy to connect an analytics provider later.

--------------------------------------------------

FUTURE ARCHITECTURE

--------------------------------------------------

Do NOT build these now, but keep the architecture extensible for:

- VIN camera scanning

- automatic VIN decoding

- automated labor-time estimates

- parts pricing APIs

- instant preliminary quotes

- Stripe payments

- deposits

- automated SMS through Twilio

- email notifications

- customer accounts

- vehicle service history

- maintenance reminders

- technician accounts

- technician scheduling

- technician assignment

- multi-technician dispatch

- multiple service areas

- reviews

- referral system

- fleet customers

- business/fleet accounts

- mobile technician application

Do not create unnecessary complexity for these features now.

--------------------------------------------------

IMPORTANT PRODUCT PRINCIPLES

--------------------------------------------------

1. The customer should be able to request a quote in under 60 seconds.

2. Do not require registration to request a quote.

3. Every service request must be saved in structured database fields so the data can later be used for automation and analytics.

4. Avoid putting important information only inside free-text fields.

5. Admin workflow should minimize manual repetitive work.

6. Design for one technician today but scalable architecture tomorrow.

7. The customer-facing product must feel more premium than a Google Form.

8. Avoid fake reviews, fake customer counts, fake certifications, fake pricing, and fake claims.

9. Do not add features purely to make the app look impressive.

10. Prioritize a working quote workflow before everything else.

--------------------------------------------------

FIRST BUILD SCOPE

--------------------------------------------------

Build and make functional:

1. Landing page

2. Quote stepper

3. Service conditional logic

4. Customer/contact collection

5. Supabase database

6. File uploads

7. Submission confirmation

8. Admin login

9. Admin dashboard

10. Service request detail page

11. Quote builder

12. Public quote page

13. Accept/decline quote functionality

After implementation:

Verify the complete journey manually:

Customer:

Homepage

→ Get Quote

→ Vehicle

→ Service

→ Details

→ Contact

→ Submit

Admin:

Login

→ See new request

→ Open request

→ Build quote

→ Send quote

→ Copy public URL

Customer:

Open public URL

→ Review quote

→ Accept

Admin:

Dashboard reflects Accepted status.

Before adding anything outside this scope, make sure this entire loop works correctly.

Also generate:

- README with setup instructions

- .env.example

- database migration files

- clear folder structure

- notes explaining where VIN API, SMS, payment, and scheduling integrations should be added later

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c1e96fde-0376-4118-b120-0b1788fe5017).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
