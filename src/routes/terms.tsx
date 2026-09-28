import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalPage, LegalSection, SUPPORT_EMAIL } from "@/components/legal/LegalPage";

const DESC = "Terms & Conditions for using Repara, including service requests, quotes, and SMS terms.";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Repara" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Terms & Conditions — Repara" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Terms & Conditions" updated="September 28, 2026">
      <LegalSection title="1. Acceptance of Terms">
        <p>
          By using the Repara website or services, you agree to these Terms &amp; Conditions. If you do
          not agree, please do not use Repara.
        </p>
      </LegalSection>

      <LegalSection title="2. About Repara">
        <p>
          Repara is an automotive service platform that helps drivers request service, receive quotes,
          communicate with service providers, and keep track of their vehicle and service history.
        </p>
      </LegalSection>

      <LegalSection title="3. Service Requests">
        <p>
          You can submit a service request without creating an account. You agree to provide accurate
          vehicle and contact information. Submitting a request does not guarantee availability,
          pricing, or an appointment.
        </p>
      </LegalSection>

      <LegalSection title="4. Quotes and Provider Services">
        <p>
          Quotes are estimates based on the information provided and may change after inspection. Work
          is performed only after you approve it. Where service is performed by an independent provider,
          that provider is responsible for the work it performs.
        </p>
      </LegalSection>

      <LegalSection title="5. User Responsibilities">
        <ul>
          <li>Provide accurate information and keep your contact details up to date.</li>
          <li>Do not misuse Repara, submit false requests, or interfere with the platform.</li>
          <li>Keep your account credentials secure.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Communications">
        <p>
          Repara communicates with you by in-app notifications, email, and, if you opt in, text
          messages, based on the preferences you choose. You can change your preferences at any time.
        </p>
      </LegalSection>

      <LegalSection title="SMS Terms">
        <p>
          Repara SMS messages are available to customers who voluntarily opt in to receive text
          messages. Messages may include service request confirmations, quote and status updates,
          customer/provider communication, scheduling-related updates, and links to view or manage
          Repara service requests.
        </p>
        <p className="font-semibold text-foreground">Message and data rates may apply.</p>
        <ul>
          <li>Message frequency varies based on the customer's activity and service requests.</li>
          <li>SMS consent is optional and is not required to submit a service request or use Repara.</li>
          <li>Reply <strong className="text-foreground">STOP</strong> to opt out of SMS messages.</li>
          <li>Reply <strong className="text-foreground">HELP</strong> for help.</li>
          <li>You may also contact Repara at <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</li>
          <li>Carriers are not liable for delayed or undelivered messages.</li>
          <li>SMS messages may contain links to Repara pages or secure service-request pages.</li>
          <li>SMS consent is not sold or shared with third parties for marketing purposes.</li>
          <li>
            Repara's <Link to="/privacy-policy" className="underline">Privacy Policy</Link> applies to
            information collected through SMS and the Repara platform.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Privacy">
        <p>
          Your use of Repara is also governed by our{" "}
          <Link to="/privacy-policy" className="underline">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection title="8. Third-Party Services">
        <p>
          Repara relies on third-party services such as hosting, communications, and service providers.
          Repara is not responsible for third-party services outside its control.
        </p>
      </LegalSection>

      <LegalSection title="9. Disclaimers">
        <p>
          Repara is provided "as is." Guidance and information on Repara are for general informational
          purposes and do not replace an in-person inspection by a qualified technician.
        </p>
      </LegalSection>

      <LegalSection title="10. Limitation of Liability">
        <p>
          To the fullest extent permitted by law, Repara is not liable for indirect, incidental, or
          consequential damages arising from use of the platform.
        </p>
      </LegalSection>

      <LegalSection title="11. Changes to These Terms">
        <p>Repara may update these Terms from time to time. Changes are posted on this page.</p>
      </LegalSection>

      <LegalSection title="12. Contact Information">
        <p>
          Questions? Contact Repara at{" "}
          <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
