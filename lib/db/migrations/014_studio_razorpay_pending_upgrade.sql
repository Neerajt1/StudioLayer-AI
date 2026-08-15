-- Pending Basic → Pro next-cycle upgrade (Razorpay schedule_change_at = cycle_end).
-- Fixed upgrade-difference is charged via one-time Order; plan changes at cycle_end.
-- Does not change credit quantities or create a second subscription.

ALTER TABLE studio_razorpay_subscriptions
  ADD COLUMN IF NOT EXISTS pending_upgrade_plan TEXT,
  ADD COLUMN IF NOT EXISTS pending_razorpay_plan_id TEXT,
  ADD COLUMN IF NOT EXISTS pending_upgrade_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_upgrade_payment_id TEXT;
