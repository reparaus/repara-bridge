import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalPage, LegalSection, SUPPORT_EMAIL } from "@/components/legal/LegalPage";

const DESC = "How Repara collects, uses, and protects your information, including SMS consent and mobile data.";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Repara" },
      { name: "description", content: DESC },
      { property: "og:title", content: "Privacy Policy — Repara" },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy" updated="September 28, 2026">
      <p className="mt-6 text-[15px] leading-relaxed text-muted-foreground">
        This Privacy Policy explains how Repara ("Repara," "we," "us") collects, uses, and protects
        information when you use the Repara website, request automotive service, or communicate with
        us, including by text message.
      </p>

      <LegalSection title="1. Information We Collect">
        <ul>
          <li><strong>Contact information:</strong> name, email address, mobile phone number, ZIP code, and communication preferences (email, text, or both).</li>
          <li><strong>Vehicle information:</strong> VIN, year, make, model, trim, engine, drivetrain, mileage, photos, and service history.</li>
          <li><strong>Service request information:</strong> details you submit when requesting service, quotes, inspections, or scheduling, and messages exchanged with Repara or service providers.</li>
          <li><strong>Account information:</strong> if you choose to create an account, your login details and garage/vehicle records.</li>
          <li><strong>Technical information:</strong> basic device, browser, and usage data collected to operate and improve the site.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. How We Use Information">
        <p>Repara uses information to:</p>
        <ul>
          <li>Provide and operate our services and process service requests.</li>
          <li>Send confirmations, quotes, status updates, and messages about your requests.</li>
          <li>Maintain vehicle and service history.</li>
          <li>Provide customer support.</li>
          <li>Improve the Repara platform.</li>
          <li>Prevent fraud, abuse, and security incidents.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. SMS and Mobile Communications">
        <p>
          Repara may send SMS messages to customers who voluntarily opt in to receive them. Messages may
          include service request confirmations, quote and status updates, customer/provider
          communication, scheduling-related updates, and links to view or manage service requests.
          Message frequency varies based on your activity with Repara. Message and data rates may apply.
          You can opt out at any time by replying <strong>STOP</strong>. For help, reply{" "}
          <strong>HELP</strong> or contact Repara through the support information provided on this
          website. SMS consent is not a condition of purchasing goods or services or submitting a
          service request.
        </p>
        <p>
          SMS consent is optional. You can use Repara and submit a service request by choosing email
          instead of text messages.
        </p>
        <p className="font-semibold text-foreground">
          We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes.
        </p>
        <p>
          Repara does not sell or share mobile phone numbers or SMS consent information with third
          parties or affiliates for marketing or promotional purposes.
        </p>
      </LegalSection>

      <LegalSection title="4. How We Share Information">
        <p>Repara shares information only as needed to operate our services:</p>
        <ul>
          <li>With the automotive service provider handling your request, so they can quote and perform the work.</li>
          <li>With service providers that help us operate the platform, such as hosting, communications (email and SMS delivery), payment, analytics, and infrastructure providers. They may use the information only to provide services to Repara.</li>
          <li>When required by law or to protect the rights, safety, and security of Repara and our users.</li>
        </ul>
        <p>
          SMS opt-in data and phone numbers are never shared with third parties for their marketing
          purposes. Repara does not sell personal information.
        </p>
      </LegalSection>

      <LegalSection title="5. Data Security">
        <p>
          Repara uses reasonable administrative, technical, and physical safeguards, including
          encrypted connections and access controls, to protect your information. No method of
          transmission or storage is completely secure.
        </p>
      </LegalSection>

      <LegalSection title="6. Data Retention">
        <p>
          We keep information for as long as needed to provide our services, maintain your vehicle
          service history, meet legal obligations, and resolve disputes. You may ask us to delete your
          information as described below.
        </p>
      </LegalSection>

      <LegalSection title="7. Your Choices and Rights">
        <ul>
          <li>Opt out of text messages at any time by replying <strong>STOP</strong>.</li>
          <li>Change your notification preferences in your account settings.</li>
          <li>Request access to, correction of, or deletion of your information by contacting us.</li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Cookies and Analytics">
        <p>
          Repara uses cookies and similar technologies to keep you signed in, remember preferences such
          as language, save request drafts, and understand how the site is used so we can improve it.
          You can control cookies through your browser settings.
        </p>
      </LegalSection>

      <LegalSection title="9. Children's Privacy">
        <p>
          Repara is not directed to children under 13, and we do not knowingly collect personal
          information from children under 13.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes to This Privacy Policy">
        <p>
          Repara may update this Privacy Policy from time to time. Changes are posted on this page with
          an updated date.
        </p>
      </LegalSection>

      <LegalSection title="11. Contact Us">
        <p>
          Questions about this Privacy Policy? Contact Repara at{" "}
          <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. See also our{" "}
          <Link to="/terms" className="underline">Terms &amp; Conditions</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
