import { NextRequest, NextResponse } from 'next/server';
const BACKEND = (process.env.BACKEND_URL || '').replace(/\/+$/, '');

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const id = decodeURIComponent(ctx.params.id || '');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const cookie = req.headers.get('cookie') ?? '';
  const r = await fetch(`${BACKEND}/api/devices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { cookie, 'content-type': 'application/json' },
  });
  if (r.status === 204 || r.status === 200) return new NextResponse(null, { status: 204 });
  return NextResponse.json({ error: 'Upstream delete failed', body: await r.text().catch(()=> '') }, { status: r.status || 502 });
}
