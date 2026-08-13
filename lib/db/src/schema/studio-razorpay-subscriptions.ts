import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Razorpay recurring membership subscriptions (Studio Basic / Pro). */
export const studioRazorpaySubscriptionsTable = pgTable(
  "studio_razorpay_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    razorpaySubscriptionId: text("razorpay_subscription_id").notNull(),
    razorpayPlanId: text("razorpay_plan_id").notNull(),
    studioPlan: text("studio_plan").notNull(),
    studioTier: text("studio_tier").notNull(),
    status: text("status").notNull().default("created"),
    currentStart: timestamp("current_start", { withTimezone: true }),
    currentEnd: timestamp("current_end", { withTimezone: true }),
    razorpayCustomerId: text("razorpay_customer_id"),
    latestPaymentId: text("latest_payment_id"),
    latestInvoiceId: text("latest_invoice_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("studio_razorpay_subscriptions_rzp_sub_uidx").on(
      table.razorpaySubscriptionId,
    ),
    index("studio_razorpay_subscriptions_user_status_idx").on(
      table.userId,
      table.status,
    ),
    index("studio_razorpay_subscriptions_user_plan_idx").on(
      table.userId,
      table.studioPlan,
    ),
  ],
);

export type StudioRazorpaySubscription =
  typeof studioRazorpaySubscriptionsTable.$inferSelect;
export type NewStudioRazorpaySubscription =
  typeof studioRazorpaySubscriptionsTable.$inferInsert;

/** Idempotency ledger for Razorpay webhook deliveries. */
export const studioRazorpayWebhookEventsTable = pgTable(
  "studio_razorpay_webhook_events",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    razorpaySubscriptionId: text("razorpay_subscription_id"),
    razorpayPaymentId: text("razorpay_payment_id"),
    processingStatus: text("processing_status").notNull().default("processed"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("studio_razorpay_webhook_events_event_id_uidx").on(
      table.eventId,
    ),
    index("studio_razorpay_webhook_events_subscription_idx").on(
      table.razorpaySubscriptionId,
    ),
  ],
);

export type StudioRazorpayWebhookEvent =
  typeof studioRazorpayWebhookEventsTable.$inferSelect;
export type NewStudioRazorpayWebhookEvent =
  typeof studioRazorpayWebhookEventsTable.$inferInsert;
