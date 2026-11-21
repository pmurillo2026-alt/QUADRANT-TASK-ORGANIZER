# Firestore Security Specification (`Quadrant`)

## 1. Data Invariants
1. **Strict User Ownership & Verified Gmail Identity**: Every document lives beneath `/users/{userId}/...` and requires `request.auth != null`, `request.auth.uid == userId`, and `request.auth.token.email_verified == true`.
2. **PII Isolation**: User email, displayName, and photoURL exist exclusively in `/users/{userId}/private/profile` and are never exposed to other users or public collections.
3. **Immutability & Temporal Integrity**: `uid`, `ownerId`, `id`, and `createdAt` cannot be altered after creation. `createdAt` (on create) and `updatedAt` (on create/update) must equal server `request.time`.
4. **Strict Payload Keys & Bounds**: Every write validates required/allowed keys (`hasAll` / `hasOnly` on create, `affectedKeys().hasOnly(...)` on update), string length bounds, ID regex `^[a-zA-Z0-9_\-]+$`, and enum domains (`Q1`–`Q4`, `coach`/`user`).

## 2. Adversarial "Dirty Dozen" Payloads (All Must Return PERMISSION_DENIED)
1. Unauthenticated read or write to `/users/uidA/tasks/task-1`.
2. Authenticated `uidB` reading or listing `/users/uidA/tasks`.
3. Authenticated `uidA` with `email_verified: false` attempting to create `/users/uidA/private/profile`.
4. Creating a task with `ownerId: "uidB"` inside `/users/uidA/tasks/task-1` (identity spoofing).
5. Creating a task with an invalid 200-char ID or special characters `../admin` in `taskId`.
6. Shadow update adding an unexpected ghost field (`isAdmin: true`) to `/users/uidA/private/profile`.
7. Updating `ownerId` or `createdAt` on an existing `/users/uidA/tasks/task-1` document.
8. Forging a client-supplied past timestamp for `createdAt` or `updatedAt` instead of `serverTimestamp()`.
9. Injecting a 10KB string into `title` (exceeds `maxLength: 160`) or invalid `quadrant: "Q9"`.
10. Setting `thresholdMinutes: 999999` or negative numbers on `/users/uidA/workspace/settings`.
11. Injecting a non-string `content` or `role: "system"` into `/users/uidA/messages/msg-1`.
12. Querying or reading `/users/uidA/private/profile` as `uidB` (PII leak check).
