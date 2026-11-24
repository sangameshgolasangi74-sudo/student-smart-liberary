import { Router } from 'express';
import { db } from '../db.ts';

const router = Router();

router.get('/metadata', (_req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
  const departments = db.prepare('SELECT * FROM departments ORDER BY name ASC').all();
  const semesters = db.prepare('SELECT * FROM semesters ORDER BY number ASC').all();
  const subjects = db
    .prepare(`
      SELECT subj.*, d.name as department_name, d.code as department_code, sem.label as semester_label
      FROM subjects subj
      JOIN departments d ON subj.department_id = d.id
      JOIN semesters sem ON subj.semester_id = sem.id
      ORDER BY subj.code ASC
    `)
    .all();

  const announcements = db
    .prepare('SELECT id, title, content, audience, created_at FROM announcements WHERE is_active = 1 ORDER BY id DESC LIMIT 5')
    .all();

  const approvedBooks = (db.prepare("SELECT COUNT(*) as c FROM book_listings WHERE approval_status = 'APPROVED'").get() as { c: number }).c;
  const completedExchanges = (db.prepare("SELECT COUNT(*) as c FROM exchange_requests WHERE status = 'COMPLETED'").get() as { c: number }).c;
  const approvedDonations = (db.prepare("SELECT COUNT(*) as c FROM book_listings WHERE listing_type = 'DONATION' AND approval_status = 'APPROVED'").get() as { c: number }).c;
  const activeStudents = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'STUDENT' AND status = 'ACTIVE'").get() as { c: number }).c;

  res.json({
    categories,
    departments,
    semesters,
    subjects,
    announcements,
    stats: {
      approvedBooks,
      completedExchanges,
      approvedDonations,
      activeStudents
    }
  });
});

router.get('/books', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const departmentId = req.query.departmentId ? Number(req.query.departmentId) : null;
  const semesterId = req.query.semesterId ? Number(req.query.semesterId) : null;
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
  const listingType = typeof req.query.listingType === 'string' ? req.query.listingType.toUpperCase() : '';
  const condition = typeof req.query.condition === 'string' ? req.query.condition.toUpperCase() : '';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'newest';

  const conditions: string[] = [
    "bl.approval_status = 'APPROVED'",
    "bl.availability_status = 'AVAILABLE'",
    "u.status = 'ACTIVE'"
  ];
  const params: Array<string | number> = [];

  if (search) {
    conditions.push(`(
      lower(b.title) LIKE ? OR
      lower(b.author) LIKE ? OR
      lower(b.isbn) LIKE ? OR
      lower(COALESCE(subj.name, '')) LIKE ? OR
      lower(COALESCE(d.name, '')) LIKE ?
    )`);
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }
  if (departmentId) {
    conditions.push('b.department_id = ?');
    params.push(departmentId);
  }
  if (semesterId) {
    conditions.push('b.semester_id = ?');
    params.push(semesterId);
  }
  if (categoryId) {
    conditions.push('b.category_id = ?');
    params.push(categoryId);
  }
  if (['EXCHANGE', 'LEND', 'DONATION'].includes(listingType)) {
    conditions.push('bl.listing_type = ?');
    params.push(listingType);
  }
  if (['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'].includes(condition)) {
    conditions.push('bl.condition = ?');
    params.push(condition);
  }

  let orderBy = 'bl.created_at DESC, bl.id DESC';
  if (sort === 'title_asc') orderBy = 'b.title ASC';
  if (sort === 'semester_asc') orderBy = 'COALESCE(sem.number, 99) ASC, b.title ASC';

  const sql = `
    SELECT
      bl.id as listing_id,
      bl.listing_type,
      bl.condition,
      bl.availability_status,
      bl.approval_status,
      bl.notes,
      bl.created_at,
      bl.owner_student_id,
      b.id as book_id,
      b.title,
      b.author,
      b.isbn,
      b.edition,
      b.publisher,
      b.publication_year,
      b.description,
      b.cover_image_url,
      c.id as category_id,
      c.name as category_name,
      d.id as department_id,
      d.code as department_code,
      d.name as department_name,
      sem.id as semester_id,
      sem.number as semester_number,
      sem.label as semester_label,
      subj.id as subject_id,
      subj.code as subject_code,
      subj.name as subject_name,
      sp.full_name as owner_name,
      sp.verification_status as owner_verification_status
    FROM book_listings bl
    JOIN books b ON bl.book_id = b.id
    JOIN users u ON bl.owner_student_id = u.id
    LEFT JOIN student_profiles sp ON u.id = sp.user_id
    LEFT JOIN categories c ON b.category_id = c.id
    LEFT JOIN departments d ON b.department_id = d.id
    LEFT JOIN semesters sem ON b.semester_id = sem.id
    LEFT JOIN subjects subj ON b.subject_id = subj.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${orderBy}
  `;

  const rows = db.prepare(sql).all(...params);
  res.json({ books: rows });
});

router.get('/books/:listingId', (req, res) => {
  const listingId = Number(req.params.listingId);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    res.status(400).json({ error: 'Invalid listing ID' });
    return;
  }

  const row = db
    .prepare(`
      SELECT
        bl.id as listing_id,
        bl.listing_type,
        bl.condition,
        bl.availability_status,
        bl.approval_status,
        bl.notes,
        bl.created_at,
        bl.owner_student_id,
        b.id as book_id,
        b.title,
        b.author,
        b.isbn,
        b.edition,
        b.publisher,
        b.publication_year,
        b.description,
        b.cover_image_url,
        c.id as category_id,
        c.name as category_name,
        d.id as department_id,
        d.code as department_code,
        d.name as department_name,
        sem.id as semester_id,
        sem.number as semester_number,
        sem.label as semester_label,
        subj.id as subject_id,
        subj.code as subject_code,
        subj.name as subject_name,
        sp.full_name as owner_name,
        sp.verification_status as owner_verification_status,
        od.name as owner_department_name
      FROM book_listings bl
      JOIN books b ON bl.book_id = b.id
      JOIN users u ON bl.owner_student_id = u.id
      LEFT JOIN student_profiles sp ON u.id = sp.user_id
      LEFT JOIN departments od ON sp.department_id = od.id
      LEFT JOIN categories c ON b.category_id = c.id
      LEFT JOIN departments d ON b.department_id = d.id
      LEFT JOIN semesters sem ON b.semester_id = sem.id
      LEFT JOIN subjects subj ON b.subject_id = subj.id
      WHERE bl.id = ? AND bl.approval_status = 'APPROVED' AND u.status = 'ACTIVE'
    `)
    .get(listingId);

  if (!row) {
    res.status(404).json({ error: 'Approved book listing not found.' });
    return;
  }

  res.json({ book: row });
});

router.post('/contact', (req, res) => {
  const { name, email, subject, message } = req.body ?? {};
  if (
    typeof name !== 'string' ||
    name.trim().length < 2 ||
    typeof email !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof subject !== 'string' ||
    subject.trim().length < 2 ||
    typeof message !== 'string' ||
    message.trim().length < 10
  ) {
    res.status(400).json({ error: 'Please complete all fields with a valid email and detailed message.' });
    return;
  }

  db.prepare(`
    INSERT INTO contact_messages (name, email, subject, message)
    VALUES (?, ?, ?, ?)
  `).run(name.trim(), email.trim(), subject.trim(), message.trim());

  res.status(201).json({ success: true, message: 'Your inquiry has been logged with the Athenaeum administration.' });
});

export default router;
