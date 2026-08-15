/**
 * Zero-balance pre-action block copy (P0 Studio Credit block).
 * Used when an action is refused before it starts — never implies a credit was spent.
 */

export type StudioCreditBlockToast = {
  title: string;
  description: string;
};

/**
 * Toast when Studio Credits remaining are zero and the user attempted an action.
 * Does not claim refund, partial creation, or payment failure.
 */
export function zeroStudioCreditBlockToast(): StudioCreditBlockToast {
  return {
    title: 'No Studio Credits remaining.',
    description: "This action wasn't started. View Membership to continue.",
  };
}
