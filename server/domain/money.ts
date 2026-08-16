import { Settlement } from '../../src/types/index.js';

/**
 * Calculates deterministic 85/15 settlement from minor units (cents).
 * Ensures zero-cent drift: Provider = 85%, Agent = Remainder.
 */
export function calculateSettlement(orderId: string, grossCents: number, currency = 'USD'): Settlement {
  if (grossCents < 0) {
    throw new Error('Gross amount cannot be negative');
  }

  // Calculate Provider 85% share using integer math (floor)
  const providerCents = Math.floor(grossCents * 0.85);

  // Agent gets exact remainder (15% + any sub-cent rounding)
  const agentCents = grossCents - providerCents;

  return {
    orderId,
    grossCents,
    providerCents,
    agentCents,
    currency,
    status: 'settled',
    timestamp: new Date().toISOString(),
  };
}

export function formatCents(cents: number, currency = 'USD'): string {
  const dollars = (cents / 100).toFixed(2);
  return `${currency === 'USD' ? '$' : currency + ' '}${dollars}`;
}
