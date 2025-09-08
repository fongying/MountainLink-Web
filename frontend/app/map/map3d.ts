// app/map/map3d.ts
import type { Device } from './utils';

export type Camera = {
  center: { lat: number; lng: number };
  zoom?: number;
  tilt?: number;
  heading?: number;
  range?: number;
};

export type Photo3DController = {
  upsertDevice(d: Device): void;
  setActiveDevice(id: string | null): void;
  flyTo(lat: number, lon: number, opts?: { tilt?: number; heading?: number; range?: number }): void;
  flyToDevice(id: string, opts?: { tilt?: number; heading?: number; range?: number }): void;
  onMarkerClick?: (deviceId: string) => void;
};

type MK = any;

export async function initPhoto3D(host: HTMLElement, cam: Camera): Promise<Photo3DController> {
  const g: any = (globalThis as any).google;
  if (!g?.maps) throw new Error('Google Maps JS API not loaded');
  await g.maps.importLibrary?.('maps3d');

  // 建立 <gmp-map-3d>
  let el = host.querySelector('gmp-map-3d') as any;
  if (!el) {
    el = document.createElement('gmp-map-3d');
    el.setAttribute('mode', 'hybrid');
    el.style.cssText = 'display:block;width:100%;height:100%';
    host.appendChild(el);
  }

  // 初始化攝影機（properties）
  if (cam?.center) el.center  = { lat: Number(cam.center.lat), lng: Number(cam.center.lng), altitude: 0 };
  if (cam?.tilt    != null) el.tilt    = Number(cam.tilt);
  if (cam?.heading != null) el.heading = Number(cam.heading);
  if (cam?.range   != null) el.range   = Number(cam.range);

  // ====== 釘子不消失的關鍵：動態海拔 ======
  // 基礎高度與上限（可依需求調整）
  const ALT_BASE_MIN = 30;   // 最低抬升（公尺）
  const ALT_BASE_MAX = 280;  // 最高抬升（公尺）
  const ACTIVE_BOOST = 60;   // 被選取時加的高度（公尺）

  function computeAltitude(range: number | undefined, isActive: boolean): number {
    // 用相機 range 推算一個平滑高度：近 → 低，遠 → 高
    const r = Math.max(500, Math.min(6000, Number(range ?? 2000)));
    const t = (r - 500) / (6000 - 500); // 0..1
    const base = ALT_BASE_MIN + t * (ALT_BASE_MAX - ALT_BASE_MIN);
    return base + (isActive ? ACTIVE_BOOST : 0);
  }

  const markers = new Map<string, MK>();
  let activeId: string | null = null;

  function setMarkerAltitude(m: MK, isActive: boolean) {
    const a = computeAltitude(el?.range, isActive);
    const pos = m.position as { lat: number; lng: number; altitude?: number };
    if (!pos) return;
    m.position = { lat: pos.lat, lng: pos.lng, altitude: a };
  }

  function upsertDevice(d: Device) {
    if (d.lat == null || d.lon == null) return;

    let mk = markers.get(d.device_id);
    if (!mk) {
      const m = document.createElement('gmp-marker-3d') as any;
      m.title = d.device_id;
      m.extruded = false;
      // 先塞位置，海拔後面用 setMarkerAltitude 統一處理
      m.position = { lat: Number(d.lat), lng: Number(d.lon), altitude: 0 };
      m.addEventListener('gmp-click', () => {
        ctrl.onMarkerClick?.(d.device_id);
        setActiveDevice(d.device_id);
      });
      el.appendChild(m);
      markers.set(d.device_id, m);
      mk = m;
    } else {
      // 更新經緯度
      const isActive = !!(activeId && activeId === d.device_id);
      mk.position = { lat: Number(d.lat), lng: Number(d.lon), altitude: computeAltitude(el?.range, isActive) };
    }

    // 被選取就立桿、順便拉高一點；沒選取則收回
    mk.extruded = !!(activeId && activeId === d.device_id);
    setMarkerAltitude(mk, mk.extruded);
  }

  function setActiveDevice(id: string | null) {
    activeId = id;
    markers.forEach((m, key) => {
      const on = !!(id && key === id);
      m.extruded = on;
      setMarkerAltitude(m, on);
    });
  }

  function flyTo(lat: number, lon: number, opts?: { tilt?: number; heading?: number; range?: number }) {
    if (!el) return;
    el.center = { lat: Number(lat), lng: Number(lon), altitude: 0 };
    if (opts?.tilt    != null) el.tilt    = Number(opts.tilt);
    if (opts?.heading != null) el.heading = Number(opts.heading);
    if (opts?.range   != null) el.range   = Number(opts.range);
  }

  function flyToDevice(id: string, opts?: { tilt?: number; heading?: number; range?: number }) {
    const m = markers.get(id);
    if (!m || !m.position) return;
    const p = m.position as { lat:number; lng:number };
    setActiveDevice(id);
    flyTo(p.lat, p.lng, opts);
  }

  // ====== 監看相機距離，動態更新所有 marker 海拔 ======
  let lastRange = Number(el?.range ?? 0);
  let rafId = 0;
  const tick = () => {
    const now = Number(el?.range ?? 0);
    if (Math.abs(now - lastRange) > 1) {
      lastRange = now;
      markers.forEach((m, key) => {
        const on = !!(activeId && key === activeId);
        setMarkerAltitude(m, on);
      });
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  const ctrl: Photo3DController = {
    upsertDevice,
    setActiveDevice,
    flyTo,
    flyToDevice,
    onMarkerClick: undefined,
  };

  // 清理（若之後加上 destroy 再掛回 controller）
  host.addEventListener('DOMNodeRemoved', () => cancelAnimationFrame(rafId));

  return ctrl;
}
