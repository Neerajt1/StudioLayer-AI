import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolvePricingMarket } from './pricing-market.js';

describe('resolvePricingMarket', () => {
  it('1. CF-IPCountry = IN → India', () => {
    assert.equal(resolvePricingMarket({ countryCode: 'IN' }), 'india');
    assert.equal(resolvePricingMarket({ countryCode: 'in' }), 'india');
  });

  it('2. CF-IPCountry = US → International', () => {
    assert.equal(resolvePricingMarket({ countryCode: 'US' }), 'international');
  });

  it('3. Valid non-India country → International', () => {
    assert.equal(resolvePricingMarket({ countryCode: 'GB' }), 'international');
    assert.equal(resolvePricingMarket({ countryCode: 'AE' }), 'international');
  });

  it('4. India timezone + no country header → India', () => {
    assert.equal(
      resolvePricingMarket({ timeZone: 'Asia/Kolkata' }),
      'india',
    );
    assert.equal(
      resolvePricingMarket({ timeZone: 'Asia/Calcutta' }),
      'india',
    );
  });

  it('5. Non-India timezone + no country header → International', () => {
    assert.equal(
      resolvePricingMarket({ timeZone: 'America/New_York' }),
      'international',
    );
    assert.equal(resolvePricingMarket({ timeZone: 'Europe/London' }), 'international');
  });

  it('6. Invalid country header + India timezone → India', () => {
    assert.equal(
      resolvePricingMarket({ countryCode: 'XX', timeZone: 'Asia/Kolkata' }),
      'india',
    );
    assert.equal(
      resolvePricingMarket({ countryCode: 'T1', timeZone: 'Asia/Kolkata' }),
      'india',
    );
    assert.equal(
      resolvePricingMarket({ countryCode: 'INDIA', timeZone: 'Asia/Kolkata' }),
      'india',
    );
  });

  it('7. Invalid country header + non-India timezone → International', () => {
    assert.equal(
      resolvePricingMarket({
        countryCode: 'XX',
        timeZone: 'America/New_York',
      }),
      'international',
    );
  });

  it('8. Country header takes precedence over timezone', () => {
    assert.equal(
      resolvePricingMarket({
        countryCode: 'US',
        timeZone: 'Asia/Kolkata',
      }),
      'international',
    );
    assert.equal(
      resolvePricingMarket({
        countryCode: 'IN',
        timeZone: 'America/New_York',
      }),
      'india',
    );
  });
});
