import fs from 'fs';
import path from 'path';
import {
  ProviderConfig,
  Order,
  PaymentRecord,
  Settlement,
  Payout,
  Entitlement,
  AuditEvent,
  EscrowSession,
  Gate,
  AuthSession,
} from '../src/types/index.js';

const DATA_DIR = process.env.DATA_DIR || process.cwd();
const DATA_FILE = path.join(DATA_DIR, 'gatekeeper_db.json');
const TEMP_FILE = path.join(DATA_DIR, 'gatekeeper_db.json.tmp');

interface Schema {
  provider: ProviderConfig;
  orders: Record<string, Order>;
  payments: Record<string, PaymentRecord>;
  settlements: Record<string, Settlement>;
  payouts: Record<string, Payout>;
  entitlements: Record<string, Entitlement>;
  auditEvents: AuditEvent[];
  escrowSessions: Record<string, EscrowSession>;
  gates: Record<string, Gate>;
  authSessions: Record<string, AuthSession>;
}

const DEFAULT_GATE: Gate = {
  id: 'gate_default_001',
  providerId: 'prov_merk_001',
  name: 'Primary Consultation Gate',
  token: 'merk_consultation_gate',
  active: true,
  createdAt: '2026-08-16T00:00:00.000Z',
};

const DEFAULT_PROVIDER: ProviderConfig = {
  id: 'prov_merk_001',
  name: 'Merk Morassi',
  email: 'merk@merkmorassi.com',
  payoutEmail: 'merk.payouts@merkmorassi.com',
  facetimeHandle: 'https://facetime.apple.com/join#v=1&p=1z501Y06EfGVyAKrTEhpjw&k=WHqbRARgturVWBiqJXvErxiSLSIRd6-GyoXhqvN6Sfs&l=MERK%20MORASSI',
  active: true,
  services: [
    {
      id: 'srv_1',
      name: '1-on-1 Confidential Consultation',
      description: '30 Minutes Direct 1-on-1 Confidential Consultation Session with Merk Morassi.',
      feeCents: 15000,
      currency: 'USD'
    }
  ]
};

/**
 * Event-loop & process-level async lock manager for atomic operations
 */
export class AsyncLockManager {
  private locks = new Map<string, Promise<void>>();

  async acquire<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    let resolver: () => void;
    const promise = new Promise<void>((res) => {
      resolver = res;
    });
    this.locks.set(key, promise);

    try {
      return await fn();
    } finally {
      this.locks.delete(key);
      resolver!();
    }
  }
}

export const lockManager = new AsyncLockManager();

class Database {
  private data: Schema;

  constructor() {
    this.data = this.load();
  }

  private load(): Schema {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      try {
        const parsed = JSON.parse(raw);
        const mergedProvider = {
          ...DEFAULT_PROVIDER,
          ...(parsed.provider || {}),
        };
        // Ensure services array exists for backward compatibility
        if (!mergedProvider.services || !Array.isArray(mergedProvider.services)) {
          mergedProvider.services = DEFAULT_PROVIDER.services;
        }

        const gates = parsed.gates || {};
        if (Object.keys(gates).length === 0) {
          gates[DEFAULT_GATE.id] = DEFAULT_GATE;
        }

        return {
          provider: mergedProvider,
          orders: parsed.orders || {},
          payments: parsed.payments || {},
          settlements: parsed.settlements || {},
          payouts: parsed.payouts || {},
          entitlements: parsed.entitlements || {},
          auditEvents: parsed.auditEvents || [],
          escrowSessions: parsed.escrowSessions || {},
          gates,
          authSessions: parsed.authSessions || {}
        };
      } catch (e: any) {
        // G8: Database corruption MUST fail closed rather than resetting data silently!
        console.error('CRITICAL: Database corruption detected in gatekeeper_db.json:', e.message);
        throw new Error(`CRITICAL_DATABASE_CORRUPTION: Failed to parse ${DATA_FILE}. Process halted to prevent data loss.`);
      }
    }

    const initial: Schema = {
      provider: DEFAULT_PROVIDER,
      orders: {},
      payments: {},
      settlements: {},
      payouts: {},
      entitlements: {},
      auditEvents: [],
      escrowSessions: {},
      gates: {
        [DEFAULT_GATE.id]: DEFAULT_GATE,
      },
      authSessions: {},
    };
    this.saveData(initial);
    return initial;
  }

  private saveData(data: Schema = this.data): void {
    try {
      // G8: Atomic file write using temp file and atomic rename
      const payload = JSON.stringify(data, null, 2);
      fs.writeFileSync(TEMP_FILE, payload, 'utf-8');
      fs.renameSync(TEMP_FILE, DATA_FILE);
    } catch (e) {
      console.error('Failed to write db file atomically:', e);
      throw e;
    }
  }

  // Provider
  getProvider(): ProviderConfig {
    return { ...this.data.provider };
  }

  updateProvider(updates: Partial<ProviderConfig>): ProviderConfig {
    this.data.provider = { ...this.data.provider, ...updates };
    this.saveData();
    return this.getProvider();
  }

  // Orders
  saveOrder(order: Order): Order {
    this.data.orders[order.id] = order;
    this.saveData();
    return order;
  }

  getOrder(id: string): Order | undefined {
    return this.data.orders[id];
  }

  getAllOrders(): Order[] {
    return Object.values(this.data.orders).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // Payments
  savePayment(payment: PaymentRecord): PaymentRecord {
    this.data.payments[payment.orderId] = payment;
    this.saveData();
    return payment;
  }

  getPayment(orderId: string): PaymentRecord | undefined {
    return this.data.payments[orderId];
  }

  // Settlements
  saveSettlement(settlement: Settlement): Settlement {
    this.data.settlements[settlement.orderId] = settlement;
    this.saveData();
    return settlement;
  }

  getSettlement(orderId: string): Settlement | undefined {
    return this.data.settlements[orderId];
  }

  getAllSettlements(): Settlement[] {
    return Object.values(this.data.settlements).sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  // Payouts
  savePayout(payout: Payout): Payout {
    this.data.payouts[payout.payoutId] = payout;
    this.saveData();
    return payout;
  }

  getPayout(payoutId: string): Payout | undefined {
    return this.data.payouts[payoutId];
  }

  getAllPayouts(): Payout[] {
    return Object.values(this.data.payouts).sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  // Entitlements
  saveEntitlement(entitlement: Entitlement): Entitlement {
    this.data.entitlements[entitlement.token] = entitlement;
    this.saveData();
    return entitlement;
  }

  getEntitlement(token: string): Entitlement | undefined {
    return this.data.entitlements[token];
  }

  getEntitlementByOrderId(orderId: string): Entitlement | undefined {
    return Object.values(this.data.entitlements).find((e) => e.orderId === orderId);
  }

  // Audit Events
  logAuditEvent(eventType: AuditEvent['eventType'], operator: string, details: Record<string, any>, ticketCode?: string): AuditEvent {
    const event: AuditEvent = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      eventType,
      operator,
      details,
      ticketCode,
    };
    this.data.auditEvents.unshift(event);
    this.saveData();
    return event;
  }

  getAuditEvents(): AuditEvent[] {
    return [...this.data.auditEvents];
  }

  // Escrow Sessions
  saveEscrowSession(session: EscrowSession): EscrowSession {
    this.data.escrowSessions[session.ticketCode] = session;
    this.saveData();
    return session;
  }

  getEscrowSession(ticketCode: string): EscrowSession | undefined {
    return this.data.escrowSessions[ticketCode];
  }

  // Gates
  saveGate(gate: Gate): Gate {
    this.data.gates[gate.id] = gate;
    this.saveData();
    return gate;
  }

  getGate(id: string): Gate | undefined {
    return this.data.gates[id];
  }

  getGateByToken(token: string): Gate | undefined {
    return Object.values(this.data.gates).find(g => g.token === token);
  }

  getAllGates(): Gate[] {
    return Object.values(this.data.gates).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  deleteGate(id: string): boolean {
    if (this.data.gates[id]) {
      delete this.data.gates[id];
      this.saveData();
      return true;
    }
    return false;
  }

  // Auth Sessions
  saveAuthSession(session: AuthSession): AuthSession {
    this.data.authSessions[session.token] = session;
    this.saveData();
    return session;
  }

  getAuthSession(token: string): AuthSession | undefined {
    return this.data.authSessions[token];
  }

  deleteAuthSession(token: string): void {
    if (this.data.authSessions[token]) {
      delete this.data.authSessions[token];
      this.saveData();
    }
  }
}

export const db = new Database();
