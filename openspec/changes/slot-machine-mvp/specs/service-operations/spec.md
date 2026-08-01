# Service Operations Specification

## Purpose

Define observable, recoverable operation of the MVP service.

## Requirements

### Requirement: Health and Readiness

The service MUST expose health status independently from readiness. Health MUST indicate that the service process can respond; readiness MUST fail whenever a required dependency prevents safe player or round operations.

#### Scenario: Dependencies are available
- GIVEN the service and required dependencies are operational
- WHEN health and readiness are checked
- THEN both report success

#### Scenario: Required dependency is unavailable
- GIVEN the service responds but a required dependency is unavailable
- WHEN status is checked
- THEN health reports success and readiness reports failure

### Requirement: Privacy-Safe Observability

The service MUST emit structured, correlatable logs for requests and rounds and metrics for spin totals, accepted, rejected, idempotent, insufficient-funds, latency, settlement failures, and dependency health. It MUST NOT record Telegram launch data, secrets, or unnecessary personal data.

#### Scenario: Spin is processed
- GIVEN a spin request has a request or correlation identifier
- WHEN processing completes
- THEN its result class, latency, and privacy-safe round context are observable

#### Scenario: Sensitive input is received
- GIVEN a request contains Telegram launch data or secrets
- WHEN telemetry is emitted
- THEN those sensitive values are absent

### Requirement: Deployable and Recoverable Service

Public player traffic MUST use encrypted transport, runtime secrets MUST NOT appear in distributable artifacts, and persisted players, wallets, rounds, and game versions MUST survive service restart. The system MUST support scheduled backups and a documented, testable restore that preserves atomic settlement records.

#### Scenario: Service restarts
- GIVEN committed player and round data exists
- WHEN the deployed service restarts
- THEN committed data remains available and readiness reflects dependency recovery

#### Scenario: Backup is restored
- GIVEN a valid backup of committed data
- WHEN restore verification is performed in an isolated environment
- THEN player, wallet, round, and game-version consistency is recovered

### Requirement: Verification Coverage

The MVP MUST have automated verification of payout rules, identity isolation, balance settlement, concurrency, idempotency, API contracts, experience states, and one complete development-identity spin-and-recovery flow.

#### Scenario: Release candidate is verified
- GIVEN a release candidate and isolated test data
- WHEN its verification suite runs
- THEN every required behavior is exercised and failures block acceptance
