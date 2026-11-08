export const ITEM_STATUSES = ['cooling', 'unlocked', 'purchased', 'dropped', 'expired'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ITEM_SOURCES = ['telegram', 'web'] as const;
export type ItemSource = (typeof ITEM_SOURCES)[number];

export const DECISIONS = ['purchased', 'dropped'] as const;
export type Decision = (typeof DECISIONS)[number];

/** Statuses that count toward "money saved". */
export const SAVED_STATUSES = ['dropped', 'expired'] as const satisfies readonly ItemStatus[];

/** Statuses an item can still be acted on in (and that block duplicate URLs). */
export const ACTIVE_STATUSES = ['cooling', 'unlocked'] as const satisfies readonly ItemStatus[];

/** Allowed manual transitions (scheduler-driven ones — unlock, expire — are not listed). PRD §3 */
export const ALLOWED_DECISIONS: Record<ItemStatus, readonly Decision[]> = {
  cooling: ['dropped', 'purchased'], // purchased here = "bought anyway" (broke_cooldown)
  unlocked: ['purchased', 'dropped'],
  expired: ['purchased', 'dropped'],
  purchased: [],
  dropped: [],
};

export function canDecide(from: ItemStatus, decision: Decision): boolean {
  return ALLOWED_DECISIONS[from].includes(decision);
}
