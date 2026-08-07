import type { LegalDocument } from '@/lib/legal-documents';
import { LEGAL_DOCUMENT_PATHS } from '@/lib/legal-documents';

/** StudioLayer AI Cookie Policy — Version 1.0 */
export const COOKIE_POLICY: LegalDocument = {
  slug: 'cookies',
  path: LEGAL_DOCUMENT_PATHS.cookies,
  title: 'Cookie Policy',
  description: 'How StudioLayer AI uses cookies and similar technologies.',
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
        'StudioLayer AI is a product operated by 29Copper Media Works.',
        'This Cookie Policy explains how StudioLayer AI ("we", "us", or "our") uses cookies and similar technologies when you access or use the StudioLayer AI platform, website, applications, and related services (collectively, the "Services").',
        'This policy should be read together with our Privacy Policy and Terms of Service. It describes what cookies are, the types of cookies we use, and the choices available to you.',
        'By continuing to use the Services, you acknowledge that you have read and understood this Cookie Policy, subject to any choices you make through your browser or device settings and any consent mechanisms required by applicable law.',
      ],
    },
    {
      id: 'what-cookies-are',
      title: '2. What Cookies Are',
      paragraphs: [
        'Cookies are small text files that are placed on your device when you visit a website or use an online service.',
        'Cookies allow a service to recognize your device, remember certain information about your visit, and support core functionality such as staying signed in or maintaining preferences.',
        'Similar technologies may include local storage, session storage, pixels, and other identifiers that perform comparable functions. For simplicity, we refer to these collectively as "cookies" in this policy.',
        'Cookies may be set directly by StudioLayer AI ("first-party cookies") or by trusted third-party providers that help us deliver the Services ("third-party cookies").',
      ],
    },
    {
      id: 'types-of-cookies',
      title: '3. Types of Cookies We Use',
      paragraphs: [
        'We use different categories of cookies depending on their purpose. Not all categories may be active at all times, and the specific cookies in use may change as the Services evolve.',
        'Essential Cookies',
        'These cookies are necessary for the Services to function and cannot be disabled through our platform without affecting core functionality. They are used for purposes such as:',
        'authentication and account access;',
        'security and fraud prevention;',
        'session management and load balancing.',
        'Functional Cookies',
        'These cookies help us remember choices you make and provide enhanced functionality. They may be used for:',
        'user preferences;',
        'interface and display settings;',
        'language or regional preferences where supported.',
        'Performance Cookies',
        'These cookies help us understand how the Services perform and identify technical issues. They may be used for:',
        'diagnostics and error monitoring;',
        'reliability testing;',
        'performance monitoring and service optimization.',
        'Analytics Cookies',
        'These cookies help us understand how users interact with the Services in aggregated or anonymized form so we can improve product design, usability, and reliability.',
        'Analytics providers used to support these functions may change over time as our operational needs evolve.',
        'Future Advertising Cookies',
        'StudioLayer AI currently does not use advertising cookies.',
        'If we introduce advertising cookies in the future:',
        'users will be notified as appropriate;',
        'this Cookie Policy will be updated;',
        'consent will be obtained where legally required before such cookies are activated.',
      ],
    },
    {
      id: 'managing-cookies',
      title: '4. Managing Cookies',
      paragraphs: [
        'You can control and manage cookies through your browser or device settings.',
        'Most browsers allow you to block cookies, delete existing cookies, or receive a warning before a cookie is stored. The method for doing so varies by browser and device.',
        'If you disable or delete certain cookies, some features of the Services may not function properly. For example, you may be unable to remain signed in or your preferences may not be saved.',
        'Where required by applicable law, we will provide additional cookie preference tools or consent mechanisms.',
      ],
    },
    {
      id: 'third-party-cookies',
      title: '5. Third-Party Cookies',
      paragraphs: [
        'Trusted third-party service providers may place cookies on your device while delivering services on our behalf, such as authentication, analytics, payment processing, infrastructure support, or communication services.',
        'These providers process information in accordance with their own privacy and cookie practices, subject to contractual requirements we impose where appropriate.',
        'We do not control third-party cookies directly. For more information about how personal information is handled in connection with the Services, please refer to our Privacy Policy.',
        'The third-party providers we use may change over time as our business and technology requirements evolve.',
      ],
    },
    {
      id: 'updates',
      title: '6. Updates to this Cookie Policy',
      paragraphs: [
        'We may update this Cookie Policy from time to time to reflect changes in technology, legal requirements, or our use of cookies and similar technologies.',
        'When we make changes, we will update the "Last Updated" date and, where appropriate, the version number and Effective Date shown at the top of this document.',
        'If changes are material, we may provide additional notice where required by applicable law.',
        'Your continued use of the Services after the updated Cookie Policy becomes effective constitutes your acceptance of the revised policy, except where applicable law requires a different form of consent.',
      ],
    },
    {
      id: 'contact',
      title: '7. Contact',
      paragraphs: [
        'If you have questions about this Cookie Policy or our use of cookies and similar technologies, please contact:',
        'StudioLayer AI',
        'Email: info@studiolayerai.com',
      ],
    },
  ],
};
