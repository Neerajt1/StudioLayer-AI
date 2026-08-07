import { STUDIO_CONTACT_EMAIL, STUDIO_CONTACT_MAILTO } from '@/lib/studio-contact';

export function ProfileContactSection() {
  return (
    <section className="mb-6 border border-border rounded bg-card p-6 sl-profile-contact-section">
      <h3 className="sl-section-label mb-3">Need Help or Have an Idea?</h3>
      <p className="sl-ui-helper mb-3">
        We&apos;re continuously improving StudioLayer AI and would love to hear from you.
      </p>
      <p className="sl-ui-helper mb-3">
        Whether you&apos;ve found an issue, have a feature suggestion, or simply want to share
        your experience, please write to us at:
      </p>
      <p className="sl-ui-helper">
        <a href={STUDIO_CONTACT_MAILTO} className="sl-contact-email-link">
          {STUDIO_CONTACT_EMAIL}
        </a>
      </p>
    </section>
  );
}
