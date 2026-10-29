export const AC_CONTRACT='0xe9568888a0bc317519957047cf736e134B097768';
export const AC_RATE_USD='0.0000006';
export const AC_RATE_UNTIL='2027-04-29T00:00:00Z';
export const AC_SERVICE_DISCOUNT_PERCENT=10;
export function acMicrotokensForCents(cents:bigint):bigint{if(cents<0n)throw Error('Negative amount');return (cents*50000000000n+2n)/3n}
