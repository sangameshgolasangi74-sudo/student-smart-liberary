import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db, OWNER_EMAIL } from './db.ts';

// Ephemeral fallback only when JWT_SECRET is unset (never a hardcoded static secret).
const runtimeSecret = process.env.JWT_SECRET?.trim() || crypto.randomBytes(32).toString('hex');

export interface AuthUser {
  id: number;
  email: string;
  role: 'SUPER_ADMIN' | 'STUDENT';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  is_verified: number;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): string {
  const padLength = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function signToken(payload: { sub: number; email: string; role: 'SUPER_ADMIN' | 'STUDENT' }): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(
    JSON.stringify({
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      iat: now,
      exp: now + 60 * 60 * 24 * 7 // 7 days
    })
  );
  const signature = crypto
    .createHmac('sha256', runtimeSecret)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): { sub: number; email: string; role: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', runtimeSecret)
      .update(`${header}.${body}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const decoded = JSON.parse(base64UrlDecode(body)) as {
      sub: number;
      email: string;
      role: string;
      exp: number;
    };
    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session token' });
    return;
  }

  const user = db
    .prepare('SELECT id, email, role, status, is_verified FROM users WHERE id = ?')
    .get(payload.sub) as AuthUser | undefined;

  if (!user) {
    res.status(401).json({ error: 'Account not found' });
    return;
  }
  if (user.status !== 'ACTIVE') {
    res.status(403).json({ error: `Account is currently ${user.status.toLowerCase()}. Please contact the Super Administrator.` });
    return;
  }
  req.user = user;
  next();
}

export function requireOwner(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role !== 'SUPER_ADMIN' || req.user.email.toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    res.status(403).json({ error: 'Restricted to authorized Super Administrator only' });
    return;
  }
  next();
}

export function requireStudent(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role !== 'STUDENT') {
    res.status(403).json({ error: 'Student portal access only' });
    return;
  }
  next();
}

export function logAudit(params: {
  actorUserId: number | null;
  actorEmail: string;
  action: string;
  affectedTable: string;
  affectedId?: number | null;
  previousStatus?: string;
  newStatus?: string;
  details?: string;
}) {
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, actor_email, action, affected_table, affected_id, previous_status, new_status, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.actorUserId,
    params.actorEmail,
    params.action,
    params.affectedTable,
    params.affectedId ?? null,
    params.previousStatus ?? '',
    params.newStatus ?? '',
    params.details ?? ''
  );
}

export function createNotification(params: {
  userId: number;
  title: string;
  message: string;
  type?: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  relatedEntityType?: string;
  relatedEntityId?: number | null;
}) {
  db.prepare(`
    INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    params.userId,
    params.title,
    params.message,
    params.type ?? 'INFO',
    params.relatedEntityType ?? '',
    params.relatedEntityId ?? null
  );
}
