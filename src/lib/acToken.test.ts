// AC service payments have been re-enabled by the owner at a fixed six-month rate.
import assert from 'node:assert/strict';
import {AC_CONTRACT,AC_RATE_USD,AC_RATE_UNTIL,AC_SERVICE_DISCOUNT_PERCENT,acMicrotokensForCents} from '../../supabase/functions/_shared/paymentAssets.ts';
assert.equal(AC_CONTRACT.toLowerCase(),'0xe9568888a0bc317519957047cf736e134b097768');assert.equal(AC_RATE_USD,'0.0000006');assert.equal(AC_SERVICE_DISCOUNT_PERCENT,10);assert.equal(AC_RATE_UNTIL,'2027-04-29T00:00:00Z');
assert.equal(acMicrotokensForCents(9000n),150000000000000n);assert.equal(acMicrotokensForCents(4500n),75000000000000n);assert.throws(()=>acMicrotokensForCents(-1n));console.log('PASS  AC fixed-rate, 10% policy and exact token conversion');
