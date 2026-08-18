-- Migration 003: Performance indexes for Global Metrics & House Stats Aggregations

-- 1. Index to speed up winning spins, payouts, and jackpot aggregations
CREATE INDEX IF NOT EXISTS idx_spin_rounds_payout_stake
  ON spin_rounds(payout, stake);

-- 2. Index to accelerate symbol frequency breakdown
CREATE INDEX IF NOT EXISTS idx_spin_rounds_symbols
  ON spin_rounds USING GIN(symbols);

-- 3. Composite index for time-based spin analytics
CREATE INDEX IF NOT EXISTS idx_spin_rounds_created_at
  ON spin_rounds(created_at DESC);
