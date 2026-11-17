import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'oc_session';
export const SESSION_SECONDS = 60 * 60 * 12;

/** `admin` can mark project milestones and change settings; `user` is the shared-password access. */
export type Role = 'user' | 'admin';

function secrets() {
  const password = process.env.APP_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;
  return password && sessionSecret ? { password, sessionSecret, adminPassword: process.env.ADMIN_PASSWORD || null } : null;
}

export const isAuthConfigured = () => secrets() !== null;
export const isAdminConfigured = () => Boolean(secrets()?.adminPassword);

const sha256 = (value: string) => createHash('sha256').update(value).digest();
const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('hex');
const same = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b));

/** Role granted by a password: the admin password gives admin, the shared one gives user. Null when wrong. */
export function roleForPassword(candidate: string): Role | null {
  const config = secrets();
  if (!config) return null;
  if (config.adminPassword && same(candidate, config.adminPassword)) return 'admin';
  return same(candidate, config.password) ? 'user' : null;
}

export function createSessionToken(role: Role): string {
  const config = secrets();
  if (!config) throw new Error('Auth is not configured');
  const payload = `${Date.now() + SESSION_SECONDS * 1000}.${role}`;
  return `${payload}.${sign(payload, config.sessionSecret)}`;
}

/** Role of a valid, unexpired session token, or null. */
export function sessionRole(token: string | undefined): Role | null {
  const config = secrets();
  if (!config || !token) return null;
  const [expires, role, signature] = token.split('.');
  if (!expires || !signature || (role !== 'user' && role !== 'admin')) return null;
  const expected = Buffer.from(sign(`${expires}.${role}`, config.sessionSecret));
  const received = Buffer.from(signature);
  const valid = expected.length === received.length && timingSafeEqual(expected, received) && Number(expires) > Date.now();
  return valid ? role : null;
}

export const isValidSessionToken = (token: string | undefined) => sessionRole(token) !== null;
