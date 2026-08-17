# Delta for Player Identity

## ADDED Requirements

### Requirement: Telegram Profile Metadata Capture

The service MUST capture and store the Telegram `username` and `first_name` fields provided in validated launch data during bootstrap, and MUST update existing player records if their metadata has changed.

#### Scenario: First bootstrap captures profile metadata

- GIVEN authentic Telegram launch data containing `username` "@player_one" and `first_name` "Alice"
- WHEN the player bootstraps for the first time
- THEN the player record is created with `username` "@player_one" and `first_name` "Alice"

#### Scenario: Returning player updates profile metadata

- GIVEN an existing player record with username "@old_name"
- WHEN the player bootstraps with updated Telegram launch data showing username "@new_name"
- THEN the player record updates `username` to "@new_name" while preserving player ID and balance
