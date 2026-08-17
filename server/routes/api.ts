import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { db, lockManager } from '../db.js';
import { calculateSettlement } from '../domain/money.js';
import { paypalService } from '../paypal/client.js';
import { createEntitlement, generateOpaqueToken } from '../domain/access.js';
import { Order, PaymentRecord, EscrowSession, AuthSession, Gate } from '../../src/types/index.js';

export const apiRouter = Router();

const ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').trim();
const ADMIN_KEY = (process.env.ADMIN_SECRET_KEY || 'gk_admin_secret_dev_2026').trim();
const PROVIDER_USERNAME = (process.env.PROVIDER_USERNAME || 'provider').trim();
const PROVIDER_PASSPHRASE = (process.env.PROVIDER_PASSPHRASE || 'gk_provider_passphrase_dev_2026').trim();

/**
 * Validates either X-Admin-Key header (for legacy/tests) or a valid session cookie
 */
function requireAdminAuth(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers['x-admin-key'] || req.headers['authorization'];
  let providedKey = '';
  if (typeof authHeader === 'string') {
    providedKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  }

  if (providedKey && providedKey === ADMIN_KEY) {
    return next();
  }

  const sessionToken = req.cookies?.gk_session;
  if (sessionToken) {
    const session = db.getAuthSession(sessionToken);
    if (session && session.role === 'admin' && new Date(session.expiresAt).getTime() > Date.now()) {
      return next();
    }
  }

  return res.status(401).json({
    success: false,
    error: 'Unauthorized: Valid X-Admin-Key or active Admin session required.',
  });
}

function requireProviderAuth(req: Request, res: Response, next: () => void) {
  const sessionToken = req.cookies?.gk_session;
  if (sessionToken) {
    const session = db.getAuthSession(sessionToken);
    if (session && session.role === 'provider' && new Date(session.expiresAt).getTime() > Date.now()) {
      return next();
    }
  }

  return res.status(401).json({
    success: false,
    error: 'Unauthorized: Active Provider session required.',
  });
}

// 0. Auth Routes
apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const { username, passphrase } = req.body;
  
  // Generic delay to resist timing attacks slightly
  setTimeout(() => {
    if (username && username.trim().toLowerCase() === 'client') {
      return res.json({ success: true, role: 'client' });
    }

    let role: 'admin' | 'provider' | null = null;
    let providerId: string | undefined;

    if (username === ADMIN_USERNAME && passphrase === ADMIN_KEY) {
      role = 'admin';
    } else if (username === PROVIDER_USERNAME && passphrase === PROVIDER_PASSPHRASE) {
      role = 'provider';
      providerId = db.getProvider().id;
    }

    if (!role) {
      return res.status(401).json({ success: false, error: 'Invalid credentials. Use "client", "provider", or "admin" credentials.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const session: AuthSession = {
      token,
      role,
      providerId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours
    };

    db.saveAuthSession(session);

    res.cookie('gk_session', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 12 * 60 * 60 * 1000,
    });

    res.json({ success: true, role });
  }, Math.random() * 200 + 100);
});

apiRouter.get('/auth/session', (req: Request, res: Response) => {
  const token = req.cookies?.gk_session;
  if (!token) return res.json({ success: true, role: null });

  const session = db.getAuthSession(token);
  if (session && new Date(session.expiresAt).getTime() > Date.now()) {
    res.json({ success: true, role: session.role });
  } else {
    res.json({ success: true, role: null });
  }
});

apiRouter.post('/auth/logout', (req: Request, res: Response) => {
  const token = req.cookies?.gk_session;
  if (token) {
    db.deleteAuthSession(token);
  }
  res.clearCookie('gk_session', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });
  res.json({ success: true });
});

// 1. Get Public Configuration
apiRouter.get('/config', (req: Request, res: Response) => {
  const provider = db.getProvider();
  res.json({
    success: true,
    provider: {
      id: provider.id,
      name: provider.name,
      active: provider.active,
      services: provider.services || [],
      // For backwards compatibility with older tests, provide the first service details if available
      serviceName: provider.services?.[0]?.name || 'Service',
      serviceDescription: provider.services?.[0]?.description || '',
      feeCents: provider.services?.[0]?.feeCents || 15000,
      currency: provider.services?.[0]?.currency || 'USD',
      payoutEmailConfigured: Boolean(provider.payoutEmail),
    },
  });
});

// Download full source archive endpoint
apiRouter.get('/download-source', (req: Request, res: Response) => {
  const archivePath = path.join(process.cwd(), 'public', 'gatekeeper-source.tar.gz');
  if (fs.existsSync(archivePath)) {
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', 'attachment; filename="gatekeeper-source.tar.gz"');
    res.sendFile(archivePath);
  } else {
    res.status(404).json({ success: false, error: 'Source archive not ready.' });
  }
});

// 1a. Gate Resolution
apiRouter.get('/gates/:token', (req: Request, res: Response) => {
  const gate = db.getGateByToken(req.params.token);
  if (!gate || !gate.active) {
    return res.status(404).json({ success: false, error: 'Gate not found or inactive.' });
  }
  const provider = db.getProvider();
  if (provider.id !== gate.providerId || !provider.active) {
    return res.status(403).json({ success: false, error: 'Provider is currently offline.' });
  }

  res.json({
    success: true,
    gate: {
      id: gate.id,
      name: gate.name,
      providerName: provider.name,
      services: provider.services,
    }
  });
});

// 1b. Gate Creation (Provider Only)
apiRouter.post('/gates/create', requireProviderAuth, (req: Request, res: Response) => {
  const { name } = req.body;
  const provider = db.getProvider();

  const gate: Gate = {
    id: `gate_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    providerId: provider.id,
    name: name || `Marketing Link ${db.getAllGates().length + 1}`,
    token: generateOpaqueToken(),
    active: true,
    createdAt: new Date().toISOString(),
  };

  db.saveGate(gate);
  res.json({ success: true, gateToken: gate.token });
});

// 1c. Gate Update (Provider Only)
apiRouter.post('/gates/:id/update', requireProviderAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, active } = req.body;
  const provider = db.getProvider();

  const gate = db.getGate(id);
  if (!gate) {
    return res.status(404).json({ success: false, error: 'Gate not found.' });
  }
  if (gate.providerId !== provider.id) {
    return res.status(403).json({ success: false, error: 'Gate provider mismatch.' });
  }

  if (name !== undefined) gate.name = String(name).trim();
  if (active !== undefined) gate.active = Boolean(active);

  db.saveGate(gate);
  db.logAuditEvent('GATE_UPDATED' as any, 'provider', { gateId: gate.id, name: gate.name, active: gate.active });
  res.json({ success: true, gate });
});

// 1d. Gate Delete (Provider Only)
const handleDeleteGateRoute = (req: Request, res: Response) => {
  const { id } = req.params;
  const provider = db.getProvider();

  const gate = db.getGate(id);
  if (!gate) {
    return res.status(404).json({ success: false, error: 'Gate not found.' });
  }
  if (gate.providerId !== provider.id) {
    return res.status(403).json({ success: false, error: 'Gate provider mismatch.' });
  }

  db.deleteGate(id);
  db.logAuditEvent('GATE_DELETED' as any, 'provider', { gateId: id });
  res.json({ success: true, message: 'Marketing Gate deleted successfully.' });
};

apiRouter.delete('/gates/:id', requireProviderAuth, handleDeleteGateRoute);
apiRouter.post('/gates/:id/delete', requireProviderAuth, handleDeleteGateRoute);

// 2. Create Order (MUST be derived from Gate!)
apiRouter.post('/orders/create', (req: Request, res: Response) => {
  try {
    // Determine context: did they provide a gateToken?
    // If not, we fallback to the first service for legacy MVP-1 tests compatibility
    let provider = db.getProvider();
    if (!provider.active) {
      return res.status(403).json({ success: false, error: 'Provider service is currently offline or inactive.' });
    }

    const { gateToken, serviceId } = req.body;
    let gateId: string | undefined;
    
    // Validate Gate
    if (gateToken) {
      const gate = db.getGateByToken(gateToken);
      if (!gate || !gate.active) {
        return res.status(404).json({ success: false, error: 'Invalid or inactive gate token.' });
      }
      if (gate.providerId !== provider.id) {
         return res.status(403).json({ success: false, error: 'Gate provider mismatch.' });
      }
      gateId = gate.id;
    }

    // Validate Service
    let service = provider.services[0]; // fallback
    if (serviceId) {
      const foundService = provider.services.find(s => s.id === serviceId);
      if (!foundService) {
        return res.status(404).json({ success: false, error: 'Selected service tier not found.' });
      }
      service = foundService;
    }

    const orderId = `gk_ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const order: Order = {
      id: orderId,
      providerId: provider.id,
      serviceId: service.id,
      gateId,
      serviceName: service.name,
      amountCents: service.feeCents,
      currency: service.currency,
      status: 'created',
      clientIp: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveOrder(order);
    db.logAuditEvent('ORDER_CREATED', 'client', { orderId, amountCents: order.amountCents, gateId });

    res.json({
      success: true,
      order,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Verify Payment & Execute 85/15 Settlement + Provider Payout + Entitlement QR Generation
apiRouter.post('/payments/verify', async (req: Request, res: Response) => {
  try {
    const { orderId, paypalOrderId } = req.body;

    if (!orderId || !paypalOrderId) {
      return res.status(400).json({ success: false, error: 'Missing orderId or paypalOrderId' });
    }

    // G5: Acquire process-level lock by orderId to prevent concurrent payment verification race conditions
    return await lockManager.acquire(`order:${orderId}`, async () => {
      const order = db.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }

      // Idempotency check: if already paid or settled, return existing entitlement
      if (order.status === 'paid' || order.status === 'settled') {
        const existingEntitlement = db.getEntitlementByOrderId(orderId);
        const existingSettlement = db.getSettlement(orderId);
        return res.json({
          success: true,
          order,
          settlement: existingSettlement,
          entitlement: existingEntitlement,
          message: 'Order was already verified and processed (Idempotent response).',
        });
      }

      const provider = db.getProvider();

      // Server-authoritative PayPal Verification
      db.logAuditEvent('PAYMENT_CREATED', 'client', { orderId, paypalOrderId });
      const captureResult = await paypalService.verifyAndCaptureOrder(paypalOrderId, order.amountCents);

      if (!captureResult.success) {
        order.status = 'manual_review';
        order.updatedAt = new Date().toISOString();
        db.saveOrder(order);
        db.logAuditEvent('PAYMENT_FAILED', 'paypal', { orderId, paypalOrderId, reason: 'Capture failed' });
        db.logAuditEvent('MANUAL_REVIEW_OPENED', 'system', { orderId, reason: 'Payment verification failed' });
        return res.status(402).json({
          success: false,
          error: 'Payment verification failed. Transaction placed under Manual Review.',
          order,
        });
      }

      // Amount match check
      if (captureResult.amountCents < order.amountCents) {
        order.status = 'manual_review';
        order.updatedAt = new Date().toISOString();
        db.saveOrder(order);
        db.logAuditEvent('MANUAL_REVIEW_OPENED', 'system', {
          orderId,
          reason: `Amount mismatch: expected ${order.amountCents}, got ${captureResult.amountCents}`,
        });
        return res.status(400).json({
          success: false,
          error: 'Payment amount mismatch. Placed under Manual Review.',
          order,
        });
      }

      // 1. Record Payment
      const paymentRecord: PaymentRecord = {
        orderId,
        paypalOrderId,
        paypalCaptureId: captureResult.captureId,
        payerEmail: captureResult.payerEmail,
        payerName: captureResult.payerName,
        amountCents: captureResult.amountCents,
        currency: captureResult.currency,
        status: 'captured',
        timestamp: new Date().toISOString(),
        verifiedServerSide: true,
      };
      db.savePayment(paymentRecord);
      db.logAuditEvent('PAYMENT_VERIFIED', 'paypal_server', { orderId, paypalCaptureId: captureResult.captureId });

      // 2. Mark Order Paid
      order.status = 'paid';
      order.paypalOrderId = paypalOrderId;
      order.paypalCaptureId = captureResult.captureId;
      order.updatedAt = new Date().toISOString();
      db.saveOrder(order);

      // 3. Calculate Deterministic 85/15 Settlement
      const settlement = calculateSettlement(orderId, order.amountCents, order.currency);
      db.saveSettlement(settlement);
      db.logAuditEvent('SETTLEMENT_CREATED', 'system', {
        orderId,
        grossCents: settlement.grossCents,
        providerCents: settlement.providerCents, // 85%
        agentCents: settlement.agentCents,       // 15%
      });

      // 4. Initiate Provider Payout (GK-{orderId}-PROVIDER)
      db.logAuditEvent('PAYOUT_REQUESTED', 'system', {
        orderId,
        payoutId: `GK-${orderId}-PROVIDER`,
        recipientEmail: provider.payoutEmail,
        amountCents: settlement.providerCents,
      });

      const payoutResult = await paypalService.executeProviderPayout(
        orderId,
        provider.payoutEmail,
        settlement.providerCents,
        order.currency
      );

      db.savePayout({
        payoutId: payoutResult.payoutId,
        orderId,
        recipientEmail: provider.payoutEmail,
        amountCents: settlement.providerCents,
        currency: order.currency,
        status: payoutResult.success ? 'completed' : 'failed',
        paypalBatchId: payoutResult.batchId,
        timestamp: new Date().toISOString(),
      });

      if (payoutResult.success) {
        db.logAuditEvent('PAYOUT_SUCCEEDED', 'paypal_payouts', {
          orderId,
          payoutId: payoutResult.payoutId,
          batchId: payoutResult.batchId,
        });
        order.status = 'settled';
        order.updatedAt = new Date().toISOString();
        db.saveOrder(order);
      } else {
        db.logAuditEvent('PAYOUT_FAILED', 'paypal_payouts', {
          orderId,
          payoutId: payoutResult.payoutId,
          error: payoutResult.error,
        });
      }

      // 5. Issue Entitlement & Disposable Access Token + QR Code
      const rawHost = req.headers.host || 'localhost:3000';
      const safeHost = rawHost.replace(/[^a-zA-Z0-9.:-]/g, '');
      const appUrl = (process.env.APP_URL || `http://${safeHost}`).trim();
      const entitlement = await createEntitlement(
        orderId,
        provider.id,
        provider.facetimeHandle,
        appUrl
      );

      db.saveEntitlement(entitlement);
      db.logAuditEvent('ENTITLEMENT_CREATED', 'system', {
        orderId,
        token: entitlement.token,
        expiresAt: entitlement.expiresAt,
      });

      return res.json({
        success: true,
        order,
        paymentRecord,
        settlement,
        entitlement,
      });
    });
  } catch (err: any) {
    console.error('Payment verification error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Get Entitlement Info by Token
apiRouter.get('/access/:token', (req: Request, res: Response) => {
  const { token } = req.params;
  const entitlement = db.getEntitlement(token);

  if (!entitlement) {
    return res.status(404).json({ success: false, error: 'Access credential not found or invalid' });
  }

  // Check expiration
  if (new Date(entitlement.expiresAt).getTime() < Date.now() && entitlement.status === 'active') {
    entitlement.status = 'expired';
    db.saveEntitlement(entitlement);
    db.logAuditEvent('ENTITLEMENT_EXPIRED', 'system', { token });
  }

  res.json({
    success: true,
    entitlement: {
      token: entitlement.token,
      status: entitlement.status,
      createdAt: entitlement.createdAt,
      expiresAt: entitlement.expiresAt,
      redeemedAt: entitlement.redeemedAt,
      // Delivery instruction only released if active or redeemed
      facetimeDeliveryInstruction: ['active', 'redeemed'].includes(entitlement.status)
        ? entitlement.facetimeDeliveryInstruction
        : null,
    },
  });
});

// 5. Server-Authoritative Single-Use Access Token Redemption
apiRouter.post('/access/:token/redeem', async (req: Request, res: Response) => {
  const { token } = req.params;

  // G4: Acquire process-level lock by token to prevent concurrent redemption race conditions
  return await lockManager.acquire(`token:${token}`, async () => {
    const entitlement = db.getEntitlement(token);

    if (!entitlement) {
      return res.status(404).json({ success: false, error: 'Invalid access credential.' });
    }

    if (entitlement.status === 'redeemed') {
      return res.status(409).json({
        success: false,
        error: 'Credential has already been redeemed. Replay attempt rejected.',
        redeemedAt: entitlement.redeemedAt,
      });
    }

    if (entitlement.status === 'expired') {
      return res.status(410).json({ success: false, error: 'Access credential has expired.' });
    }

    if (entitlement.status === 'revoked') {
      return res.status(403).json({ success: false, error: 'Access credential has been revoked by administration.' });
    }

    if (new Date(entitlement.expiresAt).getTime() < Date.now()) {
      entitlement.status = 'expired';
      db.saveEntitlement(entitlement);
      db.logAuditEvent('ENTITLEMENT_EXPIRED', 'system', { token });
      return res.status(410).json({ success: false, error: 'Access credential has expired.' });
    }

    // Atomically update state to REDEEMED
    const provider = db.getProvider();
    entitlement.status = 'redeemed';
    entitlement.redeemedAt = new Date().toISOString();
    db.saveEntitlement(entitlement);

    db.logAuditEvent('ENTITLEMENT_REDEEMED', 'client_scanner', {
      token,
      orderId: entitlement.orderId,
      redeemedAt: entitlement.redeemedAt,
    });

    return res.json({
      success: true,
      message: 'Access entitlement verified and redeemed.',
      facetimeHandle: provider.facetimeHandle,
      facetimeUrl: provider.facetimeHandle.startsWith('http') || provider.facetimeHandle.startsWith('facetime:')
        ? provider.facetimeHandle
        : `facetime:${provider.facetimeHandle}`,
      facetimeDeliveryInstruction: entitlement.facetimeDeliveryInstruction,
      redeemedAt: entitlement.redeemedAt,
    });
  });
});

// 6. Admin Overview (Audit & Financial View - Protected by requireAdminAuth & Double-Blind Identity Masking)
apiRouter.get('/admin/overview', requireAdminAuth, (req: Request, res: Response) => {
  const provider = db.getProvider();
  const rawOrders = db.getAllOrders();
  const settlements = db.getAllSettlements();
  const payouts = db.getAllPayouts();
  const rawAuditEvents = db.getAuditEvents();

  // G3: Scrub/Mask all client identity details in standard admin overview payload
  const orders = rawOrders.map((o) => ({
    ...o,
    clientIp: '[PROTECTED_IP]',
  }));

  const auditEvents = rawAuditEvents.map((evt) => {
    const details = { ...evt.details };
    if (details.payerEmail) details.payerEmail = details.payerEmail.replace(/(.{2})(.*)(?=@)/, '$1***');
    if (details.payerName) details.payerName = 'Client [Protected]';
    return {
      ...evt,
      details,
    };
  });

  const manualReviewQueue = orders.filter((o) => o.status === 'manual_review');

  let totalGrossCents = 0;
  let totalProviderCents = 0;
  let totalAgentCents = 0;

  settlements.forEach((s) => {
    totalGrossCents += s.grossCents;
    totalProviderCents += s.providerCents;
    totalAgentCents += s.agentCents;
  });

  res.json({
    success: true,
    overview: {
      provider,
      orders,
      settlements,
      payouts,
      auditEvents,
      manualReviewQueue,
      totalGrossCents,
      totalProviderCents,
      totalAgentCents,
    },
  });
});

// 7. Admin Provider Config Update (Protected by requireAdminAuth)
apiRouter.post('/admin/config', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { name, payoutEmail, facetimeHandle, serviceName, serviceDescription, feeCents, active } = req.body;
    const provider = db.getProvider();
    
    // Legacy support for single service update
    let services = [...provider.services];
    if (services.length > 0) {
      services[0] = {
        ...services[0],
        ...(serviceName && { name: serviceName }),
        ...(serviceDescription && { description: serviceDescription }),
        ...(feeCents !== undefined && { feeCents: Number(feeCents) }),
      };
    }

    const updated = db.updateProvider({
      ...(name && { name }),
      ...(payoutEmail && { payoutEmail }),
      ...(facetimeHandle && { facetimeHandle }),
      ...(active !== undefined && { active: Boolean(active) }),
      services
    });

    db.logAuditEvent('ORDER_CREATED', 'agent_admin', { action: 'update_provider_config', updated });

    res.json({ success: true, provider: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7b. Provider Own Config Update (Protected by requireProviderAuth)
apiRouter.post('/provider/config', requireProviderAuth, (req: Request, res: Response) => {
  try {
    const { name, payoutEmail, paypalMeHandle, facetimeHandle, active, services } = req.body;
    
    // Validation
    if (services && Array.isArray(services)) {
      if (services.length < 1 || services.length > 3) {
         return res.status(400).json({ success: false, error: 'Must configure between 1 and 3 services.' });
      }
      for (const svc of services) {
        if (!svc.name || !svc.description || typeof svc.feeCents !== 'number' || svc.feeCents <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid service definition.' });
        }
      }
    }

    const updated = db.updateProvider({
      ...(name && { name }),
      ...(payoutEmail && { payoutEmail }),
      ...(paypalMeHandle && { paypalMeHandle }),
      ...(facetimeHandle && { facetimeHandle }),
      ...(active !== undefined && { active: Boolean(active) }),
      ...(services && { services }),
    });

    db.logAuditEvent('ORDER_CREATED', 'provider', { action: 'update_own_config', updated });
    res.json({ success: true, provider: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7c. Provider Overview
apiRouter.get('/provider/overview', requireProviderAuth, (req: Request, res: Response) => {
  const provider = db.getProvider();
  const allOrders = db.getAllOrders();
  const allGates = db.getAllGates();

  // Filter only orders and gates for this provider (even though MVP-1.1 is single provider, establish boundary)
  const orders = allOrders.filter(o => o.providerId === provider.id);
  const gates = allGates.filter(g => g.providerId === provider.id);

  res.json({
    success: true,
    overview: {
      provider,
      orders,
      gates
    }
  });
});

// 8. Identity Escrow Break-Glass Endpoint (Protected by requireAdminAuth & G2 Server-Side Ticket Validation)
apiRouter.post('/admin/escrow/break-glass', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { ticketCode, operator, reason, orderId } = req.body;

    if (!ticketCode || !operator || !reason || !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Break-glass requires ticketCode, operator identity, reason, and orderId.',
      });
    }

    // G2: Validate ticketCode format and minimum reason length on server
    const cleanTicket = String(ticketCode).trim();
    const cleanReason = String(reason).trim();

    if (!cleanTicket.startsWith('TICKET-') || cleanTicket.length < 10) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Invalid support ticket code format. Must begin with "TICKET-" and be at least 10 characters long.',
      });
    }

    if (cleanReason.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request: Detailed justification reason (minimum 10 characters) is required for escrow unmasking.',
      });
    }

    const order = db.getOrder(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found for escrow lookup.' });
    }

    const payment = db.getPayment(orderId);
    const provider = db.getProvider();

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minute TTL

    const session: EscrowSession = {
      ticketCode: cleanTicket,
      operator: String(operator).trim(),
      reason: cleanReason,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      active: true,
      orderId,
      maskedClientEmail: payment?.payerEmail ? payment.payerEmail.replace(/(.{2})(.*)(?=@)/, '$1***') : 'cl***@example.com',
      unmaskedClientEmail: payment?.payerEmail || 'client.payer@example.com',
      providerEmail: provider.email,
    };

    db.saveEscrowSession(session);
    db.logAuditEvent('ESCROW_ACCESSED', operator, {
      ticketCode: cleanTicket,
      reason: cleanReason,
      orderId,
      expiresAt: session.expiresAt,
    }, cleanTicket);

    res.json({
      success: true,
      escrowSession: session,
      message: 'Break-glass identity escrow session authorized. TTL expires in 15 minutes.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Manual Review Resolution (Protected by requireAdminAuth)
apiRouter.post('/admin/manual-review/resolve', requireAdminAuth, (req: Request, res: Response) => {
  try {
    const { orderId, resolution, operator, reason } = req.body;
    const order = db.getOrder(orderId);

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (resolution === 'settle') {
      order.status = 'settled';
      db.saveOrder(order);
      db.logAuditEvent('SETTLEMENT_CREATED', operator || 'agent', { orderId, action: 'manual_settle', reason });
    } else if (resolution === 'void') {
      order.status = 'cancelled';
      db.saveOrder(order);
      db.logAuditEvent('PAYMENT_FAILED', operator || 'agent', { orderId, action: 'manual_void', reason });
    }

    res.json({ success: true, order });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
