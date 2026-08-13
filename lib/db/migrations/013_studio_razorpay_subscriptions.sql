-- Razorpay membership subscriptions + webhook idempotency (Test Mode foundation)
-- Do NOT alter Stripe columns on users.

CREATE TABLE IF NOT EXISTS studio_razorpay_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  razorpay_subscription_id TEXT NOT NULL,
  razorpay_plan_id TEXT NOT NULL,
  studio_plan TEXT NOT NULL,
  studio_tier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  current_start TIMESTAMPTZ,
  current_end TIMESTAMPTZ,
  razorpay_customer_id TEXT,
  latest_payment_id TEXT,
  latest_invoice_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS studio_razorpay_subscriptions_rzp_sub_uidx
  ON studio_razorpay_subscriptions (razorpay_subscription_id);

CREATE INDEX IF NOT EXISTS studio_razorpay_subscriptions_user_status_idx
  ON studio_razorpay_subscriptions (user_id, status);

CREATE INDEX IF NOT EXISTS studio_razorpay_subscriptions_user_plan_idx
  ON studio_razorpay_subscriptions (user_id, studio_plan);

CREATE TABLE IF NOT EXISTS studio_razorpay_webhook_events (
  id SERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  razorpay_subscription_id TEXT,
  razorpay_payment_id TEXT,
  processing_status TEXT NOT NULL DEFAULT 'processed',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS studio_razorpay_webhook_events_event_id_uidx
  ON studio_razorpay_webhook_events (event_id);

CREATE INDEX IF NOT EXISTS studio_razorpay_webhook_events_subscription_idx
  ON studio_razorpay_webhook_events (razorpay_subscription_id);
