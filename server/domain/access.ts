import crypto from 'crypto';
import QRCode from 'qrcode';
import { Entitlement } from '../../src/types/index.js';

export function generateOpaqueToken(): string {
  return `gk_tok_${crypto.randomBytes(24).toString('hex')}`;
}

export async function generateQrDataUrl(text: string): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 320,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('QR code generation failed:', err);
    return '';
  }
}

export async function createEntitlement(
  orderId: string,
  providerId: string,
  facetimeHandle: string,
  appBaseUrl: string
): Promise<Entitlement> {
  const token = generateOpaqueToken();
  const createdAt = new Date();
  // Expires in 24 hours
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

  const accessUrl = `${appBaseUrl.replace(/\/$/, '')}/#access=${token}`;
  const qrDataUrl = await generateQrDataUrl(accessUrl);

  const facetimeDeliveryInstruction = facetimeHandle.startsWith('http')
    ? `Join FaceTime meeting room: ${facetimeHandle}`
    : `Open FaceTime on your Apple device and connect directly to: ${facetimeHandle}`;

  return {
    token,
    orderId,
    providerId,
    status: 'active', // active and ready for single-use redemption
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    facetimeDeliveryInstruction,
    qrDataUrl,
  };
}
