import { Router } from 'express';
import { db } from '../db.ts';
import { requireAuth, requireStudent, createNotification, logAudit, type AuthRequest } from '../auth.ts';

const router = Router();
router.use(requireAuth, requireStudent);

router.get('/dashboard', (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const profile = db
    .prepare(`
      SELECT sp.*, d.name as department_name, s.label as semester_label
      FROM student_profiles sp
      LEFT JOIN departments d ON sp.department_id = d.id
      LEFT JOIN semesters s ON sp.semester_id = s.id
      WHERE sp.user_id = ?
    `)
    .get(userId) as { department_id: number | null; semester_id: number | null; full_name: string; verification_status: string } | undefined;

  const myListingsCount = (db.prepare('SELECT COUNT(*) as c FROM book_listings WHERE owner_student_id = ?').get(userId) as { c: number }).c;
  const pendingRequestsCount = (
    db
      .prepare("SELECT COUNT(*) as c FROM exchange_requests WHERE requester_student_id = ? AND status = 'PENDING'")
      .get(userId) as { c: number }
  ).c;
  const approvedRequestsCount = (
    db
      .prepare("SELECT COUNT(*) as c FROM exchange_requests WHERE requester_student_id = ? AND status IN ('APPROVED', 'IN_PROGRESS')")
      .get(userId) as { c: number }
  ).c;
  const completedExchangesCount = (
    db
      .prepare(`
        SELECT COUNT(*) as c FROM exchange_requests er
        JOIN book_listings bl ON er.listing_id = bl.id
        WHERE (er.requester_student_id = ? OR bl.owner_student_id = ?) AND er.status = 'COMPLETED'
      `)
      .get(userId, userId) as { c: number }
  ).c;

  const availableBooksCount = (
    db
      .prepare("SELECT COUNT(*) as c FROM book_listings WHERE approval_status = 'APPROVED' AND availability_status = 'AVAILABLE'")
      .get() as { c: number }
  ).c;

  const recentlyAdded = db
    .prepare(`
      SELECT bl.id as listing_id, bl.listing_type, bl.condition, bl.created_at, bl.owner_student_id,
             b.title, b.author, b.cover_image_url, b.edition,
             d.name as department_name, d.code as department_code, sem.label as semester_label, c.name as category_name,
             sp.full_name as owner_name
      FROM book_listings bl
      JOIN books b ON bl.book_id = b.id
      JOIN users u ON bl.owner_student_id = u.id
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN departments d ON b.department_id = d.id
      LEFT JOIN semesters sem ON b.semester_id = sem.id
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE bl.approval_status = 'APPROVED' AND bl.availability_status = 'AVAILABLE' AND u.status = 'ACTIVE'
      ORDER BY bl.created_at DESC, bl.id DESC
      LIMIT 4
    `)
    .all();

  const recommended = db
    .prepare(`
      SELECT bl.id as listing_id, bl.listing_type, bl.condition, bl.created_at, bl.owner_student_id,
             b.title, b.author, b.cover_image_url, b.edition,
             d.name as department_name, d.code as department_code, sem.label as semester_label, c.name as category_name,
             sp.full_name as owner_name
      FROM book_listings bl
      JOIN books b ON bl.book_id = b.id
      JOIN users u ON bl.owner_student_id = u.id
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN departments d ON b.department_id = d.id
      LEFT JOIN semesters sem ON b.semester_id = sem.id
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE bl.approval_status = 'APPROVED' AND bl.availability_status = 'AVAILABLE'
        AND bl.owner_student_id != ? AND u.status = 'ACTIVE'
      ORDER BY (CASE WHEN b.department_id = ? THEN 0 ELSE 1 END), (CASE WHEN b.semester_id = ? THEN 0 ELSE 1 END), bl.id DESC
      LIMIT 4
    `)
    .all(userId, profile?.department_id ?? -1, profile?.semester_id ?? -1);

  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 6')
    .all(userId);

  const announcements = db
    .prepare("SELECT id, title, content, created_at FROM announcements WHERE is_active = 1 AND audience IN ('ALL', 'STUDENTS') ORDER BY id DESC LIMIT 3")
    .all();

  res.json({
    metrics: {
      myListingsCount,
      pendingRequestsCount,
      approvedRequestsCount,
      completedExchangesCount,
      availableBooksCount
    },
    recentlyAdded,
    recommended,
    notifications,
    announcements
  });
});

router.put('/profile', (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { fullName, departmentId, semesterId, phone, bio, avatarUrl } = req.body ?? {};
  if (typeof fullName !== 'string' || fullName.trim().length < 2) {
    res.status(400).json({ error: 'Full name is required.' });
    return;
  }

  const safeAvatar =
    typeof avatarUrl === 'string' && (avatarUrl === '' || avatarUrl.startsWith('/api/uploads/') || avatarUrl.startsWith('/src/assets/'))
      ? avatarUrl
      : '';

  db.prepare(`
    UPDATE student_profiles
    SET full_name = ?, department_id = ?, semester_id = ?, phone = ?, bio = ?, avatar_url = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(
    fullName.trim(),
    departmentId ? Number(departmentId) : null,
    semesterId ? Number(semesterId) : null,
    typeof phone === 'string' ? phone.trim() : '',
    typeof bio === 'string' ? bio.trim() : '',
    safeAvatar,
    userId
  );

  logAudit({
    actorUserId: userId,
    actorEmail: req.user!.email,
    action: 'STUDENT_PROFILE_UPDATED',
    affectedTable: 'student_profiles',
    affectedId: userId
  });

  res.json({ success: true });
});

router.get('/listings', (req: AuthRequest, res) => {
  const rows = db
    .prepare(`
      SELECT bl.*, b.title, b.author, b.isbn, b.edition, b.publisher, b.publication_year, b.description, b.cover_image_url,
             b.category_id, b.department_id, b.semester_id, b.subject_id,
             c.name as category_name, d.name as department_name, d.code as department_code,
             sem.label as semester_label, subj.name as subject_name, subj.code as subject_code
      FROM book_listings bl
      JOIN books b ON bl.book_id = b.id
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN departments d ON b.department_id = d.id
      LEFT JOIN semesters sem ON b.semester_id = sem.id
      LEFT JOIN subjects subj ON b.subject_id = subj.id
      WHERE bl.owner_student_id = ?
      ORDER BY bl.id DESC
    `)
    .all(req.user!.id);
  res.json({ listings: rows });
});

router.post('/listings', (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const {
    title,
    author,
    isbn,
    edition,
    publisher,
    publicationYear,
    description,
    categoryId,
    departmentId,
    semesterId,
    subjectId,
    coverImageUrl,
    listingType,
    condition,
    notes
  } = req.body ?? {};

  if (typeof title !== 'string' || title.trim().length < 2 || typeof author !== 'string' || author.trim().length < 2) {
    res.status(400).json({ error: 'Book title and author are required.' });
    return;
  }
  if (!['EXCHANGE', 'LEND', 'DONATION'].includes(listingType)) {
    res.status(400).json({ error: 'Invalid listing type.' });
    return;
  }
  if (!['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'].includes(condition)) {
    res.status(400).json({ error: 'Invalid book condition.' });
    return;
  }

  const safeCover =
    typeof coverImageUrl === 'string' &&
    (coverImageUrl.startsWith('/api/uploads/') || coverImageUrl.startsWith('/src/assets/images/'))
      ? coverImageUrl
      : '/src/assets/images/book_cover_algorithms_1795534389311.jpg';

  try {
    db.exec('BEGIN IMMEDIATE');
    const bookRes = db
      .prepare(`
        INSERT INTO books (title, author, isbn, edition, publisher, publication_year, description, category_id, department_id, semester_id, subject_id, cover_image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        title.trim(),
        author.trim(),
        typeof isbn === 'string' ? isbn.trim() : '',
        typeof edition === 'string' ? edition.trim() : '',
        typeof publisher === 'string' ? publisher.trim() : '',
        publicationYear ? Number(publicationYear) : null,
        typeof description === 'string' ? description.trim() : '',
        categoryId ? Number(categoryId) : null,
        departmentId ? Number(departmentId) : null,
        semesterId ? Number(semesterId) : null,
        subjectId ? Number(subjectId) : null,
        safeCover
      );

    // Every new student submission MUST start as PENDING until approved by the Owner.
    const listingRes = db
      .prepare(`
        INSERT INTO book_listings (book_id, owner_student_id, listing_type, condition, availability_status, approval_status, notes)
        VALUES (?, ?, ?, ?, 'AVAILABLE', 'PENDING', ?)
      `)
      .run(Number(bookRes.lastInsertRowid), userId, listingType, condition, typeof notes === 'string' ? notes.trim() : '');

    const listingId = Number(listingRes.lastInsertRowid);

    const owner = db.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").get() as { id: number } | undefined;
    if (owner) {
      createNotification({
        userId: owner.id,
        title: listingType === 'DONATION' ? 'New Donation Submission Pending' : 'New Book Listing Pending Approval',
        message: `"${title.trim()}" was submitted by ${req.user!.email} for verification.`,
        type: 'INFO',
        relatedEntityType: 'BOOK_LISTING',
        relatedEntityId: listingId
      });
    }

    createNotification({
      userId,
      title: 'Submission Received',
      message: `"${title.trim()}" has been submitted and is pending Super Administrator approval.`,
      type: 'INFO',
      relatedEntityType: 'BOOK_LISTING',
      relatedEntityId: listingId
    });

    logAudit({
      actorUserId: userId,
      actorEmail: req.user!.email,
      action: 'BOOK_SUBMITTED',
      affectedTable: 'book_listings',
      affectedId: listingId,
      newStatus: 'PENDING',
      details: `Submitted ${listingType} listing: ${title.trim()}`
    });
    db.exec('COMMIT');

    res.status(201).json({ listingId, approvalStatus: 'PENDING' });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to submit book listing.' });
  }
});

router.delete('/listings/:id', (req: AuthRequest, res) => {
  const listingId = Number(req.params.id);
  const listing = db
    .prepare('SELECT id, owner_student_id, availability_status, approval_status FROM book_listings WHERE id = ?')
    .get(listingId) as { id: number; owner_student_id: number; availability_status: string; approval_status: string } | undefined;

  if (!listing || listing.owner_student_id !== req.user!.id) {
    res.status(404).json({ error: 'Listing not found or unauthorized.' });
    return;
  }
  if (listing.availability_status === 'EXCHANGED' || listing.availability_status === 'DONATED') {
    res.status(400).json({ error: 'Completed exchange or donation listings cannot be deleted.' });
    return;
  }

  db.prepare('DELETE FROM book_listings WHERE id = ? AND owner_student_id = ?').run(listingId, req.user!.id);
  logAudit({
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: 'BOOK_LISTING_WITHDRAWN',
    affectedTable: 'book_listings',
    affectedId: listingId,
    previousStatus: listing.approval_status,
    newStatus: 'DELETED'
  });

  res.json({ success: true });
});

router.get('/exchanges', (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const outgoing = db
    .prepare(`
      SELECT er.*, b.title as book_title, b.author as book_author, b.cover_image_url,
             bl.listing_type, bl.condition,
             sp.full_name as owner_name,
             ob.title as offered_book_title
      FROM exchange_requests er
      JOIN book_listings bl ON er.listing_id = bl.id
      JOIN books b ON bl.book_id = b.id
      LEFT JOIN student_profiles sp ON bl.owner_student_id = sp.user_id
      LEFT JOIN book_listings obl ON er.offered_listing_id = obl.id
      LEFT JOIN books ob ON obl.book_id = ob.id
      WHERE er.requester_student_id = ?
      ORDER BY er.id DESC
    `)
    .all(userId);

  const incoming = db
    .prepare(`
      SELECT er.*, b.title as book_title, b.author as book_author, b.cover_image_url,
             sp.full_name as requester_name,
             ob.title as offered_book_title
      FROM exchange_requests er
      JOIN book_listings bl ON er.listing_id = bl.id
      JOIN books b ON bl.book_id = b.id
      LEFT JOIN student_profiles sp ON er.requester_student_id = sp.user_id
      LEFT JOIN book_listings obl ON er.offered_listing_id = obl.id
      LEFT JOIN books ob ON obl.book_id = ob.id
      WHERE bl.owner_student_id = ?
      ORDER BY er.id DESC
    `)
    .all(userId);

  res.json({ outgoing, incoming });
});

router.post('/exchanges', (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { listingId, offeredListingId, message } = req.body ?? {};
  const targetId = Number(listingId);

  const listing = db
    .prepare(`
      SELECT bl.id, bl.owner_student_id, bl.listing_type, bl.approval_status, bl.availability_status, b.title
      FROM book_listings bl
      JOIN books b ON bl.book_id = b.id
      WHERE bl.id = ?
    `)
    .get(targetId) as {
    id: number;
    owner_student_id: number;
    listing_type: string;
    approval_status: string;
    availability_status: string;
    title: string;
  } | undefined;

  if (!listing || listing.approval_status !== 'APPROVED' || listing.availability_status !== 'AVAILABLE') {
    res.status(404).json({ error: 'Book listing is not currently available.' });
    return;
  }
  if (listing.listing_type === 'DONATION') {
    res.status(400).json({ error: 'Donations must be requested via the Donation Request workflow.' });
    return;
  }
  if (listing.owner_student_id === userId) {
    res.status(400).json({ error: 'You cannot request your own book listing.' });
    return;
  }

  const duplicate = db
    .prepare("SELECT id FROM exchange_requests WHERE listing_id = ? AND requester_student_id = ? AND status IN ('PENDING', 'APPROVED', 'IN_PROGRESS')")
    .get(targetId, userId);
  if (duplicate) {
    res.status(409).json({ error: 'You already have an active request for this book.' });
    return;
  }

  let validOfferedId: number | null = null;
  if (offeredListingId) {
    const offered = db
      .prepare("SELECT id, owner_student_id, approval_status, availability_status FROM book_listings WHERE id = ?")
      .get(Number(offeredListingId)) as { id: number; owner_student_id: number; approval_status: string; availability_status: string } | undefined;
    if (!offered || offered.owner_student_id !== userId || offered.approval_status !== 'APPROVED' || offered.availability_status !== 'AVAILABLE') {
      res.status(400).json({ error: 'Selected offered book must be one of your approved available listings.' });
      return;
    }
    validOfferedId = offered.id;
  }

  const result = db
    .prepare(`
      INSERT INTO exchange_requests (listing_id, requester_student_id, offered_listing_id, message, status)
      VALUES (?, ?, ?, ?, 'PENDING')
    `)
    .run(targetId, userId, validOfferedId, typeof message === 'string' ? message.trim() : '');

  const reqId = Number(result.lastInsertRowid);

  const owner = db.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").get() as { id: number } | undefined;
  if (owner) {
    createNotification({
      userId: owner.id,
      title: 'New Exchange Request Submitted',
      message: `${req.user!.email} requested "${listing.title}" for academic exchange.`,
      type: 'INFO',
      relatedEntityType: 'EXCHANGE_REQUEST',
      relatedEntityId: reqId
    });
  }

  createNotification({
    userId: listing.owner_student_id,
    title: 'Exchange Interest Received',
    message: `A fellow student requested your listed book "${listing.title}". Pending Super Admin review.`,
    type: 'INFO',
    relatedEntityType: 'EXCHANGE_REQUEST',
    relatedEntityId: reqId
  });

  logAudit({
    actorUserId: userId,
    actorEmail: req.user!.email,
    action: 'EXCHANGE_REQUEST_CREATED',
    affectedTable: 'exchange_requests',
    affectedId: reqId,
    newStatus: 'PENDING',
    details: `Requested listing #${targetId} (${listing.title})`
  });

  res.status(201).json({ id: reqId, status: 'PENDING' });
});

router.post('/exchanges/:id/cancel', (req: AuthRequest, res) => {
  const reqId = Number(req.params.id);
  const row = db
    .prepare('SELECT id, requester_student_id, status FROM exchange_requests WHERE id = ?')
    .get(reqId) as { id: number; requester_student_id: number; status: string } | undefined;

  if (!row || row.requester_student_id !== req.user!.id) {
    res.status(404).json({ error: 'Exchange request not found.' });
    return;
  }
  if (row.status !== 'PENDING') {
    res.status(400).json({ error: 'Only pending requests can be cancelled.' });
    return;
  }

  db.prepare("UPDATE exchange_requests SET status = 'CANCELLED', updated_at = datetime('now') WHERE id = ?").run(reqId);
  logAudit({
    actorUserId: req.user!.id,
    actorEmail: req.user!.email,
    action: 'EXCHANGE_REQUEST_CANCELLED',
    affectedTable: 'exchange_requests',
    affectedId: reqId,
    previousStatus: 'PENDING',
    newStatus: 'CANCELLED'
  });

  res.json({ success: true });
});

router.get('/donations', (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const myDonations = db
    .prepare(`
      SELECT bl.*, b.title, b.author, b.cover_image_url, d.name as department_name, sem.label as semester_label
      FROM book_listings bl
      JOIN books b ON bl.book_id = b.id
      LEFT JOIN departments d ON b.department_id = d.id
      LEFT JOIN semesters sem ON b.semester_id = sem.id
      WHERE bl.owner_student_id = ? AND bl.listing_type = 'DONATION'
      ORDER BY bl.id DESC
    `)
    .all(userId);

  const myDonationRequests = db
    .prepare(`
      SELECT dr.*, b.title as book_title, b.author as book_author, b.cover_image_url,
             sp.full_name as donor_name
      FROM donation_requests dr
      JOIN book_listings bl ON dr.listing_id = bl.id
      JOIN books b ON bl.book_id = b.id
      LEFT JOIN student_profiles sp ON dr.donor_student_id = sp.user_id
      WHERE dr.recipient_student_id = ?
      ORDER BY dr.id DESC
    `)
    .all(userId);

  res.json({ myDonations, myDonationRequests });
});

router.post('/donations/request', (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { listingId, purpose } = req.body ?? {};
  const targetId = Number(listingId);

  const listing = db
    .prepare(`
      SELECT bl.id, bl.owner_student_id, bl.listing_type, bl.approval_status, bl.availability_status, b.title
      FROM book_listings bl
      JOIN books b ON bl.book_id = b.id
      WHERE bl.id = ?
    `)
    .get(targetId) as {
    id: number;
    owner_student_id: number;
    listing_type: string;
    approval_status: string;
    availability_status: string;
    title: string;
  } | undefined;

  if (!listing || listing.listing_type !== 'DONATION' || listing.approval_status !== 'APPROVED' || listing.availability_status !== 'AVAILABLE') {
    res.status(404).json({ error: 'Donated book is not currently available.' });
    return;
  }
  if (listing.owner_student_id === userId) {
    res.status(400).json({ error: 'You cannot request your own donated book.' });
    return;
  }

  const duplicate = db
    .prepare("SELECT id FROM donation_requests WHERE listing_id = ? AND recipient_student_id = ? AND status IN ('PENDING', 'APPROVED')")
    .get(targetId, userId);
  if (duplicate) {
    res.status(409).json({ error: 'You already have an active donation request for this book.' });
    return;
  }

  const result = db
    .prepare(`
      INSERT INTO donation_requests (listing_id, donor_student_id, recipient_student_id, status, purpose)
      VALUES (?, ?, ?, 'PENDING', ?)
    `)
    .run(targetId, listing.owner_student_id, userId, typeof purpose === 'string' ? purpose.trim() : '');

  const reqId = Number(result.lastInsertRowid);

  const owner = db.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").get() as { id: number } | undefined;
  if (owner) {
    createNotification({
      userId: owner.id,
      title: 'New Donation Request Pending',
      message: `${req.user!.email} requested donated book "${listing.title}".`,
      type: 'INFO',
      relatedEntityType: 'DONATION_REQUEST',
      relatedEntityId: reqId
    });
  }

  logAudit({
    actorUserId: userId,
    actorEmail: req.user!.email,
    action: 'DONATION_REQUEST_CREATED',
    affectedTable: 'donation_requests',
    affectedId: reqId,
    newStatus: 'PENDING',
    details: `Requested donated copy #${targetId} (${listing.title})`
  });

  res.status(201).json({ id: reqId, status: 'PENDING' });
});

router.post('/donations/request/:id/cancel', (req: AuthRequest, res) => {
  const reqId = Number(req.params.id);
  const row = db
    .prepare('SELECT id, recipient_student_id, status FROM donation_requests WHERE id = ?')
    .get(reqId) as { id: number; recipient_student_id: number; status: string } | undefined;

  if (!row || row.recipient_student_id !== req.user!.id) {
    res.status(404).json({ error: 'Donation request not found.' });
    return;
  }
  if (row.status !== 'PENDING') {
    res.status(400).json({ error: 'Only pending donation requests can be cancelled.' });
    return;
  }

  db.prepare("UPDATE donation_requests SET status = 'CANCELLED', updated_at = datetime('now') WHERE id = ?").run(reqId);
  res.json({ success: true });
});

router.post('/reports', (req: AuthRequest, res) => {
  const { listingId, reason, details } = req.body ?? {};
  const targetId = Number(listingId);
  if (!Number.isInteger(targetId) || typeof reason !== 'string' || reason.trim().length < 3) {
    res.status(400).json({ error: 'Listing ID and reason are required.' });
    return;
  }

  const listing = db.prepare('SELECT id FROM book_listings WHERE id = ?').get(targetId);
  if (!listing) {
    res.status(404).json({ error: 'Listing not found.' });
    return;
  }

  const result = db
    .prepare('INSERT INTO reports (listing_id, reporter_user_id, reason, details) VALUES (?, ?, ?, ?)')
    .run(targetId, req.user!.id, reason.trim(), typeof details === 'string' ? details.trim() : '');

  const owner = db.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1").get() as { id: number } | undefined;
  if (owner) {
    createNotification({
      userId: owner.id,
      title: 'Listing Reported for Moderation',
      message: `Listing #${targetId} was flagged: ${reason.trim()}.`,
      type: 'WARNING',
      relatedEntityType: 'REPORT',
      relatedEntityId: Number(result.lastInsertRowid)
    });
  }

  res.status(201).json({ success: true });
});

router.get('/notifications', (req: AuthRequest, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user!.id);
  res.json({ notifications: rows });
});

router.post('/notifications/read', (req: AuthRequest, res) => {
  const { notificationId } = req.body ?? {};
  if (notificationId) {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(Number(notificationId), req.user!.id);
  } else {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  }
  res.json({ success: true });
});

router.get('/activity', (req: AuthRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM audit_logs WHERE actor_user_id = ? ORDER BY id DESC LIMIT 50')
    .all(req.user!.id);
  res.json({ activities: rows });
});

export default router;
