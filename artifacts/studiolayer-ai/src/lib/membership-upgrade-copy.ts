/**
 * Pure Basic → Pro upgrade UX copy (no network / path aliases).
 */

export function upgradeCardCopy(input: {
  immediate: boolean;
  pending: boolean;
  upgradePrice: string;
  renewalPrice: string;
  nextBillingLabel: string;
}): string {
  if (input.immediate) {
    if (input.pending) {
      return `Studio Pro is active. Your next renewal remains ${input.renewalPrice} on ${input.nextBillingLabel}.`;
    }
    return `Pay ${input.upgradePrice} today. Studio Pro begins immediately. Your remaining Studio Credits stay with you, and 120 more are added. Your next renewal is ${input.renewalPrice} on ${input.nextBillingLabel}.`;
  }
  if (input.pending) {
    return `Your Pro membership starts on your next billing date: ${input.nextBillingLabel}. Until then, your Studio Basic membership remains active.`;
  }
  return `Pay ${input.upgradePrice} today. Your Pro membership starts on your next billing date: ${input.nextBillingLabel}. Until then, your Studio Basic membership remains active.`;
}

/**
 * Checkout handler fired before StudioLayer webhook fulfillment may complete.
 * Immediate path must not claim Pro / +120 until membership state confirms it.
 */
export function upgradeSuccessToastCopy(input: {
  immediate: boolean;
  /** confirming = Checkout success; fulfilled = StudioLayer Pro + upgrade applied. */
  phase?: 'confirming' | 'fulfilled';
  nextBillingLabel: string;
}): { title: string; description: string } {
  if (input.immediate) {
    if (input.phase === 'fulfilled') {
      return {
        title: 'Payment received',
        description: `Studio Pro is now active. 120 Studio Credits have been added. Your next renewal stays on ${input.nextBillingLabel}.`,
      };
    }
    return {
      title: 'Payment received',
      description:
        'Your upgrade is being confirmed. Studio Pro and your additional 120 Studio Credits will appear once payment confirmation is complete.',
    };
  }
  return {
    title: 'Payment received',
    description:
      'Studio Pro will start on your next billing date once payment is confirmed. No Studio Credits are added today.',
  };
}

export function upgradeAlreadyActiveToastCopy(input: {
  immediate: boolean;
  renewalPrice: string;
  nextBillingLabel: string;
}): { title: string; description: string } {
  if (input.immediate) {
    return {
      title: 'Studio Pro is already active',
      description: `Your next renewal remains ${input.renewalPrice} on ${input.nextBillingLabel}.`,
    };
  }
  return {
    title: 'Upgrade already scheduled',
    description:
      'Studio Pro starts on your next billing date. Your Studio Basic membership remains active until then.',
  };
}

/** True when StudioLayer has applied immediate Pro after upgrade payment. */
export function isImmediateUpgradeFulfilled(status: {
  studioPlan: 'basic' | 'pro' | null;
  studioTier: 'pro' | 'enterprise' | null;
  pendingUpgradePlan: 'pro' | null;
} | null): boolean {
  if (!status) return false;
  if (status.studioPlan !== 'pro') return false;
  if (status.studioTier !== 'enterprise') return false;
  // pendingUpgradePlan may still be pro (Razorpay lag) or already cleared after sync.
  return true;
}
