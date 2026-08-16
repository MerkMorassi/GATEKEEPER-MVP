import React, { useState, useEffect } from 'react';
import { Shield, Lock, CheckCircle2, QrCode, Video, ExternalLink, RefreshCw, AlertCircle, ArrowRight, DollarSign, Clock } from 'lucide-react';
import { ProviderConfig, Order, Settlement, Entitlement } from '../types';

interface ClientCheckoutProps {
  onOrderCreated?: (order: Order) => void;
  activeTokenFromHash?: string;
  activeGateFromHash?: string;
  activeServiceFromHash?: string;
}

export const ClientCheckout: React.FC<ClientCheckoutProps> = ({
  activeTokenFromHash,
  activeGateFromHash,
  activeServiceFromHash
}) => {
  const [providerConfig, setProviderConfig] = useState<any | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Flow State
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [agreedToIndemnity, setAgreedToIndemnity] = useState(true);
  const [checkoutStep, setCheckoutStep] = useState<'details' | 'paypal_modal' | 'verifying' | 'success'>('details');
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [redemptionResult, setRedemptionResult] = useState<{
    redeemed: boolean;
    facetimeHandle?: string;
    facetimeUrl?: string;
    instruction?: string;
    error?: string;
  } | null>(null);

  // Fetch provider config
  useEffect(() => {
    fetchConfig();
  }, [activeGateFromHash, activeServiceFromHash]);

  // Handle access token hash from URL if present
  useEffect(() => {
    if (activeTokenFromHash) {
      verifyTokenFromHash(activeTokenFromHash);
    }
  }, [activeTokenFromHash]);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      if (activeGateFromHash) {
        const res = await fetch(`/api/gates/${activeGateFromHash}`);
        const data = await res.json();
        if (data.success && data.gate) {
          setProviderConfig({
            name: data.gate.providerName,
            services: data.gate.services,
            active: true
          });
          if (data.gate.services && data.gate.services.length > 0) {
            const matchedSvc = activeServiceFromHash
              ? data.gate.services.find((s: any) => s.id === activeServiceFromHash)
              : null;
            setSelectedServiceId(matchedSvc ? matchedSvc.id : data.gate.services[0].id);
          }
        } else {
          setError(data.error || 'Gate is invalid, inactive, or not found.');
        }
      } else {
        const res = await fetch('/api/config');
        const data = await res.json();
        if (data.success) {
          const loadedServices = (data.provider.services && data.provider.services.length > 0)
            ? data.provider.services
            : [
                {
                  id: 'fallback',
                  name: data.provider.serviceName,
                  description: data.provider.serviceDescription,
                  feeCents: data.provider.feeCents,
                  currency: data.provider.currency
                }
              ];
          setProviderConfig({
            ...data.provider,
            services: loadedServices
          });
          if (loadedServices.length > 0) {
            const matchedSvc = activeServiceFromHash
              ? loadedServices.find((s: any) => s.id === activeServiceFromHash)
              : null;
            setSelectedServiceId(matchedSvc ? matchedSvc.id : loadedServices[0].id);
          }
        } else {
          setError(data.error || 'Failed to load provider configuration');
        }
      }
    } catch (err: any) {
      setError('Unable to connect to GateKeeper server: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyTokenFromHash = async (token: string) => {
    try {
      const res = await fetch(`/api/access/${token}`);
      const data = await res.json();
      if (data.success && data.entitlement) {
        setEntitlement(data.entitlement);
        setCheckoutStep('success');
      }
    } catch (err) {
      console.error('Error verifying token hash:', err);
    }
  };

  // Initiate Order
  const handleStartCheckout = async () => {
    setError(null);
    setIsProcessingPayment(true);
    try {
      const res = await fetch('/api/orders/create', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          gateToken: activeGateFromHash,
          serviceId: selectedServiceId
        })
      });
      const data = await res.json();
      if (data.success && data.order) {
        setCurrentOrder(data.order);
        setCheckoutStep('paypal_modal');
      } else {
        setError(data.error || 'Failed to initiate transaction');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Confirm PayPal Payment & Verify Server-Side
  const handleConfirmPayPalPayment = async (simulatedPaypalId?: string) => {
    if (!currentOrder) return;
    setCheckoutStep('verifying');
    setError(null);

    const paypalOrderId = simulatedPaypalId || `PAYID-MOCK-${Date.now()}`;

    try {
      const res = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: currentOrder.id,
          paypalOrderId,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setCurrentOrder(data.order);
        setSettlement(data.settlement);
        setEntitlement(data.entitlement);
        setCheckoutStep('success');
      } else {
        setError(data.error || 'Payment verification failed server-side.');
        setCheckoutStep('details');
      }
    } catch (err: any) {
      setError('Server payment verification error: ' + err.message);
      setCheckoutStep('details');
    }
  };

  // Server-Authoritative Single-Use Redemption
  const handleRedeemCredential = async () => {
    if (!entitlement) return;
    setError(null);

    try {
      const res = await fetch(`/api/access/${entitlement.token}/redeem`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success) {
        setRedemptionResult({
          redeemed: true,
          facetimeHandle: data.facetimeHandle,
          facetimeUrl: data.facetimeUrl,
          instruction: data.facetimeDeliveryInstruction,
        });
        setEntitlement((prev) => prev ? { ...prev, status: 'redeemed', redeemedAt: data.redeemedAt } : null);
      } else {
        setRedemptionResult({
          redeemed: false,
          error: data.error || 'Redemption rejected.',
        });
      }
    } catch (err: any) {
      setRedemptionResult({
        redeemed: false,
        error: 'Network error during redemption: ' + err.message,
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-surface-a40">
        <RefreshCw className="w-8 h-8 animate-spin text-info-a0 mb-3" />
        <p className="text-sm font-mono">Initializing GateKeeper Authorization Boundary...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {error && (
        <div className="bg-danger-a0/10 border border-danger-a0/30 rounded-xl p-4 mb-6 flex items-start space-x-3 text-danger-a0">
          <AlertCircle className="w-5 h-5 text-danger-a0 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Authorization Error</p>
            <p className="text-danger-a10 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Main Container */}
      {checkoutStep === 'details' && providerConfig && (
        <div className="bg-surface-a0 border border-surface-a10 rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="pb-6 border-b border-surface-a10">
            <span className="text-[11px] font-mono uppercase tracking-widest text-info-a0 font-semibold bg-info-a0/10 px-2.5 py-1 rounded-md border border-info-a0/20">
              Official Provider
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-theme-light mt-2">{providerConfig.name}</h1>
          </div>

          <div className="py-6 border-b border-surface-a10">
            <h2 className="text-sm font-mono uppercase tracking-wider text-surface-a40 mb-3">Select Service Tier</h2>
            
            <div className="space-y-3">
              {providerConfig.services && providerConfig.services.map((svc: any) => (
                <div 
                  key={svc.id}
                  onClick={() => setSelectedServiceId(svc.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col sm:flex-row justify-between sm:items-center gap-4 ${
                    selectedServiceId === svc.id 
                      ? 'bg-info-a0/10 border-info-a0 shadow-sm' 
                      : 'bg-tonal-a0 border-surface-a10 hover:border-surface-a20'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedServiceId === svc.id ? 'border-info-a0' : 'border-surface-a40'}`}>
                        {selectedServiceId === svc.id && <div className="w-2 h-2 rounded-full bg-info-a0" />}
                      </div>
                      <h3 className={`font-bold ${selectedServiceId === svc.id ? 'text-info-a0' : 'text-theme-light'}`}>{svc.name}</h3>
                    </div>
                    <p className="text-sm text-surface-a40 mt-1.5 ml-6">{svc.description}</p>
                  </div>
                  <div className="text-left sm:text-right ml-6 sm:ml-0">
                    <div className="text-xl font-extrabold text-theme-light">${(svc.feeCents / 100).toFixed(2)}</div>
                    <div className="text-[10px] text-surface-a50 font-mono">USD</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
              <div className="bg-tonal-a0/80 border border-surface-a10 p-3.5 rounded-xl">
                <Lock className="w-4 h-4 text-info-a0 mb-2" />
                <h3 className="text-xs font-semibold text-theme-light">Double-Blind Privacy</h3>
                <p className="text-[11px] text-surface-a40 mt-1">No personal identity data passed to media layer.</p>
              </div>

              <div className="bg-tonal-a0/80 border border-surface-a10 p-3.5 rounded-xl">
                <QrCode className="w-4 h-4 text-info-a0 mb-2" />
                <h3 className="text-xs font-semibold text-theme-light">Opaque Single-Use QR</h3>
                <p className="text-[11px] text-surface-a40 mt-1">Disposable credential generated upon payment.</p>
              </div>

              <div className="bg-tonal-a0/80 border border-surface-a10 p-3.5 rounded-xl">
                <Shield className="w-4 h-4 text-info-a0 mb-2" />
                <h3 className="text-xs font-semibold text-theme-light">Guaranteed Onboarding</h3>
                <p className="text-[11px] text-surface-a40 mt-1">Direct session handoff unlocked upon payment.</p>
              </div>
            </div>
          </div>

          {/* Legal Guardrails & Provider Indemnification Agreement */}
          <div className="bg-tonal-a0 border border-surface-a10 p-4 rounded-xl text-xs space-y-2.5">
            <div className="flex items-center space-x-2 text-info-a0 font-bold uppercase tracking-wider text-[10px]">
              <Shield className="w-3.5 h-3.5" />
              <span>Legal Guardrails & Policy Compliance</span>
            </div>
            <p className="text-surface-a40 text-[11px] leading-relaxed">
              By proceeding with this transaction, you explicitly agree to indemnify and hold harmless the service provider (<strong className="text-theme-light">Merk Morassi, LLC</strong>) from any and all liabilities. You certify that your utilization of this confidential gateway strictly complies with all governing laws, privileges, and terms of service established by Apple, Apple Pay, FaceTime, PayPal, and underlying media infrastructure.
            </p>
            <label className="flex items-start space-x-2.5 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={agreedToIndemnity}
                onChange={(e) => setAgreedToIndemnity(e.target.checked)}
                className="mt-0.5 rounded border-surface-a30 bg-surface-a0 text-info-a0 focus:ring-info-a0"
              />
              <span className="text-[11px] text-theme-light font-medium select-none">
                I agree to the Legal Guardrails, Platform Policies, and Provider Indemnification terms.
              </span>
            </label>
          </div>

          {/* Action Section */}
          <div className="pt-4 border-t border-surface-a10">
            <button
              onClick={handleStartCheckout}
              disabled={isProcessingPayment || !providerConfig.active || !selectedServiceId || !agreedToIndemnity}
              className="w-full py-4 bg-info-a0 hover:bg-info-a10 text-primary-a0 font-bold text-sm sm:text-base rounded-xl shadow-xl transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessingPayment ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Initiating Order...</span>
                </>
              ) : (
                <>
                  <DollarSign className="w-5 h-5" />
                  <span>Pay ${(providerConfig.services?.find((s:any) => s.id === selectedServiceId)?.feeCents / 100).toFixed(2) || '0.00'} via PayPal</span>
                  <ArrowRight className="w-5 h-5 ml-1" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Secure Transaction Banner */}
      {checkoutStep === 'details' && providerConfig && (
        <div className="bg-surface-a0 border border-surface-a10 rounded-xl p-4 mt-8 flex items-start space-x-3 text-theme-light">
          <Shield className="w-5 h-5 text-info-a0 flex-shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm">
            <p className="font-semibold text-theme-light flex items-center space-x-2">
              <span>Secure Encrypted Connection</span>
            </p>
            <p className="text-surface-a40 mt-1 leading-relaxed">
              Protected by Server-Authoritative PayPal Verification. Your payment is securely processed through GateKeeper. Your session access is generated after payment confirmation.
            </p>
            <p className="text-surface-a50 mt-2 text-[10px]">
              GateKeeper — a trusted service of Merk Morassi, LLC
            </p>
          </div>
        </div>
      )}

      {/* PayPal Modal Step */}
      {checkoutStep === 'paypal_modal' && currentOrder && (
        <div className="bg-surface-a0 border border-surface-a10 rounded-2xl p-6 sm:p-8 max-w-lg mx-auto shadow-2xl">
          <div className="text-center pb-6 border-b border-surface-a10">
            <div className="w-12 h-12 bg-warning-a0/10 border border-warning-a0/20 rounded-xl flex items-center justify-center text-warning-a0 mx-auto mb-3">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-theme-light">PayPal Express Checkout</h2>
            <p className="text-xs text-surface-a40 font-mono mt-1">Order ID: {currentOrder.id}</p>
          </div>

          <div className="py-6 space-y-4">
            <div className="bg-tonal-a0 p-4 rounded-xl border border-surface-a10 space-y-2 text-xs">
              <div className="flex justify-between text-theme-light">
                <span>Service:</span>
                <span className="font-semibold text-theme-light">{currentOrder.serviceName}</span>
              </div>
              <div className="flex justify-between text-theme-light">
                <span>Total Amount:</span>
                <span className="font-semibold text-info-a0">${(currentOrder.amountCents / 100).toFixed(2)} USD</span>
              </div>
            </div>

            <div className="p-4 bg-info-a0/10 border border-info-a0/20 rounded-xl text-xs text-info-a10 leading-relaxed">
              <p className="font-medium text-info-a0 mb-1">Secure Payment Flow</p>
              Clicking below will securely authorize payment through the PayPal rail. Your funds are verified and your disposable access credential will be instantly generated for direct connection.
            </div>
          </div>

          <div className="flex flex-col space-y-3">
            <button
              onClick={() => handleConfirmPayPalPayment()}
              className="w-full py-3.5 bg-warning-a0 hover:bg-warning-a10 text-primary-a0 font-bold rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
            >
              <span>Complete Payment with PayPal</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setCheckoutStep('details')}
              className="w-full py-2.5 text-xs text-surface-a40 hover:text-theme-light transition-colors"
            >
              Cancel Order
            </button>
          </div>
        </div>
      )}

      {/* Verification Spinner */}
      {checkoutStep === 'verifying' && (
        <div className="bg-surface-a0 border border-surface-a10 rounded-2xl p-12 text-center max-w-lg mx-auto shadow-2xl">
          <RefreshCw className="w-10 h-10 animate-spin text-info-a0 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-theme-light">Verifying Payment Security</h2>
          <p className="text-xs text-surface-a40 font-mono mt-2">
            Confirming authorization • Generating Disposable Access Credential...
          </p>
        </div>
      )}

      {/* Success & Entitlement QR View */}
      {checkoutStep === 'success' && entitlement && (
        <div className="bg-surface-a0 border border-surface-a10 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between pb-6 border-b border-surface-a10 gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-success-a0/10 border border-success-a0/20 rounded-xl flex items-center justify-center text-success-a0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-theme-light">Payment Verified & Entitlement Issued</h2>
                <p className="text-xs text-surface-a40 font-mono mt-0.5">Order ID: {entitlement.orderId}</p>
              </div>
            </div>

            <div className="px-3 py-1.5 rounded-lg bg-success-a0/10 border border-success-a0/20 text-success-a0 text-xs font-mono font-medium flex items-center space-x-1.5">
              <div className="w-2 h-2 rounded-full bg-success-a0 animate-pulse" />
              <span className="uppercase">STATUS: {entitlement.status}</span>
            </div>
          </div>

          {/* QR Code & Token Display */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* QR Card */}
            <div className="bg-tonal-a0 p-6 rounded-2xl border border-surface-a10 text-center flex flex-col items-center">
              {entitlement.qrDataUrl ? (
                <div className="p-3 bg-white rounded-xl shadow-inner mb-4">
                  <img src={entitlement.qrDataUrl} alt="Access QR Code" className="w-56 h-56 object-contain" />
                </div>
              ) : (
                <div className="w-56 h-56 bg-surface-a0 border border-surface-a10 rounded-xl flex items-center justify-center text-surface-a40 mb-4">
                  <QrCode className="w-12 h-12" />
                </div>
              )}
              <span className="text-[11px] font-mono text-surface-a40">Scan QR or use token below for single-use access</span>
            </div>

            {/* Credential Specs */}
            <div className="space-y-4">
              <div className="bg-tonal-a0 p-4 rounded-xl border border-surface-a10 space-y-2">
                <label className="text-[10px] font-mono uppercase text-surface-a40 tracking-wider">Opaque Access Token</label>
                <div className="font-mono text-xs text-info-a0 bg-surface-a0 p-2.5 rounded-lg border border-surface-a10 break-all select-all">
                  {entitlement.token}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10">
                  <span className="text-surface-a50 block text-[10px]">CREATED</span>
                  <span className="text-theme-light text-[11px]">{new Date(entitlement.createdAt).toLocaleTimeString()}</span>
                </div>
                <div className="bg-tonal-a0 p-3 rounded-xl border border-surface-a10">
                  <span className="text-surface-a50 block text-[10px]">EXPIRES</span>
                  <span className="text-theme-light text-[11px]">{new Date(entitlement.expiresAt).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Single-Use Redemption Section */}
          <div className="pt-6 border-t border-surface-a10">
            {redemptionResult?.redeemed ? (
              <div className="bg-success-a0/10 border border-success-a0/30 p-6 rounded-2xl text-center space-y-4">
                <div className="w-12 h-12 bg-success-a0/20 text-success-a0 rounded-full flex items-center justify-center mx-auto">
                  <Video className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-theme-light">FaceTime Gate Unlocked</h3>
                  <p className="text-xs text-theme-light mt-1">{redemptionResult.instruction}</p>
                </div>

                <div className="pt-2">
                  <a
                    href={redemptionResult.facetimeUrl}
                    className="inline-flex items-center space-x-2 px-6 py-3 bg-success-a0 hover:bg-success-a10 text-primary-a0 font-bold rounded-xl shadow-lg transition-all"
                  >
                    <Video className="w-4 h-4" />
                    <span>Launch FaceTime Session {redemptionResult.facetimeHandle?.startsWith('http') ? '(Meeting Room)' : `(${redemptionResult.facetimeHandle})`}</span>
                    <ExternalLink className="w-4 h-4 ml-1" />
                  </a>
                </div>
                <p className="text-[10px] text-surface-a40 font-mono">
                  Credential status updated to REDEEMED. Single-use access consumed.
                </p>
              </div>
            ) : (
              <div className="bg-tonal-a0 p-6 rounded-2xl border border-surface-a10 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-theme-light">Redeem Access Credential</h3>
                  <p className="text-xs text-surface-a40 mt-0.5">
                    Click to perform single-use server redemption and reveal your private session onboarding details.
                  </p>
                </div>

                <button
                  onClick={handleRedeemCredential}
                  disabled={entitlement.status !== 'active'}
                  className="w-full sm:w-auto px-6 py-3 bg-info-a0 hover:bg-info-a10 text-primary-a0 font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Video className="w-4 h-4" />
                  <span>Redeem Credential & Connect</span>
                </button>
              </div>
            )}

            {redemptionResult?.error && (
              <div className="bg-danger-a0/10 border border-danger-a0/30 p-4 rounded-xl text-xs text-danger-a0 mt-4 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{redemptionResult.error}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
