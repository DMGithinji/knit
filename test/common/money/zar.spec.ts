import { BadRequestException } from '@nestjs/common';
import { centsToRand, randToCents } from '@/common/money/zar';

describe('ZAR conversion', () => {
  it('converts Rand decimals to exact minor units and back', () => {
    expect(randToCents(4500.25)).toBe(450025);
    expect(centsToRand(450025)).toBe(4500.25);
  });

  it('rejects amounts with fractions smaller than one cent', () => {
    expect(() => randToCents(10.001)).toThrow(BadRequestException);
  });
});
