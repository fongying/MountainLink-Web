// app/map/page.tsx
'use client';

/**
 * MapPage（模組化版本）
 * - Vector 地圖：由本頁管理（AdvancedMarker）
 * - 3D 寫實：委派給 map3d.ts 的 Photo3DController（內部自行插入 <gmp-map-3d>）
 *
 * 需求：
 * utils.ts 需輸出：
 *   - type Device, type Layer
 *   - function fromISO(): string
 *   - function pickMapId(layer: Layer): string
 *
 * map3d.ts 需輸出：
 *   - function initPhoto3D(host: HTMLElement, initialCam: Camera): Promise<Photo3DController>
 *   - type Photo3DController，至少具備：
 *       upsertDevice(d: Device): void
 *       flyTo(lat:number, lon:number, opts?: { zoom?: number; tilt?: number; heading?: number; range?: number }): void
 *       flyToDevice(id:string, opts?: { zoom?: number; tilt?: number; heading?: number; range?: number }): void
 *       onMarkerClick?: (deviceId: string) => void
 */
 
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Device, Layer } from './utils';
import { fromISO, pickMapId } from './utils';
import { initPhoto3D, type Photo3DController } from './map3d';

// ---- 型別：給向量地圖/視角用 ----
type Camera = {
  center: { lat: number; lng: number };
  zoom: number;
  tilt?: number;
  heading?: number;
};

export default function MapPage() {
  // ---- UI 狀態 ----
  const [devices, setDevices] = useState<Device[]>([]);
  const [picked, setPicked]   = useState('');
  const [follow, setFollow]   = useState(true);
  const [errMsg, setErrMsg]   = useState('');
  const [layer, setLayer]     = useState<Layer>('terrain');
  

  const pickedRef = useRef(picked);  useEffect(()=>{ pickedRef.current = picked; }, [picked]);
  const followRef = useRef(follow);  useEffect(()=>{ followRef.current = follow; }, [follow]);

  // ---- Google Vector Map ----
  const gMapRef      = useRef<any>(null);
  const gPolylineRef = useRef<any>(null);
  const gAdvMarkers  = useRef<Record<string, any>>({});

  // ---- Photorealistic 3D Controller（由 map3d.ts 管）----
  const photoHostRef = useRef<HTMLDivElement|null>(null);
  const photoCtrlRef = useRef<Photo3DController | null>(null);

  // ---- 其他參考 ----
  const esRef   = useRef<EventSource|null>(null);
  const dragRef = useRef<{active:boolean; sx:number; sy:number; tilt:number; heading:number}>({active:false,sx:0,sy:0,tilt:0,heading:0});
  
  const [me, setMe] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/me', { credentials:'include' })
      .then(r => r.ok ? r.json() : { ok:false })
      .then(d => { if (d?.ok) { setMe(d.user); } else { router.replace('/login'); } })
      .catch(() => router.replace('/login'));
  }, []);


  // 取得目前視角（Vector）
  const getCamera = (): Camera => {
    const m = gMapRef.current;
    if (!m) return { center: { lat: 23.9739, lng: 120.9820 }, zoom: 6, tilt: 0, heading: 0 };
    const c = m.getCenter?.();
    return {
      center: { lat: c?.lat?.(), lng: c?.lng?.() },
      zoom:   m.getZoom?.() || 6,
      tilt:   m.getTilt?.() || 0,
      heading:m.getHeading?.() || 0
    };
  };

  // 載好 Vector Map（只做一次）
  async function ensureVectorMap() {
    if (gMapRef.current) return;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!key) { setErrMsg('尚未設定 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'); return; }

    const { Loader } = await import('@googlemaps/js-api-loader');
    await new Loader({
      apiKey: key!,
      version: 'beta',
      libraries: ['marker', 'maps3d'], // 同步載入，避免重複
    }).load();

    const g = (window as any).google;
    const { Map, RenderingType } = await g.maps.importLibrary('maps');
    await g.maps.importLibrary('marker');   // AdvancedMarker
    await g.maps.importLibrary('maps3d');   // 讓 web components 可用

    const map = new Map(document.getElementById('gmap') as HTMLElement, {
      center: { lat: 23.9739, lng: 120.9820 },
      zoom: 6,
      mapId: pickMapId('terrain'),
      mapTypeId: 'terrain',
      renderingType: RenderingType.VECTOR,
      tiltInteractionEnabled: true,
      headingInteractionEnabled: true,
      gestureHandling: 'greedy',
      keyboardShortcuts: true,
      mapTypeControl: false,
    });
    gMapRef.current = map;

    // Ctrl+拖曳 → 調整 tilt/heading（向量地圖）
    const el = document.getElementById('gmap') as HTMLElement;
    el.onmousedown = (ev: MouseEvent) => {
      if (!ev.ctrlKey || ev.button !== 0 || !gMapRef.current) return;
      dragRef.current = { active:true, sx:ev.clientX, sy:ev.clientY, tilt: map.getTilt?.()||0, heading: map.getHeading?.()||0 };
      el.style.cursor = 'grabbing';
    };
    el.onmousemove = (ev: MouseEvent) => {
      const s = dragRef.current; if (!s.active || !gMapRef.current) return;
      const dx = ev.clientX - s.sx, dy = ev.clientY - s.sy;
      gMapRef.current.setHeading((s.heading + dx*0.5) % 360);
      gMapRef.current.setTilt(Math.max(0, Math.min(67, s.tilt - dy*0.3)));
    };
    el.onmouseup = el.onmouseleave = () => { dragRef.current.active=false; el.style.cursor=''; };
  }

  // 建立/取得 3D 控制器（map3d.ts 內部需插入 <gmp-map-3d>）
  async function ensurePhotoCtrl() {
    if (photoCtrlRef.current || !photoHostRef.current) return;
    photoCtrlRef.current = await initPhoto3D(photoHostRef.current, getCamera());
    // 讓 3D 上的點擊能回傳 device_id
    photoCtrlRef.current.onMarkerClick = (id: string) => setPicked(id);
  }

  // 切換圖層
  async function applyLayer(next: Layer) {
    await ensureVectorMap();
    const map = gMapRef.current;
    if (!map) return;

    const cam = getCamera(); // 記住視角

    if (next === 'photo3d') {
      await ensurePhotoCtrl();
      devices.forEach(d => photoCtrlRef.current?.upsertDevice(d));
      // 顯示 3D、隱藏 Vector
      (document.getElementById('gmap') as HTMLElement).style.display = 'none';
      photoHostRef.current!.style.display = 'block';
      photoCtrlRef.current?.setActiveDevice(pickedRef.current || null);
      // 讓 3D 初始視角接近目前視野
      photoCtrlRef.current?.flyTo(cam.center.lat, cam.center.lng, {
        tilt: Math.max(45, cam.tilt ?? 67),
        heading: cam.heading ?? 0,
        range: 5000
      });
      return;
    }

    // 回到 Vector：顯示 Vector、隱藏 3D
    photoHostRef.current?.style && (photoHostRef.current.style.display = 'none');
    (document.getElementById('gmap') as HTMLElement).style.display = 'block';

    // 只切 mapTypeId；mapId 維持初始化設定
    const targetType = (next === 'buildings3d') ? 'roadmap' : next;
    map.setOptions({ mapTypeId: targetType as any });

    // 還原視角
    map.setCenter(cam.center);
    map.setZoom(cam.zoom);
    if (next === 'buildings3d') {
      map.setTilt(Math.max(45, cam.tilt ?? 45));
    } else {
      map.setTilt(cam.tilt ?? 0);
      map.setHeading(cam.heading ?? 0);
    }
  }

  // 下載裝置清單
  async function loadList() {
    const rows: Device[] = await fetch('/api/devices', { cache:'no-store' }).then(r=>{
      if(!r.ok) throw new Error('/api/devices failed');
      return r.json();
    });
    setDevices(rows);

    rows.forEach(r => {
      // Vector：更新/建立 AdvancedMarker
      upsertVectorMarker(r);
      // 3D：交給 controller 管
      photoCtrlRef.current?.upsertDevice(r);
    });
  }

  // Vector：新增/更新 AdvancedMarker
  function upsertVectorMarker(d: Device) {
    if (!gMapRef.current || d.lat==null || d.lon==null) return;
    const { AdvancedMarkerElement, PinElement } = (window as any).google.maps.marker;
    let mk = gAdvMarkers.current[d.device_id];
    if (!mk) {
      const pin = new PinElement({ glyph: d.device_id, scale: 1.1 });
      mk = new AdvancedMarkerElement({
        map: gMapRef.current,
        position: { lat: d.lat, lng: d.lon },
        title: d.device_id,
        content: pin.element,
        gmpClickable: true,
      });
      mk.addListener?.('gmp-click', () => focusOnDevice(d.device_id));
      gAdvMarkers.current[d.device_id] = mk;
    } else {
      mk.position = { lat: d.lat, lng: d.lon };
    }
  }

  // 聚焦到裝置（依圖層分流）
  function focusOnDevice(id: string) {
    const m = gMapRef.current;
    const v = gAdvMarkers.current[id];

    if (layer === 'photo3d') {
      // ★ B) 選取清單或點地圖 -> 同步 3D 視圖與高亮
      photoCtrlRef.current?.setActiveDevice(id);
      photoCtrlRef.current?.flyToDevice(id, { range: 1200, tilt: 75 });
      return;
    }

    if (v?.position && m) {
      m.panTo(v.position);
      if ((m.getZoom?.()||10) < 12) m.setZoom(13);
    }
  }

  // 畫軌跡（僅 Vector）
  async function drawTrailG(id: string) {
    if (!id || !gMapRef.current) return;
    const geo = await fetch(`/api/device/${encodeURIComponent(id)}/trail?from=${encodeURIComponent(fromISO())}&limit=5000`, { cache:'no-store' }).then(r=>r.json());
    const coords: Array<{lat:number;lng:number}> = (geo.features||[])
      .map((f:any)=>f?.geometry?.coordinates).filter((c:any)=>Array.isArray(c))
      .map((c:any)=>({ lat:c[1], lng:c[0] }));

    const google = (window as any).google;
    if (gPolylineRef.current) gPolylineRef.current.setMap(null);
    gPolylineRef.current = new google.maps.Polyline({ path: coords, map: gMapRef.current });

    const last = coords[coords.length-1];
    if (last) { gMapRef.current.setCenter(last); gMapRef.current.setZoom(12); }
  }

  // 初始化
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        await ensureVectorMap();
        if (disposed) return;

        await applyLayer(layer);
        await loadList();

        // SSE：即時更新
        const es = new EventSource('/api/stream');
        es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.type === 'telemetry') {
              const d: Device = { device_id:data.device_id, hr:data.hr, battery:data.battery, ts:data.ts, lat:data.lat, lon:data.lon, alt:data.alt };

              // Vector 更新
              upsertVectorMarker(d);

              // 3D 更新
              photoCtrlRef.current?.upsertDevice(d);

              // 追隨當前選取裝置
              if (followRef.current && pickedRef.current && pickedRef.current === d.device_id) {
                // Vector：重畫軌跡、移動中心
                drawTrailG(d.device_id);
                if (d.lat!=null && d.lon!=null) {
                  gMapRef.current?.setCenter({ lat:d.lat, lng:d.lon });
                  if ((gMapRef.current?.getZoom?.()||10) < 12) gMapRef.current?.setZoom(12);
                }
                // 3D：攝影機跟隨
                if (layer === 'photo3d' && d.lat!=null && d.lon!=null) {
                  photoCtrlRef.current?.flyTo(d.lat, d.lon, { zoom: 15, tilt: 67, range: 2000 });
                }
              }
            }
          } catch {}
        };
        esRef.current = es;
      } catch (e:any) {
        console.error(e);
        setErrMsg(e?.message || 'map init failed');
      }
    })();
    return () => { try { esRef.current?.close(); } catch {}; gMapRef.current=null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切換圖層
  useEffect(() => {
    applyLayer(layer).catch(err=>{ console.error(err); setErrMsg(String(err)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer]);

  // 改變選取裝置 → 聚焦
  useEffect(() => { if (picked) focusOnDevice(picked); }, [picked]);

  return (
    <main style={{height:'100vh',width:'100vw',fontFamily:'system-ui'}}>
      {/* 控制面板 */}
      <div style={{position:'absolute',zIndex:10,background:'#fff',padding:10,margin:10,borderRadius:8,boxShadow:'0 2px 8px rgba(0,0,0,.15)'}}>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',minWidth:540}}>
          <b>圖層：</b>
          <select value={layer} onChange={e=>setLayer(e.target.value as Layer)}>
            <option value="roadmap">道路</option>
            <option value="terrain">地形</option>
            <option value="satellite">衛星</option>
            <option value="hybrid">混合</option>
            <option value="buildings3d">3D建築（向量）</option>
            <option value="photo3d">3D寫實（預覽）</option>
          </select>

          <button onClick={()=>{ gMapRef.current?.setTilt(0); gMapRef.current?.setHeading(0); }}>
            重置視角
          </button>

          <b style={{marginLeft:8}}>裝置：</b>
          <select value={picked} onChange={e=>setPicked(e.target.value)}>
            <option value="">（選擇裝置顯示軌跡）</option>
            {devices.map(d => <option key={d.device_id} value={d.device_id}>{d.device_id}</option>)}
          </select>

          <button onClick={loadList}>重整清單</button>
          <label style={{display:'inline-flex',alignItems:'center',gap:6}}>
            <input type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)} />
            追隨
          </label>
          {picked && <button onClick={()=>drawTrailG(picked)}>重畫軌跡</button>}
        </div>
        {errMsg && <div style={{marginTop:6,color:'#b00'}}>⚠ {errMsg}</div>}
      </div>

      {/* Vector 容器（預設顯示） */}
      <div id="gmap" style={{height:'100%',width:'100%'}} />

      {/* Photo 3D 容器（交給 map3d.ts 插入 <gmp-map-3d>；切到 photo3d 才顯示） */}
      <div id="photo3d-host" ref={photoHostRef} style={{display:'none',height:'100%',width:'100%'}} />
    </main>
  );
}
