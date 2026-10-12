import { createHash } from 'node:crypto';
// Public test-only identity. There is no private signing key or production credential.
// Applied only to a temporary copy of dist; shipped manifest/permissions are unchanged.
export const extensionKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAk5A0itRBPNEN8Pf6Quvf51FQZdXoQnLPzkVImzU44NgRTaQQwab2yki7wSw8jRdy/A4Ceyj+/rxOou3OONqUwQ/X9e5zz4ak5GBeOu/zSTVH1zqnSANGKkEEizuIDxW8mH1EeebEo7h/fq04vMp5lLTlBR+q0yMC13B9LtTn2dV/LkGwg5rwiyyg9KZ7Oc3/fTuTpy6Z7gMuwE/5QmXVNgJQ8wdvjb45mtkDfZT6FxPUIRmJd+LF0avstemc7Y0Vr2qoQP833xissmvWX6ajq5ke7zHveqdG8CzOMM2GG0PtfpiwnptKPWq9iRVGfTpQnnIOApx9APOG6X+pD1feuwIDAQAB';
export const extensionId = createHash('sha256').update(Buffer.from(extensionKey, 'base64')).digest('hex').slice(0, 32).split('').map(n => String.fromCharCode(97 + Number.parseInt(n, 16))).join('');
export const extensionOrigin = `chrome-extension://${extensionId}`;
