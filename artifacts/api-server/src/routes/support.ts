import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, supportTicketsTable, usersTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/support-tickets", async (req, res): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { message } = req.body;
  if (!message || typeof message !== "string" || message.trim().length < 10) {
    res.status(400).json({ error: "Message must be at least 10 characters." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const [ticket] = await db
    .insert(supportTicketsTable)
    .values({
      userId,
      userEmail: user.email,
      message: message.trim(),
    })
    .returning();

  // Log for admin visibility — wire an email provider (e.g. Resend, SendGrid)
  // to ADMIN_EMAIL env var to send real notifications.
  logger.info(
    {
      ticketId: ticket.id,
      userEmail: ticket.userEmail,
      message: ticket.message,
      submittedAt: ticket.createdAt,
    },
    "NEW SUPPORT TICKET SUBMITTED",
  );

  res.status(201).json(ticket);
});

export default router;
