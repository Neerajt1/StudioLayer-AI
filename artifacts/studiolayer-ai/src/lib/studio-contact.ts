export const STUDIO_CONTACT_EMAIL = 'info@studiolayerai.com';

export const STUDIO_CONTACT_MAILTO = `mailto:${STUDIO_CONTACT_EMAIL}`;

export const STUDIO_ERROR_CONTACT_HELPER = `Still having trouble? Contact us at ${STUDIO_CONTACT_EMAIL}.`;

/** Appended to generation and download failure messages. */
export function withErrorContactHelper(message: string): string {
  if (!message) return STUDIO_ERROR_CONTACT_HELPER;
  return `${message}\n\n${STUDIO_ERROR_CONTACT_HELPER}`;
}
