# Security Specification - SIAGA

## Data Invariants
1. **School Isolation**: A user can only access data belonging to their `schoolId`.
2. **Role-Based Access**: 
   - `ADMIN`: Full access to school data.
   - `TEACHER`: Manage students, attendance, tasks, and inquiries in their school.
   - `SUBJECT_TEACHER`: Record attendance for their subjects, manage tasks, and send inquiries to Wali Kelas.
   - `COUNSELOR`: Access attendance and alerts for their managed classes.
   - `PETUGAS_ABSEN_KELAS`: Record school presence.
   - `PARENT`: View attendance and tasks for their own child.
3. **Immutability**: `createdAt` and `ownerId`/`teacherId` fields should be immutable once set.
4. **Valid IDs**: All document IDs and reference IDs must be valid strings.

## The Dirty Dozen Payloads
1. **Unauthorized School Access**: A user from `schoolA` tries to read `schools/schoolB/students/student1`.
2. **Privilege Escalation**: A `PARENT` tries to update `schools/schoolA/attendance/att1` to "Approved".
3. **Data Integrity Violation**: A `TEACHER` tries to create a `subjectAttendance` record without a `studentId`.
4. **Identity Spoofing**: A user tries to create a `subjectInquiry` where `subjectTeacherId` is not their own `auth.uid`.
5. **PII Leak**: A `SUBJECT_TEACHER` tries to read `schools/schoolA/student_pii/student1`.
6. **Shadow Update**: A user tries to add an `isAdmin: true` field to their `users` document.
7. **Terminal State Bypass**: A user tries to change a "Sudah di Jawab" inquiry back to "Menunggu".
8. **Resource Exhaustion**: A user tries to inject a 1MB string into the `notes` field of an attendance record.
9. **Orphaned Writes**: A user tries to create a task for a `className` that doesn't exist in the library.
10. **Query Scraping**: A `PARENT` tries to `list` all attendance records in the school without an `auth.uid` filter.
11. **Timestamp Forgery**: A user tries to set `createdAt` to a date in the future instead of `request.time`.
12. **Recursive Cost Attack**: A malicious query that forces many cross-collection `get()` calls in a loop.

## Test Cases Plan
- Verify that only admins can delete records.
- Verify that `subjectInquiry` replies can only be added by the Wali Kelas or Admin.
- Verify that `read` operations for students return list results only if the user is authenticated and part of that school.
