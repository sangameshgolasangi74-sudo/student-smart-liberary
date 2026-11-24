import { Router } from 'express';
import crypto from 'node:crypto';
import { db, hashPasswordSync } from '../db.ts';
import { requireAuth, requireOwner, logAudit, createNotification, type AuthRequest } from '../auth.ts';

const router = Router();
router.use(requireAuth, requireOwner);

router.get('/overview', (_req, res) => {
  const totalStudents = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'STUDENT'").get() as { c: number }).c;
  const activeStudents = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'STUDENT' AND status = 'ACTIVE'").get() as { c: number }).c;
  const suspendedStudents = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'STUDENT' AND status != 'ACTIVE'").get() as { c: number }).c;
  const pendingVerifications = (db.prepare("SELECT COUNT(*) as c FROM student_profiles WHERE verification_status = 'PENDING'").get() as { c: number }).c;

  const totalBooks = (db.prepare('SELECT COUNT(*) as c FROM book_listings').get() as { c: number }).c;
  const approvedBooks = (db.prepare("SELECT COUNT(*) as c FROM book_listings WHERE approval_status = 'APPROVED'").get() as { c: number }).c;
  const pendingBooks = (db.prepare("SELECT COUNT(*) as c FROM book_listings WHERE approval_status = 'PENDING'").get() as { c: number }).c;
  const rejectedBooks = (db.prepare("SELECT COUNT(*) as c FROM book_listings WHERE approval_status = 'REJECTED'").get() as { c: number }).c;

  const pendingExchanges = (db.prepare("SELECT COUNT(*) as c FROM exchange_requests WHERE status = 'PENDING'").get() as { c: number }).c;
  const completedExchanges = (db.prepare("SELECT COUNT(*) as c FROM exchange_requests WHERE status = 'COMPLETED'").get() as { c: number }).c;

  const pendingDonations = (
    db.prepare("SELECT COUNT(*) as c FROM book_listings WHERE listing_type = 'DONATION' AND approval_status = 'PENDING'").get() as { c: number }
  ).c + (db.prepare("SELECT COUNT(*) as c FROM donation_requests WHERE status = 'PENDING'").get() as { c: number }).c;
  const totalDonations = (
    db.prepare("SELECT COUNT(*) as c FROM book_listings WHERE listing_type = 'DONATION'").get() as { c: number }
  ).c;

  const openReports = (db.prepare("SELECT COUNT(*) as c FROM reports WHERE status = 'OPEN'").get() as { c: number }).c;

  const departmentBreakdown = db
    .prepare(`
      SELECT d.code, d.name, COUNT(bl.id) as listings_count
      FROM departments d
      LEFT JOIN books b ON b.department_id = d.id
      LEFT JOIN book_listings bl ON bl.book_id = b.id
      GROUP BY d.id
      ORDER BY listings_count DESC
    `)
    .all();

  const listingStatusBreakdown = db
    .prepare(`
      SELECT approval_status as status, COUNT(*) as count
      FROM book_listings
      GROUP BY approval_status
    `)
    .all();

  const listingTypeBreakdown = db
    .prepare(`
      SELECT listing_type as type, COUNT(*) as count
      FROM book_listings
      GROUP BY listing_type
    `)
    .all();

  const recentActivities = db
    .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 12')
    .all();

  res.json({
    metrics: {
      totalStudents,
      activeStudents,
      suspendedStudents,
      pendingVerifications,
      totalBooks,
      approvedBooks,
      pendingBooks,
      rejectedBooks,
      pendingExchanges,
      completedExchanges,
      pendingDonations,
      totalDonations,
      openReports
    },
    charts: {
      departmentBreakdown,
      listingStatusBreakdown,
      listingTypeBreakdown
    },
    recentActivities
  });
});

// STUDENT MANAGEMENT & VERIFICATION
router.get('/students', (_req, res) => {
  const students = db
    .prepare(`
      SELECT u.id, u.email, u.status, u.is_verified, u.created_at, u.last_login_at,
             sp.full_name, sp.student_id_number, sp.phone, sp.bio, sp.verification_status, sp.verification_note,
             d.id as department_id, d.name as department_name, d.code as department_code,
             s.id as semester_id, s.label as semester_label,
             (SELECT COUNT(*) FROM book_listings bl WHERE bl.owner_student_id = u.id) as total_listings,
             (SELECT COUNT(*) FROM exchange_requests er WHERE er.requester_student_id = u.id) as total_requests
      FROM users u
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN departments d ON sp.department_id = d.id
      LEFT JOIN semesters s ON sp.semester_id = s.id
      WHERE u.role = 'STUDENT'
      ORDER BY u.id DESC
    `)
    .all();
  res.json({ students });
});

router.get('/students/:id', (req, res) => {
  const studentId = Number(req.params.id);
  const student = db
    .prepare(`
      SELECT u.id, u.email, u.status, u.is_verified, u.created_at, u.last_login_at,
             sp.*, d.name as department_name, s.label as semester_label
      FROM users u
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN departments d ON sp.department_id = d.id
      LEFT JOIN semesters s ON sp.semester_id = s.id
      WHERE u.id = ? AND u.role = 'STUDENT'
    `)
    .get(studentId);

  if (!student) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  const listings = db
    .prepare(`
      SELECT bl.*, b.title, b.author
      FROM book_listings bl
      JOIN books b ON bl.book_id = b.id
      WHERE bl.owner_student_id = ?
      ORDER BY bl.id DESC
    `)
    .all(studentId);

  const exchanges = db
    .prepare(`
      SELECT er.*, b.title as book_title
      FROM exchange_requests er
      JOIN book_listings bl ON er.listing_id = bl.id
      JOIN books b ON bl.book_id = b.id
      WHERE er.requester_student_id = ? OR bl.owner_student_id = ?
      ORDER BY er.id DESC
    `)
    .all(studentId, studentId);

  const activities = db
    .prepare('SELECT * FROM audit_logs WHERE actor_user_id = ? ORDER BY id DESC LIMIT 25')
    .all(studentId);

  res.json({ student, listings, exchanges, activities });
});

router.patch('/students/:id/status', (req: AuthRequest, res) => {
  const studentId = Number(req.params.id);
  const { status, reason } = req.body ?? {};
  if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
    res.status(400).json({ error: 'Invalid status value.' });
    return;
  }

  const current = db.prepare("SELECT id, email, status FROM users WHERE id = ? AND role = 'STUDENT'").get(studentId) as
    | { id: number; email: string; status: string }
    | undefined;
  if (!current) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, studentId);

  createNotification({
    userId: studentId,
    title: `Account Status Updated: ${status}`,
    message: reason ? `Administrator note: ${reason}` : `Your account status has been changed to ${status}.`,
    type: status === 'ACTIVE' ? 'SUCCESS' : 'WARNING',
    relatedEntityType: 'USER',
    relatedEntityId: studentId
  });

  logAudit({
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: 'STUDENT_STATUS_CHANGED',
    affectedTable: 'users',
    affectedId: studentId,
    previousStatus: current.status,
    newStatus: status,
    details: typeof reason === 'string' ? reason : ''
  });

  res.json({ success: true });
});

router.patch('/students/:id/verification', (req: AuthRequest, res) => {
  const studentId = Number(req.params.id);
  const { verificationStatus, note } = req.body ?? {};
  if (!['VERIFIED', 'REJECTED', 'PENDING'].includes(verificationStatus)) {
    res.status(400).json({ error: 'Invalid verification status.' });
    return;
  }

  const current = db
    .prepare('SELECT user_id, verification_status FROM student_profiles WHERE user_id = ?')
    .get(studentId) as { user_id: number; verification_status: string } | undefined;

  if (!current) {
    res.status(404).json({ error: 'Student profile not found.' });
    return;
  }

  db.prepare(`
    UPDATE student_profiles SET verification_status = ?, verification_note = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(verificationStatus, typeof note === 'string' ? note.trim() : '', studentId);

  db.prepare('UPDATE users SET is_verified = ? WHERE id = ?').run(verificationStatus === 'VERIFIED' ? 1 : 0, studentId);

  db.prepare(`
    INSERT INTO approval_records (entity_type, entity_id, decision, reason, decided_by)
    VALUES ('STUDENT_VERIFICATION', ?, ?, ?, ?)
  `).run(studentId, verificationStatus, typeof note === 'string' ? note.trim() : '', req.user!.id);

  createNotification({
    userId: studentId,
    title: verificationStatus === 'VERIFIED' ? 'Academic Verification Approved' : 'Academic Verification Update',
    message:
      verificationStatus === 'VERIFIED'
        ? 'Your student identity has been verified by the Super Administrator.'
        : `Verification marked as ${verificationStatus}.${note ? ` Reason: ${note}` : ''}`,
    type: verificationStatus === 'VERIFIED' ? 'SUCCESS' : 'WARNING',
    relatedEntityType: 'STUDENT_PROFILE',
    relatedEntityId: studentId
  });

  logAudit({
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: `STUDENT_VERIFICATION_${verificationStatus}`,
    affectedTable: 'student_profiles',
    affectedId: studentId,
    previousStatus: current.verification_status,
    newStatus: verificationStatus,
    details: typeof note === 'string' ? note.trim() : ''
  });

  res.json({ success: true });
});

router.delete('/students/:id', (req: AuthRequest, res) => {
  const studentId = Number(req.params.id);
  const current = db.prepare("SELECT id, email FROM users WHERE id = ? AND role = 'STUDENT'").get(studentId) as
    | { id: number; email: string }
    | undefined;
  if (!current) {
    res.status(404).json({ error: 'Student not found.' });
    return;
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(studentId);
  logAudit({
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: 'STUDENT_DELETED',
    affectedTable: 'users',
    affectedId: studentId,
    previousStatus: 'ACTIVE',
    newStatus: 'DELETED',
    details: `Deleted student account ${current.email}`
  });
  res.json({ success: true });
});

// BOOK MANAGEMENT & APPROVAL CENTER
router.get('/books', (_req, res) => {
  const books = db
    .prepare(`
      SELECT bl.*, b.title, b.author, b.isbn, b.edition, b.publisher, b.publication_year, b.description, b.cover_image_url,
             b.category_id, b.department_id, b.semester_id, b.subject_id,
             c.name as category_name, d.name as department_name, d.code as department_code,
             sem.label as semester_label, subj.name as subject_name, subj.code as subject_code,
             u.email as owner_email, sp.full_name as owner_name, sp.student_id_number as owner_sid
      FROM book_listings bl
      JOIN books b ON bl.book_id = b.id
      JOIN users u ON bl.owner_student_id = u.id
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN departments d ON b.department_id = d.id
      LEFT JOIN semesters sem ON b.semester_id = sem.id
      LEFT JOIN subjects subj ON b.subject_id = subj.id
      ORDER BY CASE WHEN bl.approval_status = 'PENDING' THEN 0 ELSE 1 END, bl.id DESC
    `)
    .all();

  const history = db
    .prepare(`
      SELECT ar.*, u.email as decided_by_email
      FROM approval_records ar
      JOIN users u ON ar.decided_by = u.id
      WHERE ar.entity_type = 'BOOK_LISTING'
      ORDER BY ar.id DESC
      LIMIT 50
    `)
    .all();

  res.json({ books, history });
});

router.patch('/books/:id/decision', (req: AuthRequest, res) => {
  const listingId = Number(req.params.id);
  const { decision, reason } = req.body ?? {};
  if (!['APPROVED', 'REJECTED', 'REMOVED'].includes(decision)) {
    res.status(400).json({ error: 'Invalid approval decision.' });
    return;
  }
  if ((decision === 'REJECTED' || decision === 'REMOVED') && (typeof reason !== 'string' || reason.trim().length < 3)) {
    res.status(400).json({ error: 'A clear reason is required when rejecting or removing a book listing.' });
    return;
  }

  const listing = db
    .prepare(`
      SELECT bl.id, bl.owner_student_id, bl.approval_status, b.title
      FROM book_listings bl
      JOIN books b ON bl.book_id = b.id
      WHERE bl.id = ?
    `)
    .get(listingId) as { id: number; owner_student_id: number; approval_status: string; title: string } | undefined;

  if (!listing) {
    res.status(404).json({ error: 'Book listing not found.' });
    return;
  }

  const cleanReason = typeof reason === 'string' ? reason.trim() : '';

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE book_listings
      SET approval_status = ?, rejection_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(decision, decision === 'APPROVED' ? '' : cleanReason, listingId);

    db.prepare(`
      INSERT INTO approval_records (entity_type, entity_id, decision, reason, decided_by)
      VALUES ('BOOK_LISTING', ?, ?, ?, ?)
    `).run(listingId, decision, cleanReason, req.user!.id);

    createNotification({
      userId: listing.owner_student_id,
      title: `Book Listing ${decision === 'APPROVED' ? 'Approved' : decision === 'REJECTED' ? 'Rejected' : 'Removed'}`,
      message:
        decision === 'APPROVED'
          ? `Your book "${listing.title}" has been approved and is now visible in the academic catalog.`
          : `Your book "${listing.title}" was ${decision.toLowerCase()}. Reason: ${cleanReason}`,
      type: decision === 'APPROVED' ? 'SUCCESS' : 'ERROR',
      relatedEntityType: 'BOOK_LISTING',
      relatedEntityId: listingId
    });

    logAudit({
      actorUserId: req.user!.id,
      actorEmail: req.user!.email,
      action: `BOOK_${decision}`,
      affectedTable: 'book_listings',
      affectedId: listingId,
      previousStatus: listing.approval_status,
      newStatus: decision,
      details: cleanReason || `Approved "${listing.title}"`
    });
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Decision update failed.' });
    return;
  }

  res.json({ success: true });
});

router.put('/books/:id', (req: AuthRequest, res) => {
  const listingId = Number(req.params.id);
  const { title, author, isbn, edition, condition, listingType, availabilityStatus, categoryId, departmentId, semesterId, subjectId, notes } =
    req.body ?? {};

  const listing = db.prepare('SELECT id, book_id, availability_status FROM book_listings WHERE id = ?').get(listingId) as
    | { id: number; book_id: number; availability_status: string }
    | undefined;
  if (!listing) {
    res.status(404).json({ error: 'Listing not found.' });
    return;
  }

  db.prepare(`
    UPDATE books
    SET title = COALESCE(?, title),
        author = COALESCE(?, author),
        isbn = COALESCE(?, isbn),
        edition = COALESCE(?, edition),
        category_id = COALESCE(?, category_id),
        department_id = COALESCE(?, department_id),
        semester_id = COALESCE(?, semester_id),
        subject_id = COALESCE(?, subject_id)
    WHERE id = ?
  `).run(
    title ?? null,
    author ?? null,
    isbn ?? null,
    edition ?? null,
    categoryId ? Number(categoryId) : null,
    departmentId ? Number(departmentId) : null,
    semesterId ? Number(semesterId) : null,
    subjectId ? Number(subjectId) : null,
    listing.book_id
  );

  db.prepare(`
    UPDATE book_listings
    SET condition = COALESCE(?, condition),
        listing_type = COALESCE(?, listing_type),
        availability_status = COALESCE(?, availability_status),
        notes = COALESCE(?, notes),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(condition ?? null, listingType ?? null, availabilityStatus ?? null, notes ?? null, listingId);

  logAudit({
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: 'BOOK_EDITED_BY_OWNER',
    affectedTable: 'book_listings',
    affectedId: listingId,
    previousStatus: listing.availability_status,
    newStatus: availabilityStatus || listing.availability_status,
    details: `Updated book metadata for listing #${listingId}`
  });

  res.json({ success: true });
});

router.delete('/books/:id', (req: AuthRequest, res) => {
  const listingId = Number(req.params.id);
  const listing = db.prepare('SELECT id, book_id FROM book_listings WHERE id = ?').get(listingId) as
    | { id: number; book_id: number }
    | undefined;
  if (!listing) {
    res.status(404).json({ error: 'Listing not found.' });
    return;
  }
  db.prepare('DELETE FROM book_listings WHERE id = ?').run(listingId);
  logAudit({
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: 'BOOK_DELETED_BY_OWNER',
    affectedTable: 'book_listings',
    affectedId: listingId,
    newStatus: 'DELETED'
  });
  res.json({ success: true });
});

// TAXONOMY MANAGEMENT (Categories, Departments, Semesters, Subjects)
router.post('/taxonomy/categories', (req: AuthRequest, res) => {
  const { name, description } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ error: 'Category name is required.' });
    return;
  }
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const result = db.prepare('INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)').run(name.trim(), slug, description ?? '');
  logAudit({ actorUserId: req.user!.id, actorEmail: req.user!.email, action: 'CATEGORY_CREATED', affectedTable: 'categories', affectedId: Number(result.lastInsertRowid), details: name.trim() });
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

router.delete('/taxonomy/categories/:id', (req: AuthRequest, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

router.post('/taxonomy/departments', (req: AuthRequest, res) => {
  const { code, name } = req.body ?? {};
  if (typeof code !== 'string' || typeof name !== 'string' || !code.trim() || !name.trim()) {
    res.status(400).json({ error: 'Department code and name are required.' });
    return;
  }
  const result = db.prepare('INSERT INTO departments (code, name) VALUES (?, ?)').run(code.trim().toUpperCase(), name.trim());
  logAudit({ actorUserId: req.user!.id, actorEmail: req.user!.email, action: 'DEPARTMENT_CREATED', affectedTable: 'departments', affectedId: Number(result.lastInsertRowid), details: `${code.trim().toUpperCase()} - ${name.trim()}` });
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

router.delete('/taxonomy/departments/:id', (req: AuthRequest, res) => {
  db.prepare('DELETE FROM departments WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

router.post('/taxonomy/subjects', (req: AuthRequest, res) => {
  const { departmentId, semesterId, code, name } = req.body ?? {};
  if (!departmentId || !semesterId || typeof code !== 'string' || typeof name !== 'string') {
    res.status(400).json({ error: 'Department, semester, code, and subject name are required.' });
    return;
  }
  const result = db
    .prepare('INSERT INTO subjects (department_id, semester_id, code, name) VALUES (?, ?, ?, ?)')
    .run(Number(departmentId), Number(semesterId), code.trim().toUpperCase(), name.trim());
  logAudit({ actorUserId: req.user!.id, actorEmail: req.user!.email, action: 'SUBJECT_CREATED', affectedTable: 'subjects', affectedId: Number(result.lastInsertRowid), details: `${code.trim().toUpperCase()} - ${name.trim()}` });
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

router.delete('/taxonomy/subjects/:id', (req: AuthRequest, res) => {
  db.prepare('DELETE FROM subjects WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

// EXCHANGE REQUEST MANAGEMENT
router.get('/exchanges', (_req, res) => {
  const exchanges = db
    .prepare(`
      SELECT er.*, b.title as book_title, b.author as book_author,
             bl.owner_student_id, bl.listing_type,
             req_sp.full_name as requester_name, req_u.email as requester_email,
             own_sp.full_name as owner_name, own_u.email as owner_email,
             ob.title as offered_book_title
      FROM exchange_requests er
      JOIN book_listings bl ON er.listing_id = bl.id
      JOIN books b ON bl.book_id = b.id
      JOIN users req_u ON er.requester_student_id = req_u.id
      LEFT JOIN student_profiles req_sp ON req_u.id = req_sp.user_id
      JOIN users own_u ON bl.owner_student_id = own_u.id
      LEFT JOIN student_profiles own_sp ON own_u.id = own_sp.user_id
      LEFT JOIN book_listings obl ON er.offered_listing_id = obl.id
      LEFT JOIN books ob ON obl.book_id = ob.id
      ORDER BY CASE WHEN er.status = 'PENDING' THEN 0 ELSE 1 END, er.id DESC
    `)
    .all();
  res.json({ exchanges });
});

router.patch('/exchanges/:id/decision', (req: AuthRequest, res) => {
  const reqId = Number(req.params.id);
  const { status, reason } = req.body ?? {};
  if (!['APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status)) {
    res.status(400).json({ error: 'Invalid exchange status.' });
    return;
  }
  if ((status === 'REJECTED' || status === 'CANCELLED') && (typeof reason !== 'string' || reason.trim().length < 3)) {
    res.status(400).json({ error: 'A rejection or cancellation reason is required.' });
    return;
  }

  const row = db
    .prepare(`
      SELECT er.*, bl.owner_student_id, b.title as book_title
      FROM exchange_requests er
      JOIN book_listings bl ON er.listing_id = bl.id
      JOIN books b ON bl.book_id = b.id
      WHERE er.id = ?
    `)
    .get(reqId) as { id: number; listing_id: number; offered_listing_id: number | null; requester_student_id: number; owner_student_id: number; status: string; book_title: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Exchange request not found.' });
    return;
  }

  const cleanReason = typeof reason === 'string' ? reason.trim() : '';

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE exchange_requests
      SET status = ?, rejection_reason = ?, reviewed_by = ?, updated_at = datetime('now'),
          completed_at = CASE WHEN ? = 'COMPLETED' THEN datetime('now') ELSE completed_at END
      WHERE id = ?
    `).run(status, cleanReason, req.user!.id, status, reqId);

    if (status === 'APPROVED' || status === 'IN_PROGRESS') {
      db.prepare("UPDATE book_listings SET availability_status = 'RESERVED', updated_at = datetime('now') WHERE id = ?").run(row.listing_id);
    } else if (status === 'COMPLETED') {
      db.prepare("UPDATE book_listings SET availability_status = 'EXCHANGED', updated_at = datetime('now') WHERE id = ?").run(row.listing_id);
      if (row.offered_listing_id) {
        db.prepare("UPDATE book_listings SET availability_status = 'EXCHANGED', updated_at = datetime('now') WHERE id = ?").run(row.offered_listing_id);
      }
    } else if (status === 'REJECTED' || status === 'CANCELLED') {
      db.prepare("UPDATE book_listings SET availability_status = 'AVAILABLE', updated_at = datetime('now') WHERE id = ?").run(row.listing_id);
    }

    db.prepare(`
      INSERT INTO approval_records (entity_type, entity_id, decision, reason, decided_by)
      VALUES ('EXCHANGE_REQUEST', ?, ?, ?, ?)
    `).run(reqId, status, cleanReason, req.user!.id);

    const statusMsg = cleanReason ? `${status}. Reason: ${cleanReason}` : status;
    createNotification({
      userId: row.requester_student_id,
      title: `Exchange Request ${status}`,
      message: `Your exchange request for "${row.book_title}" is now ${statusMsg}`,
      type: status === 'REJECTED' || status === 'CANCELLED' ? 'ERROR' : 'SUCCESS',
      relatedEntityType: 'EXCHANGE_REQUEST',
      relatedEntityId: reqId
    });
    createNotification({
      userId: row.owner_student_id,
      title: `Exchange Update: ${status}`,
      message: `Exchange request for your book "${row.book_title}" was updated to ${statusMsg}`,
      type: 'INFO',
      relatedEntityType: 'EXCHANGE_REQUEST',
      relatedEntityId: reqId
    });

    logAudit({
      actorUserId: req.user!.id,
      actorEmail: req.user!.email,
      action: `EXCHANGE_${status}`,
      affectedTable: 'exchange_requests',
      affectedId: reqId,
      previousStatus: row.status,
      newStatus: status,
      details: cleanReason || `Updated exchange #${reqId} for "${row.book_title}"`
    });

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update exchange request.' });
    return;
  }

  res.json({ success: true });
});

// DONATION MANAGEMENT
router.get('/donations', (_req, res) => {
  const donatedListings = db
    .prepare(`
      SELECT bl.*, b.title, b.author, b.cover_image_url, b.edition,
             d.name as department_name, sem.label as semester_label,
             sp.full_name as donor_name, u.email as donor_email
      FROM book_listings bl
      JOIN books b ON bl.book_id = b.id
      JOIN users u ON bl.owner_student_id = u.id
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN departments d ON b.department_id = d.id
      LEFT JOIN semesters sem ON b.semester_id = sem.id
      WHERE bl.listing_type = 'DONATION'
      ORDER BY CASE WHEN bl.approval_status = 'PENDING' THEN 0 ELSE 1 END, bl.id DESC
    `)
    .all();

  const donationRequests = db
    .prepare(`
      SELECT dr.*, b.title as book_title, b.author as book_author,
             donor_sp.full_name as donor_name,
             recip_sp.full_name as recipient_name, recip_u.email as recipient_email
      FROM donation_requests dr
      JOIN book_listings bl ON dr.listing_id = bl.id
      JOIN books b ON bl.book_id = b.id
      LEFT JOIN student_profiles donor_sp ON dr.donor_student_id = donor_sp.user_id
      JOIN users recip_u ON dr.recipient_student_id = recip_u.id
      LEFT JOIN student_profiles recip_sp ON recip_u.id = recip_sp.user_id
      ORDER BY CASE WHEN dr.status = 'PENDING' THEN 0 ELSE 1 END, dr.id DESC
    `)
    .all();

  res.json({ donatedListings, donationRequests });
});

router.patch('/donations/requests/:id/decision', (req: AuthRequest, res) => {
  const reqId = Number(req.params.id);
  const { status, reason } = req.body ?? {};
  if (!['APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'].includes(status)) {
    res.status(400).json({ error: 'Invalid donation decision.' });
    return;
  }
  if ((status === 'REJECTED' || status === 'CANCELLED') && (typeof reason !== 'string' || reason.trim().length < 3)) {
    res.status(400).json({ error: 'Reason is required when rejecting or cancelling.' });
    return;
  }

  const row = db
    .prepare(`
      SELECT dr.*, b.title as book_title
      FROM donation_requests dr
      JOIN book_listings bl ON dr.listing_id = bl.id
      JOIN books b ON bl.book_id = b.id
      WHERE dr.id = ?
    `)
    .get(reqId) as { id: number; listing_id: number; donor_student_id: number; recipient_student_id: number; status: string; book_title: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Donation request not found.' });
    return;
  }

  const cleanReason = typeof reason === 'string' ? reason.trim() : '';

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE donation_requests
      SET status = ?, rejection_reason = ?, reviewed_by = ?, updated_at = datetime('now'),
          completed_at = CASE WHEN ? = 'COMPLETED' THEN datetime('now') ELSE completed_at END
      WHERE id = ?
    `).run(status, cleanReason, req.user!.id, status, reqId);

    if (status === 'APPROVED') {
      db.prepare("UPDATE book_listings SET availability_status = 'RESERVED', updated_at = datetime('now') WHERE id = ?").run(row.listing_id);
    } else if (status === 'COMPLETED') {
      db.prepare("UPDATE book_listings SET availability_status = 'DONATED', updated_at = datetime('now') WHERE id = ?").run(row.listing_id);
    } else if (status === 'REJECTED' || status === 'CANCELLED') {
      db.prepare("UPDATE book_listings SET availability_status = 'AVAILABLE', updated_at = datetime('now') WHERE id = ?").run(row.listing_id);
    }

    createNotification({
      userId: row.recipient_student_id,
      title: `Donation Request ${status}`,
      message: `Your request for donated book "${row.book_title}" is now ${status}.${cleanReason ? ` Reason: ${cleanReason}` : ''}`,
      type: status === 'REJECTED' ? 'ERROR' : 'SUCCESS',
      relatedEntityType: 'DONATION_REQUEST',
      relatedEntityId: reqId
    });

    logAudit({
      actorUserId: req.user!.id,
      actorEmail: req.user!.email,
      action: `DONATION_REQUEST_${status}`,
      affectedTable: 'donation_requests',
      affectedId: reqId,
      previousStatus: row.status,
      newStatus: status,
      details: cleanReason
    });

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Donation update failed.' });
    return;
  }

  res.json({ success: true });
});

// REPORTS & CONTENT MODERATION
router.get('/reports', (_req, res) => {
  const reports = db
    .prepare(`
      SELECT r.*, b.title as book_title, bl.approval_status as listing_approval_status,
             u.email as reporter_email, sp.full_name as reporter_name
      FROM reports r
      JOIN book_listings bl ON r.listing_id = bl.id
      JOIN books b ON bl.book_id = b.id
      JOIN users u ON r.reporter_user_id = u.id
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      ORDER BY CASE WHEN r.status = 'OPEN' THEN 0 ELSE 1 END, r.id DESC
    `)
    .all();
  res.json({ reports });
});

router.patch('/reports/:id', (req: AuthRequest, res) => {
  const reportId = Number(req.params.id);
  const { status, resolutionNote, removeListing } = req.body ?? {};
  if (!['RESOLVED', 'DISMISSED'].includes(status)) {
    res.status(400).json({ error: 'Invalid report resolution status.' });
    return;
  }

  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as { id: number; listing_id: number; status: string } | undefined;
  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }

  db.prepare(`
    UPDATE reports
    SET status = ?, resolution_note = ?, resolved_by = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).run(status, typeof resolutionNote === 'string' ? resolutionNote.trim() : '', req.user!.id, reportId);

  if (removeListing) {
    db.prepare("UPDATE book_listings SET approval_status = 'REMOVED', rejection_reason = ? WHERE id = ?").run(
      typeof resolutionNote === 'string' ? resolutionNote.trim() : 'Removed following moderation review.',
      report.listing_id
    );
  }

  logAudit({
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: `REPORT_${status}`,
    affectedTable: 'reports',
    affectedId: reportId,
    previousStatus: report.status,
    newStatus: status,
    details: removeListing ? 'Listing removed during moderation.' : ''
  });

  res.json({ success: true });
});

// ANNOUNCEMENTS, NOTIFICATIONS, CONTACT INQUIRIES
router.get('/announcements', (_req, res) => {
  const announcements = db.prepare('SELECT * FROM announcements ORDER BY id DESC').all();
  res.json({ announcements });
});

router.post('/announcements', (req: AuthRequest, res) => {
  const { title, content, audience } = req.body ?? {};
  if (typeof title !== 'string' || typeof content !== 'string' || !title.trim() || !content.trim()) {
    res.status(400).json({ error: 'Title and content are required.' });
    return;
  }
  const aud = ['ALL', 'STUDENTS'].includes(audience) ? audience : 'ALL';
  const result = db
    .prepare('INSERT INTO announcements (title, content, audience, created_by) VALUES (?, ?, ?, ?)')
    .run(title.trim(), content.trim(), aud, req.user!.id);

  logAudit({
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: 'ANNOUNCEMENT_PUBLISHED',
    affectedTable: 'announcements',
    affectedId: Number(result.lastInsertRowid),
    details: title.trim()
  });

  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

router.delete('/announcements/:id', (req: AuthRequest, res) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
});

router.get('/notifications', (req: AuthRequest, res) => {
  const notifications = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user!.id);
  const contactMessages = db.prepare('SELECT * FROM contact_messages ORDER BY id DESC LIMIT 30').all();
  res.json({ notifications, contactMessages });
});

router.post('/notifications/read', (req: AuthRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ success: true });
});

// AUDIT LOGS
router.get('/audit-logs', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';

  const conds: string[] = ['1=1'];
  const params: Array<string> = [];
  if (q) {
    conds.push('(lower(actor_email) LIKE ? OR lower(action) LIKE ? OR lower(details) LIKE ? OR lower(affected_table) LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (action) {
    conds.push('action = ?');
    params.push(action);
  }

  const logs = db
    .prepare(`SELECT * FROM audit_logs WHERE ${conds.join(' AND ')} ORDER BY id DESC LIMIT 200`)
    .all(...params);
  res.json({ logs });
});

// PLATFORM SETTINGS & RECOVERY KEY
router.get('/settings', (_req, res) => {
  const rows = db.prepare('SELECT key, value, updated_at FROM platform_settings ORDER BY key ASC').all() as Array<{
    key: string;
    value: string;
    updated_at: string;
  }>;
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

router.put('/settings', (req: AuthRequest, res) => {
  const { settings } = req.body ?? {};
  if (!settings || typeof settings !== 'object') {
    res.status(400).json({ error: 'Invalid settings payload.' });
    return;
  }
  const allowedKeys = [
    'institution_name',
    'max_active_requests_per_student',
    'require_student_verification_for_exchange',
    'exchange_window_days'
  ];
  const stmt = db.prepare(`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);
  for (const key of allowedKeys) {
    if (key in settings) {
      stmt.run(key, String(settings[key]));
    }
  }
  logAudit({
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: 'PLATFORM_SETTINGS_UPDATED',
    affectedTable: 'platform_settings'
  });
  res.json({ success: true });
});

router.post('/regenerate-recovery-key', (req: AuthRequest, res) => {
  const recoveryKey = `ATH-REC-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  const hash = hashPasswordSync(recoveryKey);
  db.prepare('UPDATE users SET recovery_key_hash = ? WHERE id = ?').run(hash, req.user!.id);
  logAudit({
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: 'OWNER_RECOVERY_KEY_REGENERATED',
    affectedTable: 'users',
    affectedId: req.user!.id
  });
  res.json({ recoveryKey });
});

export default router;
