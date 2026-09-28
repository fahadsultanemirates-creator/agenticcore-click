// The byte buffers this codebase actually passes around.
//
// TypeScript 5.7 split Uint8Array into Uint8Array<ArrayBuffer> and
// Uint8Array<SharedArrayBuffer>, and a bare `Uint8Array` now means either.
// Neither `fetch` bodies nor `Blob` parts accept "either", so every
// signature typed as plain Uint8Array stopped compiling -- fifteen errors
// that had been sitting in the repo unseen, because nothing type-checked
// the functions before deploying them.
//
// The honest fix is to say what is true rather than to cast it away:
// nothing here ever touches a SharedArrayBuffer. Every one of these buffers
// comes from `new Uint8Array(await blob.arrayBuffer())`, a TextEncoder, or
// a provider's response body, and all of those are ArrayBuffer-backed.
export type Bytes = Uint8Array<ArrayBuffer>;
