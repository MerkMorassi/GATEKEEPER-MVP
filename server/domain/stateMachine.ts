import { OrderStatus, EntitlementStatus } from '../../src/types/index.js';

export const ALLOWED_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  created: ['payment_pending', 'cancelled'],
  payment_pending: ['paid', 'manual_review', 'cancelled'],
  paid: ['settlement_pending', 'settled', 'manual_review'],
  settlement_pending: ['settled', 'manual_review'],
  settled: [],
  manual_review: ['paid', 'settled', 'cancelled'],
  cancelled: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export const ALLOWED_ENTITLEMENT_TRANSITIONS: Record<EntitlementStatus, EntitlementStatus[]> = {
  issued: ['active', 'revoked', 'expired'],
  active: ['redeemed', 'expired', 'revoked'],
  redeemed: [], // Immutable after redemption (single-use access)
  expired: [],
  revoked: [],
};

export function canTransitionEntitlement(from: EntitlementStatus, to: EntitlementStatus): boolean {
  return ALLOWED_ENTITLEMENT_TRANSITIONS[from]?.includes(to) ?? false;
}
