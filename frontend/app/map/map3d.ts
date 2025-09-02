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
  flyTo(lat: number, lon: number, opts?: { zoom?: number; tilt?: number; heading?: number; range?: number }): void;
  flyToDevice(id: string, opts?: { zoom?: number; tilt?: number; heading?: number; range?: number }): void;
  onMarkerClick?: (deviceId: string) => void;
};

type MK = any;

export async function initPhoto3D(host: HTMLElement, cam: Camera): Promise<Photo3DController> {
  const g = (window as any).google;
  if (!g?.maps) throw new Error('Google Maps JS API not loaded');
  await g.maps.importLibrary?.('maps3d');

  // 建立 <gmp-map-3d>
  let el = host.querySelector('gmp-map-3d') as any;
  if (!el) {
    el = document.createElement('gmp-map-3d');
    el.setAttribute('mode', 'hybrid');
    el.style.display = 'block';
    el.style.height = '100%';
    el.style.width = '100%';
    host.appendChild(el);
  }

  // 初始化攝影機（property 用 Object/number）
  if (cam?.center) el.center  = { lat: Number(cam.center.lat), lng: Number(cam.center.lng), altitude: 0 };
  if (cam?.tilt!=null)    el.tilt    = Number(cam.tilt);
  if (cam?.heading!=null) el.heading = Number(cam.heading);
  if (cam?.range!=null)   el.range   = Number(cam.range);

  const markers = new Map<string, MK>();
  let activeId: string | null = null;

  function upsertDevice(d: Device) {
    if (d.lat == null || d.lon == null) return;
    let mk = markers.get(d.device_id);
    if (!mk) {
      const m = document.createElement('gmp-marker-3d') as any;
      m.position = { lat: Number(d.lat), lng: Number(d.lon), altitude: 0 };   // property → Object
      m.title = d.device_id;
      m.extruded = false;
      m.addEventListener('gmp-click', () => {
        ctrl.onMarkerClick && ctrl.onMarkerClick(d.device_id);
        setActiveDevice(d.device_id);
      });
      el.appendChild(m);
      markers.set(d.device_id, m);
      mk = m;
    } else {
      mk.position = { lat: d.lat, lng: d.lon };
    }
    mk.extruded = !!(activeId && activeId === d.device_id);
  }

  function setActiveDevice(id: string | null) {
    activeId = id;
    markers.forEach((m, key) => { m.extruded = !!(activeId && key === activeId); });
  }

  function flyTo(lat: number, lon: number, opts?: { zoom?: number; tilt?: number; heading?: number; range?: number }) {
    if (!el) return;
    el.center = { lat: Number(lat), lng: Number(lon), altitude: 0 };  // property → Object
    if (opts?.tilt    != null) el.tilt    = Number(opts.tilt);
    if (opts?.heading != null) el.heading = Number(opts.heading);
    if (opts?.range   != null) el.range   = Number(opts.range);
  }

  function flyToDevice(id: string, opts?: { zoom?: number; tilt?: number; heading?: number; range?: number }) {
    const m = markers.get(id);
    if (!m || !m.position) return;
    const p = m.position as { lat:number; lng:number };
    setActiveDevice(id);
    flyTo(p.lat, p.lng, opts);
  }

  const ctrl: Photo3DController = {
    upsertDevice,
    setActiveDevice,
    flyTo,
    flyToDevice,
    onMarkerClick: undefined
  };
  return ctrl;
}
