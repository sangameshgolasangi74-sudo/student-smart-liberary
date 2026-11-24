import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const OWNER_EMAIL = 'patilakash74850@gmail.com';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'athenaeum.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function hashPasswordSync(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasswordSync(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      recovery_key_hash TEXT,
      role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('SUPER_ADMIN', 'STUDENT')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
      is_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS semesters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER NOT NULL UNIQUE,
      label TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL,
      semester_id INTEGER NOT NULL,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
      FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS student_profiles (
      user_id INTEGER PRIMARY KEY,
      full_name TEXT NOT NULL,
      student_id_number TEXT NOT NULL UNIQUE,
      department_id INTEGER,
      semester_id INTEGER,
      phone TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
      verification_note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
      FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      isbn TEXT NOT NULL DEFAULT '',
      edition TEXT NOT NULL DEFAULT '',
      publisher TEXT NOT NULL DEFAULT '',
      publication_year INTEGER,
      description TEXT NOT NULL DEFAULT '',
      category_id INTEGER,
      department_id INTEGER,
      semester_id INTEGER,
      subject_id INTEGER,
      cover_image_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
      FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE SET NULL,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS book_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      owner_student_id INTEGER NOT NULL,
      listing_type TEXT NOT NULL CHECK (listing_type IN ('EXCHANGE', 'LEND', 'DONATION')),
      condition TEXT NOT NULL CHECK (condition IN ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR')),
      availability_status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (availability_status IN ('AVAILABLE', 'RESERVED', 'EXCHANGED', 'DONATED', 'UNAVAILABLE')),
      approval_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'REMOVED')),
      rejection_reason TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (owner_student_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exchange_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      requester_student_id INTEGER NOT NULL,
      offered_listing_id INTEGER,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
      rejection_reason TEXT NOT NULL DEFAULT '',
      reviewed_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (listing_id) REFERENCES book_listings(id) ON DELETE CASCADE,
      FOREIGN KEY (requester_student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (offered_listing_id) REFERENCES book_listings(id) ON DELETE SET NULL,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS donation_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      donor_student_id INTEGER NOT NULL,
      recipient_student_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED')),
      purpose TEXT NOT NULL DEFAULT '',
      rejection_reason TEXT NOT NULL DEFAULT '',
      reviewed_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (listing_id) REFERENCES book_listings(id) ON DELETE CASCADE,
      FOREIGN KEY (donor_student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS approval_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      decided_by INTEGER NOT NULL,
      decided_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'INFO',
      related_entity_type TEXT NOT NULL DEFAULT '',
      related_entity_id INTEGER,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id INTEGER NOT NULL,
      reporter_user_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'DISMISSED')),
      resolution_note TEXT NOT NULL DEFAULT '',
      resolved_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      FOREIGN KEY (listing_id) REFERENCES book_listings(id) ON DELETE CASCADE,
      FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      affected_table TEXT NOT NULL,
      affected_id INTEGER,
      previous_status TEXT NOT NULL DEFAULT '',
      new_status TEXT NOT NULL DEFAULT '',
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'ALL',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'REVIEWED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  seedInitialData();
}

function seedInitialData() {
  // 1. Seed Roles & Permissions
  const roleCount = db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number };
  if (roleCount.c === 0) {
    const insertRole = db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)');
    const superAdminRoleId = insertRole.run('SUPER_ADMIN', 'Unrestricted platform owner and academic governance authority').lastInsertRowid as number;
    const studentRoleId = insertRole.run('STUDENT', 'Verified academic community member with book discovery, listing, and exchange privileges').lastInsertRowid as number;

    const perms = [
      ['students:manage', 'Approve, suspend, activate, or remove student accounts'],
      ['books:approve', 'Approve, reject, edit, or remove book submissions'],
      ['exchanges:govern', 'Approve, reject, monitor, and complete exchange requests'],
      ['donations:govern', 'Review, approve, reject, and track academic donations'],
      ['taxonomy:manage', 'Manage categories, departments, semesters, and subjects'],
      ['audit:read', 'Inspect immutable administrative audit logs'],
      ['books:submit', 'Submit book listings for administrative review'],
      ['exchanges:request', 'Request approved books for academic exchange'],
      ['donations:request', 'Request approved donated books']
    ];
    const insertPerm = db.prepare('INSERT INTO permissions (code, description) VALUES (?, ?)');
    const insertRolePerm = db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)');

    for (const [code, desc] of perms) {
      const pid = insertPerm.run(code, desc).lastInsertRowid as number;
      insertRolePerm.run(superAdminRoleId, pid);
      if (['books:submit', 'exchanges:request', 'donations:request'].includes(code)) {
        insertRolePerm.run(studentRoleId, pid);
      }
    }
  }

  // 2. Ensure Super Admin identity exists (NO hardcoded password!)
  const ownerExists = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(OWNER_EMAIL) as { id: number } | undefined;
  if (!ownerExists) {
    db.prepare(`
      INSERT INTO users (email, password_hash, role, status, is_verified)
      VALUES (?, NULL, 'SUPER_ADMIN', 'ACTIVE', 1)
    `).run(OWNER_EMAIL);
  }

  // 3. Seed Semesters, Departments, Categories, Subjects
  const deptCount = db.prepare('SELECT COUNT(*) as c FROM departments').get() as { c: number };
  if (deptCount.c === 0) {
    const insertSem = db.prepare('INSERT INTO semesters (number, label) VALUES (?, ?)');
    for (let i = 1; i <= 8; i++) {
      insertSem.run(i, `Semester ${i}`);
    }

    const insertDept = db.prepare('INSERT INTO departments (code, name) VALUES (?, ?)');
    const cseId = insertDept.run('CSE', 'Computer Science & Engineering').lastInsertRowid as number;
    const eceId = insertDept.run('ECE', 'Electrical & Electronics Engineering').lastInsertRowid as number;
    const mechId = insertDept.run('MECH', 'Mechanical & Aerospace Engineering').lastInsertRowid as number;
    const econId = insertDept.run('ECON', 'Economics & Quantitative Finance').lastInsertRowid as number;
    const archId = insertDept.run('ARCH', 'Architecture & Structural Design').lastInsertRowid as number;

    const insertCat = db.prepare('INSERT INTO categories (name, slug, description) VALUES (?, ?, ?)');
    const catText = insertCat.run('Core Textbooks', 'core-textbooks', 'Required semester-level foundational textbooks').lastInsertRowid as number;
    const catMono = insertCat.run('Reference Monographs', 'reference-monographs', 'Advanced specialized academic treatises').lastInsertRowid as number;
    const catLab = insertCat.run('Lab & Problem Manuals', 'lab-manuals', 'Practical laboratory workbooks and solution guides').lastInsertRowid as number;
    const catExam = insertCat.run('Competitive & Thesis Prep', 'exam-prep', 'Graduate entrance and research methodology volumes').lastInsertRowid as number;

    const insertSubj = db.prepare('INSERT INTO subjects (department_id, semester_id, code, name) VALUES (?, ?, ?, ?)');
    const sAlgo = insertSubj.run(cseId, 3, 'CS301', 'Algorithms & Data Structures').lastInsertRowid as number;
    const sSys = insertSubj.run(cseId, 5, 'CS502', 'Distributed Systems & Architecture').lastInsertRowid as number;
    const sQuantum = insertSubj.run(eceId, 4, 'EE401', 'Quantum Mechanics & Solid State').lastInsertRowid as number;
    const sThermo = insertSubj.run(mechId, 3, 'ME304', 'Engineering Thermodynamics').lastInsertRowid as number;
    const sMacro = insertSubj.run(econId, 2, 'EC201', 'Principles of Quantitative Economics').lastInsertRowid as number;
    const sArch = insertSubj.run(archId, 4, 'AR402', 'Structural Symmetry & Tectonics').lastInsertRowid as number;

    // 4. Seed Platform Settings & Announcement
    const insertSetting = db.prepare('INSERT OR IGNORE INTO platform_settings (key, value) VALUES (?, ?)');
    insertSetting.run('institution_name', 'Athenaeum Academic Consortium');
    insertSetting.run('max_active_requests_per_student', '5');
    insertSetting.run('require_student_verification_for_exchange', 'false');
    insertSetting.run('exchange_window_days', '14');

    const ownerUser = db.prepare('SELECT id FROM users WHERE email = ?').get(OWNER_EMAIL) as { id: number };
    db.prepare(`
      INSERT INTO announcements (title, content, audience, is_active, created_by)
      VALUES (?, ?, 'ALL', 1, ?)
    `).run(
      'Spring Semester Book Circulation Window Open',
      'Students may now list completed-semester textbooks for verified peer exchange or academic donation. All submissions undergo administrative verification within 24 hours.',
      ownerUser.id
    );

    // 5. Seed Sample Student Community Accounts (standard non-privileged student role)
    const demoHash = hashPasswordSync('ScholarDemo2026!');
    const insertUser = db.prepare('INSERT INTO users (email, password_hash, role, status, is_verified) VALUES (?, ?, \'STUDENT\', ?, ?)');
    const insertProfile = db.prepare(`
      INSERT INTO student_profiles (user_id, full_name, student_id_number, department_id, semester_id, phone, bio, verification_status, verification_note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const st1 = insertUser.run('ananya.sharma@university.edu', demoHash, 'ACTIVE', 1).lastInsertRowid as number;
    insertProfile.run(st1, 'Ananya Sharma', 'ATH-2024-0118', cseId, 5, '+91 98201 44120', 'Senior Computer Science undergraduate focusing on algorithms and distributed computing.', 'VERIFIED', 'University ID verified against registrar roster.');

    const st2 = insertUser.run('rohan.verma@university.edu', demoHash, 'ACTIVE', 1).lastInsertRowid as number;
    insertProfile.run(st2, 'Rohan Verma', 'ATH-2024-0245', eceId, 4, '+91 98204 77310', 'Electrical engineering scholar researching solid-state photonics and quantum systems.', 'VERIFIED', 'Verified departmental enrollment.');

    const st3 = insertUser.run('meera.iyer@university.edu', demoHash, 'ACTIVE', 0).lastInsertRowid as number;
    insertProfile.run(st3, 'Meera Iyer', 'ATH-2025-0389', econId, 2, '+91 98211 19044', 'Second-year quantitative economics student collecting econometrics and monetary policy editions.', 'PENDING', '');

    const st4 = insertUser.run('kabir.mehta@university.edu', demoHash, 'ACTIVE', 1).lastInsertRowid as number;
    insertProfile.run(st4, 'Kabir Mehta', 'ATH-2023-0074', archId, 6, '+91 98199 55280', 'Architecture thesis candidate sharing structural design monographs.', 'VERIFIED', 'Verified student card.');

    // 6. Seed Curated Academic Books & Listings using generated editorial assets
    const insertBook = db.prepare(`
      INSERT INTO books (title, author, isbn, edition, publisher, publication_year, description, category_id, department_id, semester_id, subject_id, cover_image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertListing = db.prepare(`
      INSERT INTO book_listings (book_id, owner_student_id, listing_type, condition, availability_status, approval_status, rejection_reason, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const b1 = insertBook.run(
      'Algorithms & Computation: An Introductory Guide',
      'Dr. A. Harper & Dr. J. Chen',
      '978-0-262-04630-5',
      '4th Edition',
      'MIT Academic Press',
      2024,
      'Comprehensive treatment of asymptotic analysis, graph traversal, dynamic programming, and amortized data structures with rigorous proofs.',
      catText, cseId, 3, sAlgo,
      '/src/assets/images/book_cover_algorithms_1795534389311.jpg'
    ).lastInsertRowid as number;
    const l1 = insertListing.run(b1, st1, 'EXCHANGE', 'LIKE_NEW', 'AVAILABLE', 'APPROVED', '', 'Clean hardcover copy, zero markings. Seeking Semester 5 Distributed Systems text.').lastInsertRowid as number;

    const b2 = insertBook.run(
      'Quantum Mechanics & Advanced Engineering',
      'Prof. R. Davies & Dr. L. Chen',
      '978-0-674-98712-4',
      '3rd Edition',
      'Harvard University Press',
      2023,
      'Wave mechanics, operator formalism, perturbation theory, and semiconductor device physics tailored for electrical engineers.',
      catMono, eceId, 4, sQuantum,
      '/src/assets/images/book_cover_physics_1795534389691.jpg'
    ).lastInsertRowid as number;
    const l2 = insertListing.run(b2, st2, 'EXCHANGE', 'GOOD', 'AVAILABLE', 'APPROVED', '', 'Includes complete formula appendix and lightly annotated problem sets.').lastInsertRowid as number;

    const b3 = insertBook.run(
      'Principles of Economics & Quantitative Analysis',
      'Harper, Lynch & Wang',
      '978-0-19-884210-1',
      '6th Edition',
      'Oxford Academic',
      2024,
      'Integrated macroeconomic modeling, microeconomic equilibrium, and econometric estimation frameworks for undergraduate honors.',
      catText, econId, 2, sMacro,
      '/src/assets/images/book_cover_economics_1795534389897.jpg'
    ).lastInsertRowid as number;
    const l3 = insertListing.run(b3, st1, 'DONATION', 'NEW', 'AVAILABLE', 'APPROVED', '', 'Donated to incoming Economics & Engineering dual-degree cohort.').lastInsertRowid as number;

    const b4 = insertBook.run(
      'Structure & Symmetry: Principles of Architectural Design',
      'Dr. Eliza Vance & Prof. Julian Reid',
      '978-1-56898-941-2',
      '2nd Edition',
      'Princeton Architectural',
      2023,
      'Detailed monograph examining load-bearing geometry, timber-stone joints, and proportional harmonics in civic architecture.',
      catMono, archId, 4, sArch,
      '/src/assets/images/book_cover_architecture_1795534391035.jpg'
    ).lastInsertRowid as number;
    const l4 = insertListing.run(b4, st4, 'LEND', 'LIKE_NEW', 'AVAILABLE', 'APPROVED', '', 'Available for single-semester studio lending.').lastInsertRowid as number;

    const b5 = insertBook.run(
      'Distributed Systems & Consensus Engineering',
      'M. Kleppmann & S. Kulkarni',
      '978-1-4919-5035-7',
      '2nd Edition',
      'Cambridge Scholarly',
      2025,
      'Fault-tolerant replication, Raft consensus, partitioned storage engines, and real-time stream architectures.',
      catText, cseId, 5, sSys,
      '/src/assets/images/book_cover_algorithms_1795534389311.jpg'
    ).lastInsertRowid as number;
    // Pending book submission for Owner Approval Center demonstration
    const l5 = insertListing.run(b5, st2, 'EXCHANGE', 'LIKE_NEW', 'AVAILABLE', 'PENDING', '', 'Submitted for Spring semester approval queue.').lastInsertRowid as number;

    const b6 = insertBook.run(
      'Engineering Thermodynamics & Statistical Cycles',
      'Y. Cengel & M. Boles',
      '978-0-07-339817-4',
      '9th Edition',
      'McGraw Academic',
      2022,
      'Laws of thermodynamics, exergy analysis, vapor power cycles, and entropy balances for mechanical undergraduates.',
      catLab, mechId, 3, sThermo,
      '/src/assets/images/book_cover_physics_1795534389691.jpg'
    ).lastInsertRowid as number;
    // Pending donation submission for Owner Donation Management
    const l6 = insertListing.run(b6, st4, 'DONATION', 'GOOD', 'AVAILABLE', 'PENDING', '', 'Donating gently used copy after completing thermodynamics lab.').lastInsertRowid as number;

    // 7. Seed Sample Exchange Request, Donation Request, Approval Records, Notifications & Audit Log
    db.prepare(`
      INSERT INTO exchange_requests (listing_id, requester_student_id, offered_listing_id, message, status)
      VALUES (?, ?, ?, ?, 'PENDING')
    `).run(l2, st1, l1, 'Would love to swap Algorithms & Computation for Quantum Mechanics this semester.');

    db.prepare(`
      INSERT INTO donation_requests (listing_id, donor_student_id, recipient_student_id, status, purpose)
      VALUES (?, ?, ?, 'PENDING', ?)
    `).run(l3, st1, st3, 'Required core textbook for my Semester 2 Econometrics seminar.');

    const insertApproval = db.prepare(`
      INSERT INTO approval_records (entity_type, entity_id, decision, reason, decided_by)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertApproval.run('BOOK_LISTING', l1, 'APPROVED', 'Verified ISBN, edition, and condition photos.', ownerUser.id);
    insertApproval.run('BOOK_LISTING', l2, 'APPROVED', 'Approved for departmental exchange catalog.', ownerUser.id);
    insertApproval.run('BOOK_LISTING', l3, 'APPROVED', 'Verified academic donation.', ownerUser.id);
    insertApproval.run('BOOK_LISTING', l4, 'APPROVED', 'Approved architecture studio monograph.', ownerUser.id);

    const insertNotif = db.prepare(`
      INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertNotif.run(st1, 'Book Listing Approved', 'Your submission "Algorithms & Computation: An Introductory Guide" is now live in the student catalog.', 'SUCCESS', 'BOOK_LISTING', l1);
    insertNotif.run(st2, 'Listing Under Review', 'Your submission "Distributed Systems & Consensus Engineering" has been queued for Super Admin verification.', 'INFO', 'BOOK_LISTING', l5);
    insertNotif.run(ownerUser.id, 'Pending Approvals Ready', 'There are 2 new book submissions, 1 exchange request, and 1 student verification awaiting your review.', 'INFO', 'SYSTEM', 0);

    const insertAudit = db.prepare(`
      INSERT INTO audit_logs (actor_user_id, actor_email, action, affected_table, affected_id, previous_status, new_status, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAudit.run(ownerUser.id, OWNER_EMAIL, 'BOOK_APPROVED', 'book_listings', l1, 'PENDING', 'APPROVED', 'Approved Algorithms & Computation by Ananya Sharma');
    insertAudit.run(ownerUser.id, OWNER_EMAIL, 'STUDENT_VERIFIED', 'student_profiles', st1, 'PENDING', 'VERIFIED', 'Verified student ID ATH-2024-0118');
    insertAudit.run(ownerUser.id, OWNER_EMAIL, 'BOOK_APPROVED', 'book_listings', l3, 'PENDING', 'APPROVED', 'Approved donation listing Principles of Economics');
  }
}
