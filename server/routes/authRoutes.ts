import { Router } from 'express';
import crypto from 'node:crypto';
import { db, OWNER_EMAIL, hashPasswordSync, verifyPasswordSync } from '../db.ts';
import { signToken, requireAuth, logAudit, createNotification, type AuthRequest } from '../auth.ts';

const router = Router();

function safeCompareSecret(input: string, expected: string): boolean {
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

router.get('/owner-status', (_req, res) => {
  const envPasscode = process.env.OWNER_ADMIN_PASSCODE?.trim() || '';
  const owner = db
    .prepare('SELECT id, email, password_hash FROM users WHERE lower(email) = lower(?) AND role = \'SUPER_ADMIN\'')
    .get(OWNER_EMAIL) as { id: number; email: string; password_hash: string | null } | undefined;

  const hasStoredHash = Boolean(owner?.password_hash);
  res.json({
    ownerEmail: OWNER_EMAIL,
    needsSetup: !hasStoredHash && !envPasscode,
    envPasscodeActive: Boolean(envPasscode),
    hasRecoveryConfigured: hasStoredHash
  });
});

router.post('/owner-setup', (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || email.trim().toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    res.status(403).json({ error: 'Only the designated Super Administrator email may claim ownership.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
    return;
  }

  const envPasscode = process.env.OWNER_ADMIN_PASSCODE?.trim();
  if (envPasscode) {
    res.status(409).json({ error: 'Owner passcode is already managed by server environment configuration.' });
    return;
  }

  const owner = db
    .prepare('SELECT id, email, password_hash, role FROM users WHERE lower(email) = lower(?)')
    .get(OWNER_EMAIL) as { id: number; email: string; password_hash: string | null; role: string } | undefined;

  if (!owner || owner.role !== 'SUPER_ADMIN') {
    res.status(404).json({ error: 'Super Administrator account record missing.' });
    return;
  }
  if (owner.password_hash) {
    res.status(409).json({ error: 'Super Administrator account has already been claimed. Please sign in or reset your password.' });
    return;
  }

  const passwordHash = hashPasswordSync(password);
  const recoveryKey = `ATH-REC-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  const recoveryKeyHash = hashPasswordSync(recoveryKey);

  const result = db
    .prepare(`
      UPDATE users
      SET password_hash = ?, recovery_key_hash = ?, last_login_at = datetime('now')
      WHERE id = ? AND password_hash IS NULL
    `)
    .run(passwordHash, recoveryKeyHash, owner.id);

  if (result.changes === 0) {
    res.status(409).json({ error: 'Owner account was already initialized.' });
    return;
  }

  logAudit({
    actorUserId: owner.id,
    actorEmail: owner.email,
    action: 'OWNER_ACCOUNT_CLAIMED',
    affectedTable: 'users',
    affectedId: owner.id,
    previousStatus: 'UNCLAIMED',
    newStatus: 'ACTIVE',
    details: 'Initial Super Administrator password configured via first-run setup.'
  });

  const token = signToken({ sub: owner.id, email: owner.email, role: 'SUPER_ADMIN' });
  res.json({
    token,
    recoveryKey,
    user: { id: owner.id, email: owner.email, role: 'SUPER_ADMIN', status: 'ACTIVE', is_verified: 1 }
  });
});

router.post('/owner-login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  if (email.trim().toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    res.status(401).json({ error: 'Unauthorized administrator credentials.' });
    return;
  }

  const owner = db
    .prepare('SELECT id, email, password_hash, role, status, is_verified FROM users WHERE lower(email) = lower(?) AND role = \'SUPER_ADMIN\'')
    .get(OWNER_EMAIL) as {
    id: number;
    email: string;
    password_hash: string | null;
    role: 'SUPER_ADMIN';
    status: string;
    is_verified: number;
  } | undefined;

  if (!owner) {
    res.status(401).json({ error: 'Super Administrator record not found.' });
    return;
  }

  const envPasscode = process.env.OWNER_ADMIN_PASSCODE?.trim();
  let authorized = false;

  if (envPasscode && safeCompareSecret(password, envPasscode)) {
    authorized = true;
  } else if (owner.password_hash && verifyPasswordSync(password, owner.password_hash)) {
    authorized = true;
  }

  if (!authorized) {
    logAudit({
      actorUserId: owner.id,
      actorEmail: owner.email,
      action: 'OWNER_LOGIN_FAILED',
      affectedTable: 'users',
      affectedId: owner.id,
      details: 'Invalid Super Administrator login attempt.'
    });
    res.status(401).json({ error: 'Invalid Super Administrator credentials.' });
    return;
  }

  db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(owner.id);
  logAudit({
    actorUserId: owner.id,
    actorEmail: owner.email,
    action: 'OWNER_LOGIN_SUCCESS',
    affectedTable: 'users',
    affectedId: owner.id,
    details: 'Authenticated into Super Administrator executive portal.'
  });

  const token = signToken({ sub: owner.id, email: owner.email, role: 'SUPER_ADMIN' });
  res.json({
    token,
    user: { id: owner.id, email: owner.email, role: owner.role, status: owner.status, is_verified: owner.is_verified }
  });
});

router.post('/owner-reset', (req, res) => {
  const { email, recoveryKey, newPassword } = req.body ?? {};
  if (typeof email !== 'string' || email.trim().toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    res.status(403).json({ error: 'Unauthorized email for Super Administrator reset.' });
    return;
  }
  if (typeof recoveryKey !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: 'Valid recovery key and new password (min 8 chars) are required.' });
    return;
  }

  const owner = db
    .prepare('SELECT id, email, recovery_key_hash FROM users WHERE lower(email) = lower(?) AND role = \'SUPER_ADMIN\'')
    .get(OWNER_EMAIL) as { id: number; email: string; recovery_key_hash: string | null } | undefined;

  if (!owner) {
    res.status(404).json({ error: 'Owner record not found.' });
    return;
  }

  const envPasscode = process.env.OWNER_ADMIN_PASSCODE?.trim();
  const validEnv = Boolean(envPasscode && safeCompareSecret(recoveryKey.trim(), envPasscode));
  const validRecovery = Boolean(owner.recovery_key_hash && verifyPasswordSync(recoveryKey.trim(), owner.recovery_key_hash));

  if (!validEnv && !validRecovery) {
    res.status(401).json({ error: 'Invalid recovery key or environment passcode.' });
    return;
  }

  const newHash = hashPasswordSync(newPassword);
  const nextRecoveryKey = `ATH-REC-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  const nextRecoveryHash = hashPasswordSync(nextRecoveryKey);

  db.prepare('UPDATE users SET password_hash = ?, recovery_key_hash = ? WHERE id = ?').run(newHash, nextRecoveryHash, owner.id);

  logAudit({
    actorUserId: owner.id,
    actorEmail: owner.email,
    action: 'OWNER_PASSWORD_RESET',
    affectedTable: 'users',
    affectedId: owner.id,
    details: 'Super Administrator password updated via verified recovery.'
  });

  res.json({ success: true, recoveryKey: nextRecoveryKey });
});

router.post('/register', (req, res) => {
  const { email, password, fullName, studentIdNumber, departmentId, semesterId, phone } = req.body ?? {};

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: 'Please provide a valid institutional email address.' });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail === OWNER_EMAIL.toLowerCase()) {
    res.status(403).json({ error: 'Public registration is strictly prohibited for administrator identities.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
    return;
  }
  if (typeof fullName !== 'string' || fullName.trim().length < 2) {
    res.status(400).json({ error: 'Full name is required.' });
    return;
  }
  if (typeof studentIdNumber !== 'string' || studentIdNumber.trim().length < 3) {
    res.status(400).json({ error: 'Student ID number is required.' });
    return;
  }

  const existingEmail = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizedEmail);
  if (existingEmail) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }
  const existingSid = db.prepare('SELECT user_id FROM student_profiles WHERE lower(student_id_number) = lower(?)').get(studentIdNumber.trim());
  if (existingSid) {
    res.status(409).json({ error: 'This Student ID number is already registered.' });
    return;
  }

  const passwordHash = hashPasswordSync(password);
  const deptId = departmentId ? Number(departmentId) : null;
  const semId = semesterId ? Number(semesterId) : null;

  try {
    db.exec('BEGIN IMMEDIATE');
    // Strictly hardcode role = 'STUDENT' — never accept role from client input.
    const userResult = db
      .prepare(`INSERT INTO users (email, password_hash, role, status, is_verified) VALUES (?, ?, 'STUDENT', 'ACTIVE', 0)`)
      .run(normalizedEmail, passwordHash);
    const userId = Number(userResult.lastInsertRowid);

    db.prepare(`
      INSERT INTO student_profiles (user_id, full_name, student_id_number, department_id, semester_id, phone, verification_status)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(userId, fullName.trim(), studentIdNumber.trim(), deptId, semId, typeof phone === 'string' ? phone.trim() : '');

    const owner = db.prepare('SELECT id FROM users WHERE role = \'SUPER_ADMIN\' LIMIT 1').get() as { id: number } | undefined;
    if (owner) {
      createNotification({
        userId: owner.id,
        title: 'New Student Verification Pending',
        message: `${fullName.trim()} (${studentIdNumber.trim()}) registered and awaits student verification.`,
        type: 'INFO',
        relatedEntityType: 'STUDENT_PROFILE',
        relatedEntityId: userId
      });
    }

    createNotification({
      userId,
      title: 'Welcome to Athenaeum',
      message: 'Your student account is active. Your academic ID verification is currently under Super Admin review.',
      type: 'SUCCESS',
      relatedEntityType: 'STUDENT_PROFILE',
      relatedEntityId: userId
    });

    logAudit({
      actorUserId: userId,
      actorEmail: normalizedEmail,
      action: 'STUDENT_REGISTERED',
      affectedTable: 'users',
      affectedId: userId,
      newStatus: 'ACTIVE',
      details: `Registered student ${fullName.trim()} (${studentIdNumber.trim()})`
    });
    db.exec('COMMIT');

    const token = signToken({ sub: userId, email: normalizedEmail, role: 'STUDENT' });
    res.status(201).json({
      token,
      user: { id: userId, email: normalizedEmail, role: 'STUDENT', status: 'ACTIVE', is_verified: 0 }
    });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err instanceof Error ? err.message : 'Registration failed.' });
  }
});

router.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail === OWNER_EMAIL.toLowerCase()) {
    res.status(403).json({ error: 'Administrator accounts must sign in through the dedicated Owner Portal.' });
    return;
  }

  const user = db
    .prepare('SELECT id, email, password_hash, role, status, is_verified FROM users WHERE lower(email) = ?')
    .get(normalizedEmail) as {
    id: number;
    email: string;
    password_hash: string | null;
    role: 'STUDENT' | 'SUPER_ADMIN';
    status: string;
    is_verified: number;
  } | undefined;

  if (!user || user.role !== 'STUDENT' || !user.password_hash || !verifyPasswordSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (user.status !== 'ACTIVE') {
    res.status(403).json({ error: `Your account is ${user.status.toLowerCase()}. Please contact the Super Administrator.` });
    return;
  }

  db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(user.id);
  logAudit({
    actorUserId: user.id,
    actorEmail: user.email,
    action: 'STUDENT_LOGIN',
    affectedTable: 'users',
    affectedId: user.id
  });

  const token = signToken({ sub: user.id, email: user.email, role: 'STUDENT' });
  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, status: user.status, is_verified: user.is_verified }
  });
});

router.get('/me', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const profile =
    user.role === 'STUDENT'
      ? db
          .prepare(`
            SELECT sp.*, d.name as department_name, d.code as department_code, s.label as semester_label
            FROM student_profiles sp
            LEFT JOIN departments d ON sp.department_id = d.id
            LEFT JOIN semesters s ON sp.semester_id = s.id
            WHERE sp.user_id = ?
          `)
          .get(user.id)
      : null;

  const unread = db
    .prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(user.id) as { count: number };

  res.json({
    user,
    profile,
    unreadNotifications: unread.count
  });
});

router.post('/change-password', requireAuth, (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8) {
    res.status(400).json({ error: 'Current password and new password (min 8 characters) are required.' });
    return;
  }
  const userRow = db
    .prepare('SELECT id, email, password_hash, role FROM users WHERE id = ?')
    .get(req.user!.id) as { id: number; email: string; password_hash: string | null; role: string } | undefined;

  if (!userRow) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  const envPasscode = userRow.role === 'SUPER_ADMIN' ? process.env.OWNER_ADMIN_PASSCODE?.trim() : undefined;
  const matchesCurrent =
    (envPasscode && safeCompareSecret(currentPassword, envPasscode)) ||
    (userRow.password_hash && verifyPasswordSync(currentPassword, userRow.password_hash));

  if (!matchesCurrent) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  const updatedHash = hashPasswordSync(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(updatedHash, userRow.id);
  logAudit({
    actorUserId: userRow.id,
    actorEmail: userRow.email,
    action: 'PASSWORD_CHANGED',
    affectedTable: 'users',
    affectedId: userRow.id
  });
  res.json({ success: true });
});

export default router;
