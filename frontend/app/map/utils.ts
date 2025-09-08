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
  last_ts?: string | null;    // 後端清單的欄位
  sos?: boolean | null;
};

export function fromISO(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function pickMapId(layer: Layer): string | undefined {
  if (layer === 'photo3d') return undefined; // 3D 寫實不吃 mapId

  type VLayer = Exclude<Layer, 'photo3d'>;

  const NEW_IDS: Record<VLayer, string | undefined> = {
    roadmap:     process.env.NEXT_PUBLIC_GMAP_ID_ROADMAP,
    terrain:     process.env.NEXT_PUBLIC_GMAP_ID_TERRAIN,
    satellite:   process.env.NEXT_PUBLIC_GMAP_ID_SATELLITE,
    hybrid:      process.env.NEXT_PUBLIC_GMAP_ID_HYBRID,
    buildings3d: process.env.NEXT_PUBLIC_GMAP_ID_BUILDINGS3D,
  };

  const LEGACY_IDS: Record<VLayer, string | undefined> = {
    roadmap:     process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || process.env.NEXT_PUBLIC_GOOGLE_MAP_ID_STD,
    terrain:     process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || process.env.NEXT_PUBLIC_GOOGLE_MAP_ID_STD,
    satellite:   process.env.NEXT_PUBLIC_GOOGLE_MAP_ID_SAT,
    hybrid:      process.env.NEXT_PUBLIC_GOOGLE_MAP_ID_SAT,
    buildings3d: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || process.env.NEXT_PUBLIC_GOOGLE_MAP_ID_STD,
  };

  const key = layer as VLayer;
  return NEW_IDS[key] ?? LEGACY_IDS[key] ?? undefined;
}

export function safe(v: any): string {
  try { return String(v ?? ''); } catch { return ''; }
}
