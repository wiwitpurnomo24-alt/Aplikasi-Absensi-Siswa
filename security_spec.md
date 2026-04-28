# Security Specification - SIADPV SMPN 2 Magelang

## 1. Data Invariants
- **Students**: Every student must have a unique NIS and belong to a valid class.
- **Attendance**: 
    - Every attendance record must reference a valid `studentId`.
    - `type` must be one of ['Sakit', 'Izin', 'Dispensasi'].
    - `status` must transition from 'Pending' to either 'Approved' or 'Rejected' by an Admin/Counselor.
    - Parents can create records but not update them once processed.
- **Counselors**: Manage specific classes; they should only be able to view and process attendance for their `managedClasses`.
- **Admins**: Have full access to all master data and attendance records.

## 2. The "Dirty Dozen" Payloads (Targeting Logic Leaks)

1. **Identity Spoofing**: Logged-in parent tries to submit attendance for a student they don't own by changing `studentId`.
2. **Privilege Escalation**: Non-admin user tries to create a document in the `admins` collection.
3. **State Shortcutting**: Parent tries to create an attendance record with `status: 'Approved'`.
4. **Outcome Reversal**: Once an attendance record is 'Rejected', a counselor tries to change it back to 'Pending' (Violation of terminal state locking).
5. **PII Leak**: Unauthorized user tries to fetch the list of all parent phone numbers.
6. **Resource Poisoning**: Attacker tries to inject 1MB of junk characters into the `studentId` field.
7. **Bypassing Validation**: Submitting an attendance record with an invalid `type` (e.g., 'Bolos').
8. **Shadow Field Injection**: Adding `isVerified: true` to a student document during update.
9. **Relational Sync Breakage**: Creating an attendance record for a non-existent student ID.
10. **Timestamp Spoofing**: Sending a `submittedAt` from 2 hours in the future.
11. **Immortality Breach**: Modifying `createdAt` or `originalOwnerId` after document creation.
12. **Query Scraper**: Attempting to list all `attendance` records without signing in (depending on whether list is restricted).

## 3. Test Cases (TDD)
(These will be verified in `firestore.rules.test.ts` implementation)
- [FAIL] create /admins/{anyId} by any user
- [FAIL] update /attendance/{id} with `status: 'Approved'` by a non-admin
- [FAIL] create /students/{id} by a parent
- [FAIL] update /students/{id} by changing `nis`
- [PASS] create /attendance/{id} by a parent with `status: 'Pending'`
- [PASS] update /attendance/{id} by admin to change status
