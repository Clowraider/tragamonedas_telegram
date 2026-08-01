# Player Identity Specification

## Purpose

Define trusted Telegram identity and isolated local-development access.

## Requirements

### Requirement: Telegram Identity Validation

The service MUST validate the authenticity and accepted age of Telegram launch data before assigning a Telegram-backed player, and MUST reject invalid data without creating a player or wallet.

#### Scenario: Valid Telegram launch
- GIVEN authentic, sufficiently recent Telegram launch data
- WHEN the player bootstraps
- THEN the service returns the stable player associated with that Telegram user

#### Scenario: Invalid Telegram launch
- GIVEN missing, altered, or expired Telegram launch data
- WHEN Telegram-backed bootstrap is requested
- THEN access is rejected and no player or wallet is created

### Requirement: Development Identity Isolation

Development identity MUST be available only in an explicitly enabled local-development environment, MUST be visibly identified as development, and MUST NOT resolve to or merge with any Telegram-backed identity.

#### Scenario: Development fallback is enabled
- GIVEN the app runs in the explicitly enabled local-development environment
- WHEN a development identity bootstraps
- THEN an isolated development player is returned and the environment is clearly labeled

#### Scenario: Development fallback is attempted elsewhere
- GIVEN the environment is not explicitly enabled for local development
- WHEN development identity is requested
- THEN access is rejected and no player or wallet is created

### Requirement: Idempotent Player Bootstrap

Bootstrap MUST return the same player and single wallet for repeated requests using the same validated identity.

#### Scenario: Identity returns
- GIVEN a previously bootstrapped validated identity
- WHEN bootstrap is repeated
- THEN the existing player and wallet are returned without resetting balance
