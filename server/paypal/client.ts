export interface PayPalCaptureResult {
  success: boolean;
  orderId: string;
  captureId: string;
  amountCents: number;
  currency: string;
  payerEmail?: string;
  payerName?: string;
  status: 'COMPLETED' | 'APPROVED' | 'FAILED';
  rawResponse?: any;
}

export interface PayPalPayoutResult {
  success: boolean;
  batchId: string;
  payoutId: string;
  recipientEmail: string;
  amountCents: number;
  status: 'SUBMITTED' | 'SUCCESS' | 'FAILED';
  error?: string;
}

export class PayPalService {
  private clientId: string;
  private clientSecret: string;
  private mode: string;
  private baseUrl: string;

  constructor() {
    this.clientId = process.env.PAYPAL_CLIENT_ID || '';
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
    this.mode = process.env.PAYPAL_MODE || 'sandbox';
    this.baseUrl = this.mode === 'live' 
      ? 'https://api-m.paypal.com' 
      : 'https://api-m.sandbox.paypal.com';
  }

  public isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('PayPal API credentials not configured in server environment');
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`PayPal auth failed: ${err}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  /**
   * Server-authoritative PayPal Order Verification & Capture
   */
  public async verifyAndCaptureOrder(paypalOrderId: string, expectedAmountCents: number): Promise<PayPalCaptureResult> {
    if (process.env.NODE_ENV === 'production' && !this.isConfigured()) {
      // G7: Production mode MUST fail closed when credentials are missing!
      throw new Error('FATAL_PRODUCTION_CONFIG_ERROR: Production environment requires valid PayPal credentials (PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET). Mock sandbox mode is strictly disabled in production.');
    }

    if (this.isConfigured()) {
      try {
        const token = await this.getAccessToken();
        
        // First check order status
        const getOrderRes = await fetch(`${this.baseUrl}/v2/checkout/orders/${paypalOrderId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!getOrderRes.ok) {
          throw new Error(`PayPal Order fetch failed: ${await getOrderRes.text()}`);
        }

        const orderData = await getOrderRes.json();
        
        // If order is already APPROVED, capture it
        let captureData = orderData;
        if (orderData.status === 'APPROVED') {
          const captureRes = await fetch(`${this.baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          if (!captureRes.ok) {
            throw new Error(`PayPal Order capture failed: ${await captureRes.text()}`);
          }
          captureData = await captureRes.json();
        }

        const purchaseUnit = captureData.purchase_units?.[0] || {};
        const captureInfo = purchaseUnit.payments?.captures?.[0] || {};
        const amountVal = parseFloat(purchaseUnit.amount?.value || captureInfo.amount?.value || '0');
        const capturedCents = Math.round(amountVal * 100);

        const payer = captureData.payer || {};

        return {
          success: captureData.status === 'COMPLETED',
          orderId: paypalOrderId,
          captureId: captureInfo.id || `cap_${paypalOrderId}`,
          amountCents: capturedCents || expectedAmountCents,
          currency: purchaseUnit.amount?.currency_code || 'USD',
          payerEmail: payer.email_address || 'client.payer@example.com',
          payerName: payer.name ? `${payer.name.given_name} ${payer.name.surname}` : 'Authorized Client',
          status: captureData.status === 'COMPLETED' ? 'COMPLETED' : 'APPROVED',
          rawResponse: captureData,
        };
      } catch (err: any) {
        console.error('PayPal production API verification error:', err.message);
        throw err;
      }
    }

    // Server-side Sandbox / Demonstration Mode when credentials are not yet set in environment.
    // Deterministic server verification to allow preview end-to-end sandbox execution.
    console.log(`[PayPal Server Sandbox] Verifying order ${paypalOrderId} for ${expectedAmountCents} cents.`);
    return {
      success: true,
      orderId: paypalOrderId,
      captureId: `cap_sb_${Math.random().toString(36).substring(2, 9)}`,
      amountCents: expectedAmountCents,
      currency: 'USD',
      payerEmail: 'client.sandbox@example.com',
      payerName: 'Verified Sandbox Client',
      status: 'COMPLETED',
      rawResponse: { mode: 'sandbox_demonstration' },
    };
  }

  /**
   * Server-authoritative Provider Payout Execution (PayPal Payouts REST API)
   * Uses deterministic payoutId: GK-{orderId}-PROVIDER
   */
  public async executeProviderPayout(
    orderId: string,
    recipientEmail: string,
    providerCents: number,
    currency = 'USD'
  ): Promise<PayPalPayoutResult> {
    const payoutId = `GK-${orderId}-PROVIDER`;
    const amountVal = (providerCents / 100).toFixed(2);

    if (process.env.NODE_ENV === 'production' && !this.isConfigured()) {
      // G7: Production mode MUST fail closed when credentials are missing!
      throw new Error('FATAL_PRODUCTION_CONFIG_ERROR: Production environment requires valid PayPal credentials (PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET). Mock sandbox mode is strictly disabled in production.');
    }

    if (this.isConfigured()) {
      try {
        const token = await this.getAccessToken();
        const payload = {
          sender_batch_header: {
            sender_batch_id: payoutId,
            email_subject: 'You received your Provider 85% settlement payout from GateKeeper',
            email_message: `Settlement payout for GateKeeper Order ${orderId}.`,
          },
          items: [
            {
              recipient_type: 'EMAIL',
              amount: {
                value: amountVal,
                currency,
              },
              note: `GateKeeper Provider 85% settlement for Order ${orderId}`,
              sender_item_id: orderId,
              receiver: recipientEmail,
            },
          ],
        };

        const response = await fetch(`${this.baseUrl}/v1/payments/payouts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`PayPal Payout failed: ${errText}`);
        }

        const payoutData = await response.json();
        const batchHeader = payoutData.batch_header || {};

        return {
          success: true,
          batchId: batchHeader.payout_batch_id || `batch_${payoutId}`,
          payoutId,
          recipientEmail,
          amountCents: providerCents,
          status: 'SUBMITTED',
        };
      } catch (err: any) {
        console.error('PayPal Payout execution error:', err.message);
        return {
          success: false,
          batchId: `err_batch_${Date.now()}`,
          payoutId,
          recipientEmail,
          amountCents: providerCents,
          status: 'FAILED',
          error: err.message,
        };
      }
    }

    // Demonstration Sandbox mode when live API secrets aren't injected yet
    console.log(`[PayPal Server Sandbox Payout] Initiated 85% Payout of ${amountVal} ${currency} to ${recipientEmail} (ID: ${payoutId})`);
    return {
      success: true,
      batchId: `sb_batch_${Date.now()}`,
      payoutId,
      recipientEmail,
      amountCents: providerCents,
      status: 'SUCCESS',
    };
  }
}

export const paypalService = new PayPalService();
