export type Layer =
  | 'roadmap'
  | 'terrain'
  | 'satellite'
  | 'hybrid'
  | 'buildings3d'
  | 'photo3d';

export type Device = {
  device_id: string;
  lat?: number | null;
  lon?: number | null;
  alt?: number | null;
  hr?: number | null;
  battery?: number | null;
  ts?: number | string | null;
};

export function fromISO(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function pickMapId(layer: Layer): string | undefined {
  // 若未設定就回傳 undefined（使用 Google 預設樣式）
  const env: Record<string, string | undefined> = {
    roadmap:     process.env.NEXT_PUBLIC_GOOGLE_MAP_ID_ROADMAP,
    terrain:     process.env.NEXT_PUBLIC_GOOGLE_MAP_ID_TERRAIN,
    satellite:   process.env.NEXT_PUBLIC_GOOGLE_MAP_ID_SATELLITE,
    hybrid:      process.env.NEXT_PUBLIC_GOOGLE_MAP_ID_HYBRID,
    buildings3d: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID_BUILDINGS3D,
  };
  if (layer === 'photo3d') return undefined;
  return env[layer] || undefined;
}

export function safe(v: any): string {
  try { return String(v ?? ''); } catch { return ''; }
}
