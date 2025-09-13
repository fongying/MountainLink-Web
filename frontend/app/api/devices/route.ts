import { NextRequest, NextResponse } from 'next/server';

const BACKEND = (process.env.BACKEND_URL || '').replace(/\/+$/, ''); // http://backend:4000

export async function GET(req: NextRequest) {
  const cookie = req.headers.get('cookie') ?? '';
  const url = new URL(req.url);
  const qs = url.search || '';
  const up = await fetch(`${BACKEND}/api/devices${qs}`, {
    method: 'GET',
    headers: { cookie },
  });
  const text = await up.text();
  return new NextResponse(text, {
    status: up.status,
    headers: { 'content-type': up.headers.get('content-type') ?? 'application/json' },
  });
}
