-- Key/value app settings. Values are JSON so booleans/numbers round-trip.
-- Missing keys fall back to the defaults in src/lib/settings.ts.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
