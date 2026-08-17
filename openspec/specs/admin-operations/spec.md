# Admin Operations Specification

## Purpose

Define isolated administrative operations, back-office API endpoints, real-time telemetry, and compliance controls.

## Requirements

### Requirement: Admin Service Network & Authentication Isolation

The system MUST expose admin operations exclusively on an isolated HTTP server listening on port `3001`, and MUST require a valid `ADMIN_API_KEY` provided via `x-admin-api-key` header or authenticated cookie for all endpoints except static UI assets.

#### Scenario: Authenticated request to admin API

- GIVEN a valid `ADMIN_API_KEY` in `x-admin-api-key` or session cookie
- WHEN a client requests `/api/admin/metrics` or other admin endpoints on port `3001`
- THEN the system processes the request and returns HTTP 200 with the payload

#### Scenario: Unauthenticated request rejected

- GIVEN a missing or invalid `ADMIN_API_KEY`
- WHEN a client requests any admin endpoint on port `3001`
- THEN the system rejects the request with HTTP 401 Unauthorized

### Requirement: Global Platform Telemetry

The admin API MUST provide aggregated real-time metrics including total registered players, total circulating virtual credits, total settled spins, and observed return-to-player (RTP) percentage.

#### Scenario: Operator queries global telemetry

- GIVEN settled spin records and active player balances in the database
- WHEN an authenticated admin requests `GET /api/admin/metrics`
- THEN the response returns total players, circulating credits, total spins, and calculated RTP

### Requirement: Player Inspection and Search

The admin API MUST allow searching and paginating registered players by Telegram ID or username, returning profile details, registration date, and current virtual credit balance.

#### Scenario: Search player by username

- GIVEN a registered player with username "gamer123"
- WHEN an admin requests `GET /api/admin/players?search=gamer123`
- THEN the system returns the matching player record including balance and Telegram metadata

### Requirement: Live Spin Feed

The admin API MUST provide a feed of the 50 most recent settled slot rounds across all players, detailing timestamp, player identifier, bet amount, payout, and winning symbols.

#### Scenario: Query recent spins

- GIVEN multiple settled spins in the system
- WHEN an admin requests `GET /api/admin/spins/recent`
- THEN the system returns up to 50 latest spin entries ordered chronologically descending

### Requirement: Back-Office UI & Non-Monetary Compliance Display

The admin web interface MUST be served on port `3001` and MUST conspicuously display a compliance disclaimer stating that all credits are non-monetary virtual test credits.

#### Scenario: Operator accesses admin web console

- GIVEN the admin server is running on port `3001`
- WHEN an operator loads the root page in a browser
- THEN the dashboard UI is delivered with prominent virtual-credit disclaimers
