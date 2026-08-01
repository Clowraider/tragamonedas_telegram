CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('telegram', 'development')),
  provider_subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (auth_provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS wallets (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL CHECK (balance >= 0),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS spin_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  request_fingerprint TEXT NOT NULL,
  game_version TEXT NOT NULL,
  stake INTEGER NOT NULL CHECK (stake > 0),
  reel_stops INTEGER[3] NOT NULL,
  symbols TEXT[3] NOT NULL,
  payout INTEGER NOT NULL CHECK (payout >= 0),
  balance_before INTEGER NOT NULL CHECK (balance_before >= 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_spin_rounds_player_created ON spin_rounds(player_id, created_at DESC);
