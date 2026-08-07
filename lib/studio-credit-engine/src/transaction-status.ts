/** Lifecycle statuses for Studio Credit transactions. */
export const StudioCreditTransactionStatus = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;

export type StudioCreditTransactionStatusValue =
  (typeof StudioCreditTransactionStatus)[keyof typeof StudioCreditTransactionStatus];
