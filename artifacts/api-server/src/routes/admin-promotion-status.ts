export type PromotionLifecycleStatus = "scheduled" | "active" | "expired";

export function computePromotionLifecycleStatus(input: {
  startAt: Date;
  endAt: Date;
  now?: Date;
}): PromotionLifecycleStatus {
  const now = input.now ?? new Date();
  if (now.getTime() > input.endAt.getTime()) return "expired";
  if (now.getTime() < input.startAt.getTime()) return "scheduled";
  return "active";
}
