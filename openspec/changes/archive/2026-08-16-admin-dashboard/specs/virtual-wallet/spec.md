# Delta for Virtual Wallet

## ADDED Requirements

### Requirement: Audited Administrative Balance Adjustment

The system MUST allow authenticated administrators to manually adjust a player's virtual balance (grant `+N`, deduct `-N`, or set `=N`), MUST require a non-empty audit reason for every adjustment, MUST prevent adjustments resulting in a negative balance, and MUST atomically write an immutable audit log entry.

#### Scenario: Grant virtual credits (+N)

- GIVEN a player with current balance 1,000 credits
- WHEN an admin submits an adjustment of `+500` with reason "Test compensation"
- THEN the player's balance becomes 1,500 credits and an audit log entry is recorded

#### Scenario: Deduct virtual credits (-N) with sufficient balance

- GIVEN a player with current balance 1,000 credits
- WHEN an admin submits an adjustment of `-400` with reason "Balance reset"
- THEN the player's balance becomes 600 credits and an audit log entry is recorded

#### Scenario: Deduct virtual credits exceeding balance rejected

- GIVEN a player with current balance 200 credits
- WHEN an admin submits an adjustment of `-500`
- THEN the request is rejected with HTTP 400 and the player balance remains 200 credits

#### Scenario: Set absolute balance (=N)

- GIVEN a player with current balance 500 credits
- WHEN an admin submits a set adjustment of `=2500` with reason "QA testing"
- THEN the player's balance becomes 2,500 credits and an audit log entry is recorded

#### Scenario: Missing or blank audit reason rejected

- GIVEN any valid balance adjustment amount
- WHEN an admin submits the adjustment with an empty or whitespace-only reason
- THEN the request is rejected with HTTP 400 and no balance or audit log changes occur
