# Security Specification - Vendor Ticket Tracker

## Data Invariants
1. A ticket must have a title, status, and priority.
2. Every ticket must be linked to a valid vendorId.
3. CreatedAt is immutable.
4. Users can only modify status and priority if they are authenticated or authorized via PIN logic (shared account).

## Security Rules (Phase 1)
We will use a shared access model for this tracker, but restrict deletions and sensitive configuration.

## The Dirty Dozen Payloads
TBD during rule drafting.
