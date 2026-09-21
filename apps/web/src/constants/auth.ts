// Reason the collaboration server gives when it rejects the token itself, as
// opposed to `permission-denied` for a document the user can't open.
// Must match INVALID_TOKEN_REASON in apps/api/src/constants/auth.ts.
export const INVALID_TOKEN_REASON = 'invalid-token';
