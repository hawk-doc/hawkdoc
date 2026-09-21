// Sent to Hocuspocus clients when their token is missing, invalid or expired.
// Hocuspocus reports every failure (including a document the user can't
// access) as `permission-denied` unless the thrown error carries its own
// `reason`, so the client needs this to tell "session over" apart.
// Must match INVALID_TOKEN_REASON in apps/web/src/constants/auth.ts.
export const INVALID_TOKEN_REASON = 'invalid-token';
