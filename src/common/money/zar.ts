import { BadRequestException } from '@nestjs/common';

const CENTS_PER_RAND = 100;

export function randToCents(amount: number): number {
  const scaled = amount * CENTS_PER_RAND;
  const cents = Math.round(scaled);

  if (!Number.isFinite(amount) || !Number.isSafeInteger(cents) || Math.abs(scaled - cents) > 1e-8) {
    throw new BadRequestException('ZAR amounts must have at most two decimal places');
  }

  return cents;
}

export function centsToRand(cents: number): number {
  return cents / CENTS_PER_RAND;
}
