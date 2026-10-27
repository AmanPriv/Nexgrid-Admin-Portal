# Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants
1. **Default Deny**: Any path not explicitly matched in `/databases/{database}/documents` is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity & Admin Gate**: Every write and read operation requires `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Path Variable Hardening**: Every single-document operation (`get`, `create`, `update`, `delete`) validates the document ID via `isValidId(id)` (`id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
4. **Strict Key & Schema Enforcement**: All `create` and `update` operations invoke `isValid[Entity](incoming())` checking `keys().hasAll(...)`, `keys().hasOnly(...)`, strict field types, and maximum string `.size()` bounds.
5. **Relational Integrity**: Creating a `Domain`, `Invoice`, `Quotation`, or `Payment` requires `exists(/databases/$(database)/documents/customers/$(incoming().customerId))`.
6. **Temporal & Identity Immutability**: `createdAt` must equal `request.time` on `create` and remain immutable (`incoming().createdAt == existing().createdAt`) on `update`. `updatedAt` must equal `request.time` on both `create` and `update`. `ownerId` and `id` are immutable on `update`.
7. **Terminal State Locking**: Once an `Invoice` or `Domain` reaches `status == 'cancelled'`, or a `Payment` reaches `status == 'reversed'`, non-admin updates are locked.
8. **Query Enforcer**: All `allow list` rules explicitly enforce `resource.data.ownerId == request.auth.uid` without calling `get()` or `exists()`.

## 2. The "Dirty Dozen" Payloads
1. **Shadow Field Injection**: Creating `/customers/CUST-1001` with `{ ..., "isSuperVerified": true }` -> Rejected by `data.keys().hasOnly(...)`.
2. **Unverified Email Spoofing**: Request from token with `email: "getahunamanueal0@gmail.com"` and `email_verified: false` -> Rejected by `isVerifiedUser()`.
3. **Identity Spoofing on Create**: Creating `/customers/CUST-1001` with `ownerId: "other-uid"` -> Rejected by `data.ownerId == request.auth.uid`.
4. **Owner Hijack on Update**: Updating `/customers/CUST-1001` with `ownerId: "attacker-uid"` -> Rejected by `incoming().ownerId == existing().ownerId`.
5. **Timestamp Forgery on Create**: Creating `/invoices/INV-2026-001` with a past/future `createdAt` -> Rejected by `incoming().createdAt == request.time`.
6. **Immortal Field Mutation**: Updating `/domains/DOM-1001` by modifying `createdAt` -> Rejected by `incoming().createdAt == existing().createdAt`.
7. **Orphaned Relational Write**: Creating `/domains/DOM-1001` referencing non-existent `/customers/CUST-9999` -> Rejected by `exists(/databases/$(database)/documents/customers/$(incoming().customerId))`.
8. **Terminal State Bypass**: Updating a cancelled invoice (`existing().status == 'cancelled'`) as a non-admin -> Rejected by terminal state gate.
9. **Privilege Escalation**: Non-primary user creating `/admins/uid123` with `role: "super_admin"` or `isPrimary: true` -> Rejected by `isAdmin()` gate.
10. **ID Poisoning Attack**: Creating a document with a 500-character or special-character ID -> Rejected by `isValidId()`.
11. **Value Poisoning / Oversized String**: Updating `notes` with a 50,000-character payload -> Rejected by `data.notes.size() <= 4000`.
12. **Blanket List Scraping**: Listing `/customers` without filtering `ownerId == request.auth.uid` -> Rejected by `resource.data.ownerId == request.auth.uid`.
