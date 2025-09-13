import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  await req.json().catch(() => ({}));
  const res = NextResponse.json(
    { ok: true, user: { email: 'dev@mountain.link' } },
    { status: 200 }
  );
  res.cookies.set('token', 'dev-session', { httpOnly: true, path: '/', maxAge: 7*24*3600 });
  return res;
}
