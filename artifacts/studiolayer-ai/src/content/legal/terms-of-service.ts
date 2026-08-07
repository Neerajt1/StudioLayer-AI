import type { LegalDocument } from '@/lib/legal-documents';
import { LEGAL_DOCUMENT_PATHS } from '@/lib/legal-documents';

/** StudioLayer AI Terms of Service — Version 1.0 */
export const TERMS_OF_SERVICE: LegalDocument = {
  slug: 'terms',
  path: LEGAL_DOCUMENT_PATHS.terms,
  title: 'Terms of Service',
  description: 'The terms governing use of StudioLayer AI.',
  effectiveDate: '2026-08-07',
  lastUpdated: '2026-08-07',
  version: '1.0',
  isPublished: true,
  intro: [],
  sections: [
    {
      id: 'introduction',
      title: '1. Introduction',
      paragraphs: [
        'Welcome to StudioLayer AI.',
        'These Terms of Service ("Terms") govern your access to and use of the StudioLayer AI platform, website, applications, and related services (collectively, the "Services").',
        'By creating an account, accessing, or using StudioLayer AI, you agree to be bound by these Terms. If you do not agree to these Terms, you must not use the Services.',
        'StudioLayer AI provides AI-powered tools that help individuals and businesses generate, refine, and manage fashion imagery and other creative assets. The Services may evolve over time as new features, capabilities, and technologies are introduced.',
        'These Terms apply to all users of the Services, including individuals, businesses, agencies, brands, designers, retailers, and other organizations.',
        'By using StudioLayer AI, you acknowledge that:',
        'you have read and understood these Terms;',
        'you are legally capable of entering into a binding agreement under the laws applicable to you;',
        'you will use the Services only in accordance with these Terms and all applicable laws.',
        'If you are using StudioLayer AI on behalf of a company or other legal entity, you represent that you have the authority to bind that entity to these Terms.',
        'These Terms form a legally binding agreement between you and StudioLayer AI.',
      ],
    },
    {
      id: 'eligibility',
      title: '2. Eligibility',
      paragraphs: [
        'You must be at least 18 years of age, or the age of legal majority in your jurisdiction, whichever is higher, to create an account and use the Services.',
        'You represent that:',
        'your information is accurate and current;',
        'you will keep your account updated;',
        'you are legally permitted to use the Services;',
        'you are not impersonating another individual or organization.',
        'StudioLayer AI may restrict access where required by applicable law.',
      ],
    },
    {
      id: 'account-registration',
      title: '3. Account Registration',
      paragraphs: [
        'You agree to:',
        'provide accurate registration information;',
        'maintain the security of your account;',
        'keep your credentials confidential;',
        'notify StudioLayer AI immediately of unauthorized access.',
        'StudioLayer AI may suspend or terminate accounts involved in fraudulent, abusive, or unlawful activity.',
      ],
    },
    {
      id: 'user-responsibilities',
      title: '4. User Responsibilities',
      paragraphs: [
        'You agree not to:',
        'violate applicable laws;',
        'upload content you do not have rights to use;',
        'upload malware or harmful software;',
        'interfere with StudioLayer AI systems;',
        'attempt unauthorized access;',
        'abuse or overload the Services.',
        'You remain responsible for all content created, uploaded, or downloaded through your account.',
      ],
    },
    {
      id: 'user-content',
      title: '5. User Content',
      paragraphs: [
        'You retain ownership of the content you upload.',
        'By uploading content, you grant StudioLayer AI a limited, non-exclusive license to process, store, reproduce, and transmit that content solely for the purpose of operating, improving, maintaining, securing, and supporting the Services.',
        'StudioLayer AI does not claim ownership of your uploaded content.',
      ],
    },
    {
      id: 'studio-credits',
      title: '6. Studio Credits',
      paragraphs: [
        'Studio Credits are internal usage units used within StudioLayer AI.',
        'Studio Credits:',
        'have no cash value;',
        'are non-transferable;',
        'cannot be redeemed for money;',
        'may not be resold.',
        'Credits are deducted only after successful completion of eligible actions.',
        'If an eligible action fails because of a verified technical issue attributable to StudioLayer AI, credits may be restored at StudioLayer AI\'s discretion.',
        'Current Studio Credit allocations, validity periods, and usage rules are published within the application and may change over time.',
      ],
    },
    {
      id: 'billing-payments',
      title: '7. Billing & Payments',
      paragraphs: [
        'Paid Services require payment.',
        'Current subscription plans, Studio Credit allocations, features, billing intervals, and pricing are displayed on StudioLayer AI\'s pricing pages and may change from time to time.',
        'Payments are processed through secure third-party payment providers.',
        'StudioLayer AI does not store complete payment card information.',
        'Subscriptions automatically renew unless cancelled before renewal.',
      ],
    },
    {
      id: 'ai-generated-content',
      title: '8. AI-Generated Content',
      paragraphs: [
        'StudioLayer AI uses artificial intelligence to assist users in generating and refining creative content.',
        'AI-generated outputs may vary even when identical inputs are used.',
        'Users are responsible for reviewing generated content before using it commercially or publicly.',
        'StudioLayer AI does not guarantee that AI-generated outputs are error-free, unique, or suitable for every intended purpose.',
      ],
    },
    {
      id: 'intellectual-property',
      title: '9. Intellectual Property',
      paragraphs: [
        'StudioLayer AI owns all intellectual property relating to the platform, software, branding, design, and technology.',
        'Users retain ownership of their uploaded content.',
        'Nothing in these Terms transfers ownership of StudioLayer AI intellectual property.',
      ],
    },
    {
      id: 'commercial-usage',
      title: '10. Commercial Usage Rights',
      paragraphs: [
        'Unless otherwise prohibited by law or these Terms, users may use AI-generated outputs for lawful commercial purposes including advertising, e-commerce, editorial publications, marketing campaigns, client work, social media, and product catalogues.',
        'Users remain responsible for ensuring lawful commercial use.',
      ],
    },
    {
      id: 'acceptable-use',
      title: '11. Acceptable Use',
      paragraphs: [
        'Users must not create or distribute content that:',
        'violates the law;',
        'infringes intellectual property;',
        'exploits minors;',
        'promotes terrorism;',
        'contains hate speech;',
        'contains malware;',
        'impersonates others;',
        'interferes with StudioLayer AI systems.',
        'StudioLayer AI may suspend accounts violating these rules.',
      ],
    },
    {
      id: 'service-availability',
      title: '12. Service Availability',
      paragraphs: [
        'StudioLayer AI is provided on an "as available" basis.',
        'Temporary interruptions, maintenance, upgrades, and feature changes may occur.',
        'StudioLayer AI will make reasonable efforts to minimise disruption.',
      ],
    },
    {
      id: 'refund-policy',
      title: '13. Refund Policy',
      paragraphs: [
        'Refund eligibility is governed by StudioLayer AI\'s Refund Policy.',
        'Unless required by law:',
        'subscription fees are generally non-refundable;',
        'Studio Credit purchases are generally non-refundable;',
        'cancelled subscriptions remain active until the current billing period ends.',
        'Credits deducted because of verified technical failures may be restored.',
      ],
    },
    {
      id: 'limitation-of-liability',
      title: '14. Limitation of Liability',
      paragraphs: [
        'To the maximum extent permitted by law, StudioLayer AI is not liable for indirect, incidental, special, consequential, or punitive damages.',
        'Total liability shall not exceed the amount paid by the user during the twelve months preceding the relevant claim.',
      ],
    },
    {
      id: 'indemnification',
      title: '15. Indemnification',
      paragraphs: [
        'Users agree to indemnify StudioLayer AI against claims arising from:',
        'misuse of the Services;',
        'uploaded content;',
        'violation of these Terms;',
        'infringement of third-party rights.',
      ],
    },
    {
      id: 'suspension-termination',
      title: '16. Suspension & Termination',
      paragraphs: [
        'StudioLayer AI may suspend or terminate accounts for fraud, abuse, security concerns, or violations of these Terms.',
        'Users may close their accounts at any time.',
        'Certain provisions survive termination.',
      ],
    },
    {
      id: 'changes',
      title: '17. Changes to These Terms',
      paragraphs: [
        'StudioLayer AI may update these Terms from time to time.',
        'Material changes will update the "Last Updated" date and, where required by law, users will be notified before the changes take effect.',
        'Continued use of the Services constitutes acceptance of the updated Terms.',
      ],
    },
    {
      id: 'governing-law',
      title: '18. Governing Law',
      paragraphs: [
        'These Terms are governed by the laws applicable to StudioLayer AI\'s principal place of business, subject to mandatory consumer protection laws where applicable.',
      ],
    },
    {
      id: 'contact',
      title: '19. Contact Information',
      paragraphs: [
        'For legal enquiries regarding these Terms, contact:',
        'StudioLayer AI',
        'Email: info@studiolayerai.com',
      ],
    },
  ],
};
