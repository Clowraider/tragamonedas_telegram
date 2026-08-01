# API Contracts

`@slot-machine/contracts` is the shared validation boundary for the Mini App and API.

## Guarantees

- Spin requests accept only a positive integer stake and a version identifier. Unknown fields, including client-proposed outcomes, are rejected.
- Settled rounds always contain exactly three known symbols and integer credit values.
- Idempotency keys and resource identifiers use UUIDs.
- History requests default to 20 records and cannot exceed 50 records.
- API errors use a closed set of stable machine-readable codes.

Import the Zod schemas for runtime validation and the inferred TypeScript types for compile-time checks. Runtime inputs must be parsed at the application edge rather than cast to the exported types.
