-- 1. Enrich players with Telegram metadata
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_players_username ON players(username);

-- 2. Audit logs for administrative balance adjustments
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('grant', 'deduct', 'set')),
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL CHECK (balance_before >= 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  admin_identifier TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_player ON admin_audit_logs(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC);
