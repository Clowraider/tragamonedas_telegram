# Slot Experience Specification

## Purpose

Define the user-visible three-reel interaction driven by authoritative results.

## Requirements

### Requirement: Authoritative Reel Resolution

The experience MUST display exactly three reels and one central winning line. It MUST NOT select, predict, or imply an outcome before receiving the server result; every animation MUST finish on that result. Reduced-motion presentation MUST preserve the same outcome and settlement information.

#### Scenario: Server result arrives
- GIVEN a spin is awaiting its authoritative result
- WHEN the server returns three symbols and settlement data
- THEN the reels resolve to those symbols and the payout and resulting balance are shown

#### Scenario: Reduced motion is preferred
- GIVEN the player prefers reduced motion
- WHEN an authoritative result arrives
- THEN the same symbols and settlement are presented without nonessential motion

### Requirement: Spin-In-Progress State

While a spin request or result animation is in progress, the experience MUST prevent another spin and MUST show a clear pending state. After an uncertain network failure, it MUST retry with the same idempotency key or recover the recorded round before enabling a new spin.

#### Scenario: Repeated input during spin
- GIVEN a spin is in progress
- WHEN the player activates Spin again
- THEN no additional spin request is initiated

#### Scenario: Response is lost
- GIVEN the server may have accepted a spin but its response was lost
- WHEN the experience recovers
- THEN it resolves the original round before allowing another spin

### Requirement: No-Cash-Value Presentation

The experience MUST persistently identify the balance and stake as virtual credits with no cash value and MUST NOT offer purchase, cash-out, transfer, or redemption controls.

#### Scenario: Game screen is displayed
- GIVEN the slot experience is available
- WHEN the player views the game
- THEN the no-cash-value status is visible and no value-bearing control exists
