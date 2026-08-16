export interface Money {
  currency: string; // e.g., 'USD'
  value: string;   // formatted e.g. '150.00'
  cents: number;   // integer minor units, e.g. 15000
}

export interface ServiceDefinition {
  id: string;
  name: string;
  description: string;
  feeCents: number;
  currency: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  username?: string;
  email: string;
  payoutEmail: string;
  paypalMeHandle?: string;
  facetimeHandle: string;
  active: boolean;
  services: ServiceDefinition[];
}

export interface Gate {
  id: string;
  providerId: string;
  name?: string;
  token: string;
  active: boolean;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  role: 'admin' | 'provider';
  providerId?: string;
  createdAt: string;
  expiresAt: string;
}

export type OrderStatus =
  | 'created'
  | 'payment_pending'
  | 'paid'
  | 'settlement_pending'
  | 'settled'
  | 'manual_review'
  | 'cancelled';

export type PaymentStatus =
  | 'created'
  | 'pending'
  | 'approved'
  | 'captured'
  | 'failed'
  | 'refunded';

export interface Order {
  id: string;
  providerId: string;
  serviceId: string;
  gateId?: string;
  serviceName: string;
  amountCents: number;
  currency: string;
  status: OrderStatus;
  paypalOrderId?: string;
  paypalCaptureId?: string;
  clientIp?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  orderId: string;
  paypalOrderId: string;
  paypalCaptureId?: string;
  payerEmail?: string;
  payerName?: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  timestamp: string;
  verifiedServerSide: boolean;
}

export interface Settlement {
  orderId: string;
  grossCents: number;
  providerCents: number; // 85%
  agentCents: number;    // 15% (remainder, 0-drift)
  currency: string;
  status: 'pending' | 'settled' | 'hold_for_review';
  timestamp: string;
}

export interface Payout {
  payoutId: string; // e.g., GK-{orderId}-PROVIDER
  orderId: string;
  recipientEmail: string;
  amountCents: number;
  currency: string;
  status: 'pending' | 'submitted' | 'completed' | 'failed';
  paypalBatchId?: string;
  timestamp: string;
}

export type EntitlementStatus =
  | 'issued'
  | 'active'
  | 'redeemed'
  | 'expired'
  | 'revoked';

export interface Entitlement {
  token: string;
  orderId: string;
  providerId: string;
  status: EntitlementStatus;
  createdAt: string;
  expiresAt: string;
  redeemedAt?: string;
  revokedAt?: string;
  facetimeDeliveryInstruction: string;
  qrDataUrl?: string;
}

export type AuditEventType =
  | 'ORDER_CREATED'
  | 'PAYMENT_CREATED'
  | 'PAYMENT_VERIFIED'
  | 'PAYMENT_FAILED'
  | 'SETTLEMENT_CREATED'
  | 'PAYOUT_REQUESTED'
  | 'PAYOUT_SUCCEEDED'
  | 'PAYOUT_FAILED'
  | 'ENTITLEMENT_CREATED'
  | 'ENTITLEMENT_REDEEMED'
  | 'ENTITLEMENT_REVOKED'
  | 'ENTITLEMENT_EXPIRED'
  | 'MANUAL_REVIEW_OPENED'
  | 'ESCROW_ACCESSED'
  | 'ESCROW_EXPIRED';

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  operator: string;
  details: Record<string, any>;
  ticketCode?: string;
}

export interface EscrowSession {
  ticketCode: string;
  operator: string;
  reason: string;
  issuedAt: string;
  expiresAt: string;
  active: boolean;
  orderId: string;
  maskedClientEmail: string;
  unmaskedClientEmail?: string;
  providerEmail: string;
}

export interface SystemOverview {
  provider: ProviderConfig;
  orders: Order[];
  settlements: Settlement[];
  payouts: Payout[];
  auditEvents: AuditEvent[];
  manualReviewQueue: Order[];
  totalGrossCents: number;
  totalProviderCents: number;
  totalAgentCents: number;
}
