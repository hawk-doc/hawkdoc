// Test defaults, applied before the modules that read env are imported.
// A real DATABASE_URL/REDIS_URL in the environment wins, so CI can point
// these at its service containers.
process.env['NODE_ENV'] ??= 'test';
process.env['JWT_SECRET'] ??= 'test-secret-test-secret-test-secret-0123456789';
process.env['DATABASE_URL'] ??= 'postgresql://hawkdoc:password@127.0.0.1:5432/hawkdoc';
process.env['REDIS_URL'] ??= 'redis://127.0.0.1:6379';
process.env['ALLOWED_ORIGINS'] ??= 'http://localhost:5173';
// The suites sign up and in far more often than a person would
process.env['AUTH_RATE_LIMIT_MAX'] ??= '10000';
