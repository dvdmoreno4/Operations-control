import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse, ApiError, jsonBody } from '@/src/lib/api';
import {
  createSessionToken,
  isAdminConfigured,
  isAuthConfigured,
  roleForPassword,
  sessionRole,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from '@/src/lib/session';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

export async function GET(req: NextRequest) {
  const role = sessionRole(req.cookies.get(SESSION_COOKIE)?.value);
  return NextResponse.json({
    configured: isAuthConfigured(),
    adminConfigured: isAdminConfigured(),
    authenticated: role !== null,
    admin: role === 'admin',
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthConfigured()) throw new ApiError(503, 'Falta configurar APP_PASSWORD y SESSION_SECRET');
    const { password } = await jsonBody(req);
    const role = typeof password === 'string' ? roleForPassword(password) : null;
    if (!role) throw new ApiError(401, 'Clave incorrecta');
    const response = NextResponse.json({ ok: true, admin: role === 'admin' });
    response.cookies.set(SESSION_COOKIE, createSessionToken(role), { ...cookieOptions, maxAge: SESSION_SECONDS });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return response;
}
