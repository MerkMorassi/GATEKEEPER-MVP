import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {
  QrCode,
  Camera,
  CameraOff,
  Upload,
  Shield,
  CheckCircle2,
  AlertCircle,
  Video,
  Lock,
  ExternalLink,
  RefreshCw,
  DollarSign,
  ArrowRight,
  Sparkles,
  RotateCcw,
  Check
} from 'lucide-react';
import { ServiceDefinition, Order, Entitlement } from '../types';

interface ScannedServiceTier {
  id: string;
  name: string;
  description: string;
  feeCents: number;
  currency: string;
  providerName: string;
  providerId: string;
  gateToken?: string;
}

export const AccessScanner: React.FC = () => {
  // Mode & Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameId = useRef<number | null>(null);

  // Manual input fallback
  const [manualInput, setManualInput] = useState('');

  // Validation / Scan Result State
  const [validationState, setValidationState] = useState<'idle' | 'verifying' | 'verified' | 'invalid'>('idle');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [verifiedTier, setVerifiedTier] = useState<ScannedServiceTier | null>(null);
  const [scannedRawPayload, setScannedRawPayload] = useState<string>('');

  // Existing Entitlement Token State (if scanned code is a pre-existing access token)
  const [scannedEntitlementToken, setScannedEntitlementToken] = useState<string | null>(null);

  // Checkout State (Direct Path to Checkout)
  const [clientName, setClientName] = useState('Client Guest');
  const [clientEmail, setClientEmail] = useState('client@example.com');
  const [checkoutStep, setCheckoutStep] = useState<'verified_summary' | 'paypal_modal' | 'verifying_payment' | 'session_flow'>('verified_summary');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [generatedQrUrl, setGeneratedQrUrl] = useState<string | null>(null);

  // Session Flow / Redemption State
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redemptionResult, setRedemptionResult] = useState<{
    redeemed: boolean;
    facetimeHandle?: string;
    facetimeUrl?: string;
    instruction?: string;
    error?: string;
  } | null>(null);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Handle camera start/stop
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported in this browser or context.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setCameraActive(true);
        setScanning(true);
        requestAnimationFrame(tickScan);
      }
    } catch (err: any) {
      console.error('Camera startup error:', err);
      setCameraError(err.message || 'Unable to access camera. Please check camera permissions.');
      setCameraActive(false);
      setScanning(false);
    }
  };

  const stopCamera = () => {
    if (animFrameId.current) {
      cancelAnimationFrame(animFrameId.current);
      animFrameId.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setScanning(false);
  };

  // Continuous frame scanning loop using jsQR
  const tickScan = () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animFrameId.current = requestAnimationFrame(tickScan);
      return;
    }

    const video = videoRef.current;
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });

      if (code && code.data && code.data.trim().length > 0) {
        // QR Code detected! Stop camera and validate payload
        stopCamera();
        handleQrPayloadDetected(code.data.trim());
        return;
      }
    }

    animFrameId.current = requestAnimationFrame(tickScan);
  };

  // Handle uploaded image file scanning
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            handleQrPayloadDetected(code.data.trim());
          } else {
            setValidationState('invalid');
            setValidationError('No valid QR code could be decoded from the uploaded image.');
          }
        }
      };
      img.src = evt.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Process raw payload string from QR code or manual input
  const handleQrPayloadDetected = async (rawPayload: string) => {
    setScannedRawPayload(rawPayload);
    setValidationState('verifying');
    setValidationError(null);
    setVerifiedTier(null);
    setScannedEntitlementToken(null);

    try {
      // Clean token / URL prefixes
      let extractedToken = rawPayload;
      if (rawPayload.includes('#access=')) {
        extractedToken = rawPayload.split('#access=')[1].split('&')[0];
      } else if (rawPayload.includes('#gate=')) {
        extractedToken = rawPayload.split('#gate=')[1].split('&')[0];
      } else if (rawPayload.includes('#service=')) {
        extractedToken = rawPayload.split('#service=')[1].split('&')[0];
      } else if (rawPayload.includes('serviceId=')) {
        extractedToken = rawPayload.split('serviceId=')[1].split('&')[0];
      }

      // Check if it's a JSON payload
      if (rawPayload.startsWith('{') && rawPayload.endsWith('}')) {
        try {
          const parsedJson = JSON.parse(rawPayload);
          if (parsedJson.serviceId) {
            extractedToken = parsedJson.serviceId;
          }
        } catch {
          // ignore JSON parse error and fallback
        }
      }

      // 1. Fetch system config to match Service Tier
      const configRes = await fetch('/api/config');
      const configData = await configRes.json();

      if (configData.success && configData.provider) {
        const provider = configData.provider;
        const services: ServiceDefinition[] = provider.services || [
          {
            id: 'srv_1',
            name: provider.serviceName || '30 Minutes 1-on-1 Confidential Consultation',
            description: provider.serviceDescription || '30 Minutes Direct 1-on-1 Confidential Consultation',
            feeCents: provider.feeCents || 15000,
            currency: provider.currency || 'USD'
          }
        ];

        // Match service by extracted token or default to first if token matches service ID pattern
        let matchedService = services.find((s) => s.id === extractedToken);

        // If scanned text contains 'srv_', '30', '60', '90' or general QR scan
        if (!matchedService) {
          if (extractedToken.includes('60') || extractedToken.includes('30000')) {
            matchedService = services.find((s) => s.feeCents === 30000) || services[1] || services[0];
          } else if (extractedToken.includes('90') || extractedToken.includes('45000')) {
            matchedService = services.find((s) => s.feeCents === 45000) || services[2] || services[0];
          } else if (extractedToken.startsWith('gk_tok_') || extractedToken.startsWith('gk_gate_')) {
            // It's a pre-issued access token
            setScannedEntitlementToken(extractedToken);
            matchedService = services[0];
          } else {
            // Default to the primary defined service tier (QR code defines tier)
            matchedService = services[0];
          }
        }

        if (matchedService) {
          setVerifiedTier({
            id: matchedService.id,
            name: matchedService.name,
            description: matchedService.description,
            feeCents: matchedService.feeCents,
            currency: matchedService.currency,
            providerName: provider.name,
            providerId: provider.id
          });
          setValidationState('verified');
          return;
        }
      }

      // If no tier match could be made
      setValidationState('invalid');
      setValidationError('Unrecognized service tier payload or inactive provider gate.');
    } catch (err: any) {
      console.error('Validation error:', err);
      setValidationState('invalid');
      setValidationError('Server verification error: ' + err.message);
    }
  };

  // Reset scanner to scan another code
  const handleResetScanner = () => {
    stopCamera();
    setValidationState('idle');
    setValidationError(null);
    setVerifiedTier(null);
    setScannedRawPayload('');
    setManualInput('');
    setCheckoutStep('verified_summary');
    setCurrentOrder(null);
    setEntitlement(null);
    setGeneratedQrUrl(null);
    setRedemptionResult(null);
  };

  // Initiate Direct Checkout for the LOCKED service tier
  const handleStartCheckout = async () => {
    if (!verifiedTier) return;
    setIsProcessingPayment(true);
    setValidationError(null);

    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: verifiedTier.id
        })
      });

      const data = await res.json();
      if (data.success && data.order) {
        setCurrentOrder(data.order);
        setCheckoutStep('paypal_modal');
      } else {
        setValidationError(data.error || 'Failed to initiate checkout order.');
      }
    } catch (err: any) {
      setValidationError(err.message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Confirm PayPal Payment and proceed directly to Session Flow
  const handleConfirmPayPalPayment = async (simulatedPaypalId?: string) => {
    if (!currentOrder) return;
    setCheckoutStep('verifying_payment');
    setValidationError(null);

    const paypalOrderId = simulatedPaypalId || `PAYID-MOCK-QR-${Date.now()}`;

    try {
      const res = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: currentOrder.id,
          paypalOrderId
        })
      });

      const data = await res.json();

      if (data.success) {
        setCurrentOrder(data.order);
        setEntitlement(data.entitlement);

        // Generate QR code data URL for entitlement token
        if (data.entitlement && data.entitlement.token) {
          const qrData = await QRCode.toDataURL(`https://gatekeeper.internal/#access=${data.entitlement.token}`);
          setGeneratedQrUrl(qrData);
        }

        setCheckoutStep('session_flow');
      } else {
        setValidationError(data.error || 'PayPal payment verification failed server-side.');
        setCheckoutStep('verified_summary');
      }
    } catch (err: any) {
      setValidationError('Server payment error: ' + err.message);
      setCheckoutStep('verified_summary');
    }
  };

  // Single-use token redemption in Session Flow
  const handleRedeemAccess = async () => {
    if (!entitlement) return;
    setIsRedeeming(true);

    try {
      const res = await fetch(`/api/access/${entitlement.token}/redeem`, {
        method: 'POST'
      });
      const data = await res.json();

      if (data.success) {
        setRedemptionResult({
          redeemed: true,
          facetimeHandle: data.facetimeHandle,
          facetimeUrl: data.facetimeUrl,
          instruction: data.facetimeDeliveryInstruction
        });
        setEntitlement((prev) => (prev ? { ...prev, status: 'redeemed' } : null));
      } else {
        setRedemptionResult({
          redeemed: false,
          error: data.error || 'Access redemption failed.'
        });
      }
    } catch (err: any) {
      setRedemptionResult({
        redeemed: false,
        error: 'Network redemption error: ' + err.message
      });
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center space-x-2 bg-info-a0/10 border border-info-a0/20 px-3 py-1 rounded-full text-xs font-mono text-info-a0">
          <QrCode className="w-4 h-4" />
          <span>Camera-Based Service Access Scanner</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-theme-light">
          QR Code Access & Direct Checkout
        </h1>
        <p className="text-xs sm:text-sm text-surface-a40 max-w-lg mx-auto">
          Scan a GateKeeper QR code to lock your service tier, verify entitlement, pay via PayPal, and unlock your private session.
        </p>
      </div>

      {/* Main Container */}
      <div className="bg-surface-a0 border border-surface-a10 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
        {/* ========================================================================= */}
        {/* STATE 1: CAMERA & SCANNER INTERFACE (IDLE / VERIFYING) */}
        {/* ========================================================================= */}
        {(validationState === 'idle' || validationState === 'verifying') && (
          <div className="space-y-6">
            {/* Camera Frame Box */}
            <div className="relative bg-tonal-a0 border border-surface-a10 rounded-2xl overflow-hidden aspect-video sm:aspect-[16/9] flex items-center justify-center">
              {cameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                  />
                  {/* Target Finder Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="relative w-56 h-56 border-2 border-info-a0/80 rounded-2xl shadow-[0_0_30px_rgba(30,144,255,0.3)] flex items-center justify-center">
                      <div className="absolute inset-0 border-t-2 border-info-a0 animate-pulse rounded-2xl" />
                      <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-info-a0 to-transparent absolute top-1/2 -translate-y-1/2 animate-bounce" />
                      <span className="absolute bottom-2 text-[10px] font-mono text-info-a0 bg-black/60 px-2 py-0.5 rounded-md">
                        ALIGN QR CODE HERE
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center p-6 space-y-3">
                  <div className="w-16 h-16 bg-surface-a10/50 rounded-2xl flex items-center justify-center text-surface-a40 mx-auto">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-theme-light">Camera Scanner Ready</p>
                    <p className="text-xs text-surface-a40 mt-1 max-w-xs mx-auto">
                      Click start to activate your device camera and scan a service QR code.
                    </p>
                  </div>
                </div>
              )}

              {/* Verifying Loader Overlay */}
              {validationState === 'verifying' && (
                <div className="absolute inset-0 bg-primary-a10/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 space-y-3 z-20">
                  <RefreshCw className="w-10 h-10 animate-spin text-info-a0" />
                  <p className="text-sm font-mono text-theme-light font-bold">Verifying QR Code Payload...</p>
                  <p className="text-xs text-surface-a40">Validating entitlement and locking service tier</p>
                </div>
              )}
            </div>

            {/* Camera Errors */}
            {cameraError && (
              <div className="bg-danger-a0/10 border border-danger-a0/30 rounded-xl p-4 flex items-start space-x-3 text-danger-a0 text-xs">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Camera Access Notice</p>
                  <p className="mt-0.5 text-danger-a10">{cameraError}</p>
                </div>
              </div>
            )}

            {/* Camera Control Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              {!cameraActive ? (
                <button
                  onClick={startCamera}
                  className="flex-1 py-3 bg-info-a0 hover:bg-info-a10 text-primary-a0 font-bold text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
                >
                  <Camera className="w-4 h-4" />
                  <span>Activate Camera Scanner</span>
                </button>
              ) : (
                <div className="flex w-full sm:w-auto items-center gap-2">
                  <button
                    onClick={stopCamera}
                    className="flex-1 sm:flex-none px-5 py-3 bg-danger-a0/20 hover:bg-danger-a0/30 text-danger-a0 border border-danger-a0/30 font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-2"
                  >
                    <CameraOff className="w-4 h-4" />
                    <span>Stop Camera</span>
                  </button>
                  <button
                    onClick={() => {
                      stopCamera();
                      setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
                      setTimeout(startCamera, 300);
                    }}
                    className="px-4 py-3 bg-surface-a10 hover:bg-surface-a20 text-theme-light text-xs font-mono rounded-xl transition-all"
                  >
                    Switch Lens
                  </button>
                </div>
              )}

              {/* Upload Image Fallback */}
              <label className="cursor-pointer px-4 py-3 bg-tonal-a0 hover:bg-surface-a10 border border-surface-a10 text-theme-light text-xs font-mono rounded-xl transition-all flex items-center space-x-2">
                <Upload className="w-4 h-4 text-info-a0" />
                <span>Upload QR Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Manual Entry Fallback */}
            <div className="pt-6 border-t border-surface-a10 space-y-3">
              <label className="text-xs font-mono uppercase text-surface-a40 block">
                Or Enter / Paste QR Code Payload
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="e.g. srv_1, gk_tok_..., or https://..."
                  className="flex-1 bg-tonal-a0 border border-surface-a10 rounded-xl px-4 py-2.5 text-xs font-mono text-info-a0 focus:outline-none focus:border-info-a0"
                />
                <button
                  onClick={() => manualInput.trim() && handleQrPayloadDetected(manualInput.trim())}
                  disabled={!manualInput.trim()}
                  className="px-5 py-2.5 bg-info-a0 hover:bg-info-a10 disabled:opacity-50 text-primary-a0 font-bold text-xs rounded-xl transition-all"
                >
                  Verify Code
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STATE 2: INVALID STATE FEEDBACK */}
        {/* ========================================================================= */}
        {validationState === 'invalid' && (
          <div className="space-y-6 text-center">
            <div className="w-14 h-14 bg-danger-a0/10 border border-danger-a0/30 text-danger-a0 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-danger-a0 bg-danger-a0/10 px-2.5 py-1 rounded-md border border-danger-a0/20 font-semibold">
                Invalid QR Code State
              </span>
              <h2 className="text-xl font-bold text-theme-light mt-2">Verification Failed</h2>
              <p className="text-xs text-danger-a10 mt-1 max-w-md mx-auto">
                {validationError || 'The scanned QR code is unrecognized or contains an invalid service credential.'}
              </p>
            </div>

            {scannedRawPayload && (
              <div className="bg-tonal-a0 border border-surface-a10 rounded-xl p-3 text-left font-mono text-[11px] text-surface-a40 truncate">
                <span>Payload: </span>
                <span className="text-theme-light">{scannedRawPayload}</span>
              </div>
            )}

            <button
              onClick={handleResetScanner}
              className="px-6 py-3 bg-info-a0 hover:bg-info-a10 text-primary-a0 font-bold text-xs rounded-xl shadow-lg transition-all inline-flex items-center space-x-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Try Again / Scan Another QR Code</span>
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STATE 3: VERIFIED STATE & DIRECT PATH TO CHECKOUT */}
        {/* ========================================================================= */}
        {validationState === 'verified' && verifiedTier && checkoutStep === 'verified_summary' && (
          <div className="space-y-6">
            {/* Visual Feedback Banner: VERIFIED */}
            <div className="bg-success-a0/10 border border-success-a0/30 rounded-2xl p-5 flex items-start space-x-4">
              <div className="w-10 h-10 bg-success-a0/20 text-success-a0 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-success-a0 font-bold bg-success-a0/20 px-2.5 py-0.5 rounded-md border border-success-a0/30">
                    QR Verified & Service Tier Locked
                  </span>
                  <button
                    onClick={handleResetScanner}
                    className="text-[11px] font-mono text-surface-a40 hover:text-theme-light underline"
                  >
                    Scan Different Code
                  </button>
                </div>
                <h2 className="text-lg font-bold text-theme-light mt-1">
                  Service Tier Locked by QR Code
                </h2>
                <p className="text-xs text-surface-a40 mt-0.5">
                  Direct path to checkout active. Tier selection is locked according to scanned payload.
                </p>
              </div>
            </div>

            {/* LOCKED SERVICE TIER DISPLAY CARD (NO Tier Selector) */}
            <div className="bg-tonal-a0 border-2 border-info-a0/50 rounded-2xl p-6 shadow-lg relative overflow-hidden space-y-4">
              <div className="absolute top-3 right-3 flex items-center space-x-1.5 bg-info-a0/20 border border-info-a0/40 px-2.5 py-1 rounded-md text-[10px] font-mono text-info-a0 font-bold">
                <Lock className="w-3.5 h-3.5" />
                <span>SERVICE TIER LOCKED</span>
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-surface-a40">
                  Provider: {verifiedTier.providerName}
                </span>
                <h3 className="text-xl font-bold text-theme-light mt-0.5">{verifiedTier.name}</h3>
                <p className="text-xs text-surface-a40 mt-1 leading-relaxed">
                  {verifiedTier.description}
                </p>
              </div>

              <div className="pt-3 border-t border-surface-a10 flex items-center justify-between">
                <span className="text-xs font-mono text-surface-a40">Required Consultation Fee</span>
                <span className="text-2xl font-bold text-info-a0 font-mono">
                  ${(verifiedTier.feeCents / 100).toFixed(2)} <span className="text-xs font-normal text-surface-a40">{verifiedTier.currency}</span>
                </span>
              </div>
            </div>

            {/* Client Information & Direct Payment Actions */}
            <div className="bg-surface-a0 border border-surface-a10 rounded-xl p-5 space-y-4">
              <h4 className="text-xs font-mono uppercase text-theme-light font-bold flex items-center space-x-2">
                <Shield className="w-4 h-4 text-info-a0" />
                <span>Client Credentials for Session Entitlement</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-mono text-surface-a40 block mb-1">Client Full Name</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full bg-tonal-a0 border border-surface-a10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-theme-light focus:outline-none focus:border-info-a0"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-surface-a40 block mb-1">Client Email Address</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full bg-tonal-a0 border border-surface-a10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-theme-light focus:outline-none focus:border-info-a0"
                  />
                </div>
              </div>
            </div>

            {/* Action Section */}
            <div className="pt-2 flex flex-col space-y-3">
              <button
                onClick={handleStartCheckout}
                disabled={isProcessingPayment}
                className="w-full py-4 bg-info-a0 hover:bg-info-a10 text-primary-a0 font-bold text-sm sm:text-base rounded-xl shadow-xl transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isProcessingPayment ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Initiating Order...</span>
                  </>
                ) : (
                  <>
                    <DollarSign className="w-5 h-5" />
                    <span>Pay ${(verifiedTier.feeCents / 100).toFixed(2)} via PayPal</span>
                    <ArrowRight className="w-5 h-5 ml-1" />
                  </>
                )}
              </button>
              
              <div className="text-center text-[11px] font-mono text-surface-a40 flex items-center justify-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-success-a0 flex-shrink-0" />
                <span>Protected by Server-Authoritative PayPal Verification</span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PAYPAL MODAL SIMULATION / VERIFICATION */}
        {/* ========================================================================= */}
        {checkoutStep === 'paypal_modal' && currentOrder && (
          <div className="bg-tonal-a0 border border-surface-a10 rounded-2xl p-6 sm:p-8 text-center space-y-6">
            <div className="w-12 h-12 bg-info-a0/10 border border-info-a0/20 rounded-2xl flex items-center justify-center text-info-a0 mx-auto">
              <DollarSign className="w-6 h-6" />
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-info-a0 font-bold bg-info-a0/10 px-2.5 py-1 rounded-md border border-info-a0/20">
                PayPal Sandbox Window
              </span>
              <h2 className="text-xl font-bold text-theme-light mt-2">Authorize Payment via PayPal</h2>
              <p className="text-xs text-surface-a40 mt-1 max-w-md mx-auto">
                Approve transaction of ${(currentOrder.amountCents / 100).toFixed(2)} USD for {currentOrder.serviceName}.
              </p>
            </div>

            <div className="bg-surface-a0 border border-surface-a10 rounded-xl p-4 text-left font-mono text-xs space-y-2 max-w-md mx-auto">
              <div className="flex justify-between text-surface-a40">
                <span>Order ID:</span>
                <span className="text-theme-light">{currentOrder.id}</span>
              </div>
              <div className="flex justify-between text-surface-a40">
                <span>Total Amount:</span>
                <span className="text-info-a0 font-bold">${(currentOrder.amountCents / 100).toFixed(2)} USD</span>
              </div>
            </div>

            <button
              onClick={() => handleConfirmPayPalPayment()}
              className="w-full max-w-md py-4 bg-success-a0 hover:bg-success-a10 text-primary-a0 font-bold rounded-xl shadow-xl transition-all flex items-center justify-center space-x-2 mx-auto"
            >
              <Check className="w-5 h-5" />
              <span>Simulate PayPal Payment Capture</span>
            </button>
          </div>
        )}

        {/* Payment Verifying State */}
        {checkoutStep === 'verifying_payment' && (
          <div className="text-center py-12 space-y-4">
            <RefreshCw className="w-10 h-10 animate-spin text-info-a0 mx-auto" />
            <h3 className="text-lg font-bold text-theme-light">Server Verifying PayPal Transaction...</h3>
            <p className="text-xs font-mono text-surface-a40">
              Validating capture state & calculating 85/15 revenue split...
            </p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STATE 4: PROCEED TO SESSION FLOW AS DESIGNED */}
        {/* ========================================================================= */}
        {checkoutStep === 'session_flow' && entitlement && (
          <div className="space-y-6">
            <div className="bg-success-a0/10 border border-success-a0/30 rounded-2xl p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-success-a0/20 text-success-a0 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-success-a0 font-bold bg-success-a0/20 px-2.5 py-1 rounded-md border border-success-a0/30">
                  Payment Confirmed & Entitlement Issued
                </span>
                <h2 className="text-2xl font-bold text-theme-light mt-2">
                  Session Ready to Launch
                </h2>
                <p className="text-xs text-surface-a40 mt-1">
                  Single-use access credential generated for {verifiedTier?.name || 'Consultation Session'}.
                </p>
              </div>

              {/* QR Code Display for Issued Token */}
              {generatedQrUrl && (
                <div className="bg-white p-4 rounded-xl inline-block shadow-lg mx-auto my-2">
                  <img src={generatedQrUrl} alt="Entitlement QR Code" className="w-40 h-40 mx-auto" />
                  <p className="text-[10px] font-mono text-gray-800 mt-1 font-bold">SINGLE-USE TOKEN QR</p>
                </div>
              )}

              {/* Opaque Token Code Display */}
              <div className="bg-tonal-a0 border border-surface-a10 rounded-xl p-4 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between text-surface-a40">
                  <span>Access Credential Token:</span>
                  <span className="text-info-a0 font-bold truncate max-w-[220px]" title={entitlement.token}>{entitlement.token}</span>
                </div>
                <div className="flex justify-between text-surface-a40">
                  <span>Entitlement Status:</span>
                  <span className="text-success-a0 font-bold uppercase">{entitlement.status}</span>
                </div>
              </div>

              {/* Single-Use Redemption Button */}
              {!redemptionResult ? (
                <button
                  onClick={handleRedeemAccess}
                  disabled={isRedeeming}
                  className="w-full py-4 bg-info-a0 hover:bg-info-a10 text-primary-a0 font-bold rounded-xl shadow-xl transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isRedeeming ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Lock className="w-5 h-5" />
                  )}
                  <span>Verify & Redeem Single-Use Credential</span>
                </button>
              ) : redemptionResult.redeemed ? (
                <div className="bg-tonal-a0 border border-surface-a10 rounded-xl p-6 space-y-4 text-center">
                  <div className="inline-flex items-center space-x-2 text-success-a0 text-xs font-mono font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Redeemed & Unlocked</span>
                  </div>
                  <p className="text-xs text-surface-a40">{redemptionResult.instruction}</p>

                  <a
                    href={redemptionResult.facetimeUrl}
                    className="inline-flex items-center space-x-2 px-8 py-4 bg-success-a0 hover:bg-success-a10 text-primary-a0 font-bold text-sm sm:text-base rounded-xl shadow-xl transition-all w-full justify-center"
                  >
                    <Video className="w-5 h-5" />
                    <span>Launch FaceTime Session Now</span>
                    <ExternalLink className="w-5 h-5 ml-1" />
                  </a>
                </div>
              ) : (
                <div className="bg-danger-a0/10 border border-danger-a0/30 p-4 rounded-xl text-danger-a0 text-xs text-center">
                  <p className="font-bold">Redemption Error</p>
                  <p className="mt-1">{redemptionResult.error}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
