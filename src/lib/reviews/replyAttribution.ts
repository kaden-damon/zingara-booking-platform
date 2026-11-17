type StaffName = { full_name: string | null };

type ReplyAttribution = {
  sent_at: string | null;
  staff: StaffName | StaffName[] | null;
};

export function currentReplyName<T extends string | null>(
  snapshot: T,
  reply?: ReplyAttribution,
): string | T {
  const staff = reply?.staff;
  const profile = Array.isArray(staff) ? (staff.length === 1 ? staff[0] : null) : staff;
  return profile?.full_name?.trim() || snapshot;
}

export function currentLatestReplyName(
  snapshot: string | null,
  repliedAt: string | null,
  latest?: ReplyAttribution,
) {
  // Both values are written together. Do not attribute an unmatched legacy badge.
  return repliedAt && latest?.sent_at === repliedAt
    ? currentReplyName(snapshot, latest)
    : snapshot;
}

export function displayReply<T extends ReplyAttribution & { actor_name: string }>(
  { staff, ...reply }: T,
) {
  return { ...reply, actor_name: currentReplyName(reply.actor_name, { sent_at: reply.sent_at, staff }) };
}
