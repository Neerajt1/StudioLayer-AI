-- Scheduled Basic → Pro via a separate future-start Pro subscription.
-- Distinct from the removed ₹3,000 upgrade-difference Order flow.

ALTER TABLE studio_razorpay_subscriptions
  ADD COLUMN IF NOT EXISTS schedule_kind TEXT,
  ADD COLUMN IF NOT EXISTS linked_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_cycle_end_requested BOOLEAN NOT NULL DEFAULT FALSE;
