# Slot Rounds Specification

## Purpose

Define authoritative, retry-safe three-reel rounds and player history.

## Requirements

### Requirement: Fixed Three-Reel Game

Each round MUST use exactly three reels, one central winning line, and the single configured positive-integer stake. The server MUST reject a client-supplied alternative stake or game version.

#### Scenario: Valid spin
- GIVEN an authenticated player can afford the configured stake
- WHEN a spin is requested for the current game version
- THEN one round is accepted with exactly three central-line symbols and the fixed stake

#### Scenario: Invalid game terms
- GIVEN a request changes the stake or uses an unavailable game version
- WHEN the spin is submitted
- THEN no round or balance change occurs

### Requirement: Server-Authoritative Outcome and Payout

The server MUST generate the outcome using a production-grade cryptographically secure random source and MUST evaluate payout solely from the three central-line symbols and the immutable payout rules version recorded by the round. Client-proposed outcomes MUST be ignored or rejected.

#### Scenario: Winning outcome
- GIVEN an accepted spin whose symbols match a payout rule
- WHEN the server settles the round
- THEN the recorded payout equals that versioned rule and the authoritative symbols are returned

#### Scenario: Non-winning outcome
- GIVEN an accepted spin whose symbols match no payout rule
- WHEN the server settles the round
- THEN the recorded payout is zero

### Requirement: Sufficient Funds

The server MUST reject a spin when the available balance is below the fixed stake.

#### Scenario: Insufficient funds
- GIVEN a balance below the fixed stake
- WHEN a spin is requested
- THEN an insufficient-funds result is returned with no round or balance change

### Requirement: Atomic Settlement

Round creation, stake deduction, payout credit, and resulting balance MUST commit as one indivisible settlement. The balance after MUST equal balance before minus stake plus payout; any failure MUST preserve the prior balance and omit an incomplete settled round.

#### Scenario: Settlement succeeds
- GIVEN an accepted spin
- WHEN settlement commits
- THEN one settled round and its matching before/after balances become visible together

#### Scenario: Settlement fails
- GIVEN a failure before settlement commits
- WHEN the operation ends
- THEN neither a balance change nor a settled round is visible

#### Scenario: Concurrent spins cannot overspend
- GIVEN a player balance can fund only one of two concurrent spins
- WHEN both settlements are attempted
- THEN at most one settles and the balance never becomes negative

### Requirement: Idempotent Spin Retry

Each spin MUST require a player-scoped idempotency key. Repeating the same key and request MUST return the original round without another outcome or balance change; reusing it for different terms MUST be rejected.

#### Scenario: Identical retry
- GIVEN a settled spin and its idempotency key
- WHEN the same player retries the same request
- THEN the original round is returned and the balance is unchanged

#### Scenario: Conflicting retry
- GIVEN an idempotency key already used by the player
- WHEN that key is reused with different terms
- THEN the request is rejected without a new round or balance change

### Requirement: Player Round Recovery and History

An authenticated player MUST be able to retrieve a round by identifier and a bounded newest-first history containing only that player's rounds. Each record MUST expose status, three-symbol outcome, rules version, stake, payout, before/after balances, and timestamps.

#### Scenario: Recover own round
- GIVEN a player has a recorded round
- WHEN that player requests its identifier
- THEN the authoritative recorded round is returned

#### Scenario: List history safely
- GIVEN multiple players have rounds
- WHEN one player requests history
- THEN a bounded newest-first list contains only that player's rounds
