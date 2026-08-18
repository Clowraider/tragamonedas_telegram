-- Migration 004: Performance indexes for Player Analytics & Gamification Stats

-- 1. Accelerate player biggest win and high payout queries
CREATE INDEX IF NOT EXISTS idx_spin_rounds_player_payout
  ON spin_rounds(player_id, payout DESC);

-- 2. Accelerate player stake aggregation & favorite bet analysis
CREATE INDEX IF NOT EXISTS idx_spin_rounds_player_stake
  ON spin_rounds(player_id, stake);

-- 3. Accelerate player streak and chronological round iteration
CREATE INDEX IF NOT EXISTS idx_spin_rounds_player_streak
  ON spin_rounds(player_id, created_at ASC);
