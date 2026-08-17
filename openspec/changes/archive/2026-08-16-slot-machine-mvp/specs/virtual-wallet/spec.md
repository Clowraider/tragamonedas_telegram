# Virtual Wallet Specification

## Purpose

Define non-monetary credit ownership and balance invariants.

## Requirements

### Requirement: Starting Virtual Balance

A newly created player MUST receive exactly one configured positive-integer starting balance; later bootstrap requests MUST NOT grant it again.

#### Scenario: First player creation

- GIVEN a validated identity with no player
- WHEN bootstrap creates the player
- THEN its wallet contains exactly the configured starting balance

#### Scenario: Existing player returns

- GIVEN an existing player whose balance differs from the starting balance
- WHEN bootstrap is repeated
- THEN the current balance remains unchanged

### Requirement: Virtual Credits Have No Cash Value

Credits MUST be integer-only, MUST NOT be purchasable, transferable, redeemable, or withdrawable, and MUST be presented as having no cash or external value.

#### Scenario: Player views wallet

- GIVEN an authenticated player
- WHEN wallet information is shown
- THEN the balance is labeled as virtual credits with no cash value

#### Scenario: Value-bearing action is requested

- GIVEN any player balance
- WHEN purchase, transfer, redemption, or withdrawal is requested
- THEN the system provides no such operation
