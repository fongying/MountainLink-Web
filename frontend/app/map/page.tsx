'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Device, Layer } from './utils';
import { fromISO, pickMapId } from './utils';
import { initPhoto3D, type Photo3DController } from './map3d';
import { I18nProvider, useI18n, type Lang } from './i18n';
import styles from './map.module.css';

type Camera = {
  center: { lat: number; lng: number };
  zoom: number;
  tilt?: number;
  heading?: number;
};

function MapInner() {
  const { t, lang, setLang } = useI18n();

  // --- Auth gate ---
  const [me, setMe] = useState<any>(null);
  const router = useRouter();
  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { ok: false }))
      .then(d => {
        if (d?.ok) setMe(d.user);
        else router.replace('/login');
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  // --- UI state ---
  const [devices, setDevices] = useState<Device[]>([]);
  const [picked, setPicked] = useState('');
  const [follow, setFollow] = useState(true);
  const [errMsg, setErrMsg] = useState('');
  const [layer, setLayer] = useState<Layer>('terrain');
  const [showPanel, setShowPanel] = useState(false);

  const pickedRef = useRef(picked);
  useEffect(() => { pickedRef.current = picked; }, [picked]);
  const followRef = useRef(follow);
  useEffect(() => { followRef.current = follow; }, [follow]);

  const sosHandledRef = useRef<number>(0); // 防噴多次
  useEffect(() => {
    const es = new EventSource('/api/stream');

    es.onmessage = (e) => {
      if (!e?.data) return;
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }

      if (msg?.type === 'sos' && msg?.device_id) {
        // 去抖：同一秒多次訊息只處理一次
        const key = Number(new Date(msg.ts || Date.now()).getTime());
        if (key === sosHandledRef.current) return;
        sosHandledRef.current = key;

        const id = String(msg.device_id);
        const textZh = `${id} 發送求救訊號，請確認地點以及開始救援行動`;
        const textEn = `${id} send SOS! please check user's location and start rescue operations`;
        const ok = window.confirm(`${textZh}\n\n${textEn}`);

        if (ok) {
          // 切換到該裝置 + 啟動追蹤 + 飛到點位
          setPicked(id);
          // 你現有的追蹤邏輯（若用布林）
          setFollow(true);
          focusOnDevice(id);
          if (msg.lat && msg.lon && gMapRef.current) {
            gMapRef.current.panTo({ lat: Number(msg.lat), lng: Number(msg.lon) });
            if ((gMapRef.current.getZoom?.() || 10) < 15) gMapRef.current.setZoom(15);
          }
        }
      }
    };

    es.onerror = () => {
      // 簡單重試：瀏覽器會自動重連 SSE，不用手動處理
      // 這裡可以放個 console.warn
    };

    return () => es.close();
  }, []);

  // --- Google Vector Map refs ---
  const gMapRef = useRef<any>(null);
  const gPolylineRef = useRef<any>(null);
  const gAdvMarkers = useRef<Record<string, any>>({});

  // --- Photorealistic 3D controller ---
  const photoHostRef = useRef<HTMLDivElement | null>(null);
  const photoCtrlRef = useRef<Photo3DController | null>(null);

  // --- misc ---
  const esRef = useRef<EventSource | null>(null);
  const dragRef = useRef<{ active: boolean; sx: number; sy: number; tilt: number; heading: number }>(
    { active: false, sx: 0, sy: 0, tilt: 0, heading: 0 }
  );

  const getPicked = () => devices.find(d => d.device_id === picked);

  function panelHTML(d: Device) {
    const rawTs = (d.ts || (d as any).last_ts) as string | undefined;
    const ts = rawTs ? new Date(rawTs).toLocaleString('zh-TW', { hour12: false }) : '-';
    const lat = d.lat != null ? d.lat.toFixed(5) : '-';
    const lon = d.lon != null ? d.lon.toFixed(5) : '-';
    return { ts, lat, lon };
  }

  function hrClass(hr?: number | null) {
    if (hr == null) return '';
    return (hr < 60 || hr > 120) ? styles.bad : '';
  }
  function sosClass(sos?: boolean | null) {
    return sos ? styles.sosOn : styles.sosOff;
  }

  const getCamera = (): Camera => {
    const m = gMapRef.current;
    if (!m) return { center: { lat: 23.9739, lng: 120.982 }, zoom: 6, tilt: 0, heading: 0 };
    const c = m.getCenter?.();
    return {
      center: { lat: c?.lat?.(), lng: c?.lng?.() },
      zoom: m.getZoom?.() || 6,
      tilt: m.getTilt?.() || 0,
      heading: m.getHeading?.() || 0,
    };
  };
  

  async function ensureVectorMap() {
    if (gMapRef.current) return;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined;
    if (!key) { setErrMsg('尚未設定 NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'); return; }

    const { Loader } = await import('@googlemaps/js-api-loader');
    await new Loader({
      apiKey: key!,
      version: 'beta',
      libraries: ['marker', 'maps3d'],
    }).load();

    const g = (window as any).google;
    const { Map, RenderingType } = await g.maps.importLibrary('maps');
    await g.maps.importLibrary('marker');
    await g.maps.importLibrary('maps3d');

    const map = new Map(document.getElementById('gmap') as HTMLElement, {
      center: { lat: 23.9739, lng: 120.982 },
      zoom: 6,
      mapId: pickMapId('terrain') || undefined,
      mapTypeId: 'terrain',
      renderingType: RenderingType.VECTOR,
      tiltInteractionEnabled: true,
      headingInteractionEnabled: true,
      gestureHandling: 'greedy',
      keyboardShortcuts: true,
      mapTypeControl: false,
    });
    gMapRef.current = map;

    const el = document.getElementById('gmap') as HTMLElement;
    el.onmousedown = (ev: MouseEvent) => {
      if (!ev.ctrlKey || ev.button !== 0 || !gMapRef.current) return;
      dragRef.current = {
        active: true,
        sx: ev.clientX,
        sy: ev.clientY,
        tilt: map.getTilt?.() || 0,
        heading: map.getHeading?.() || 0,
      };
      el.style.cursor = 'grabbing';
    };
    el.onmousemove = (ev: MouseEvent) => {
      const s = dragRef.current;
      if (!s.active || !gMapRef.current) return;
      const dx = ev.clientX - s.sx, dy = ev.clientY - s.sy;
      gMapRef.current.setHeading(((s.heading + dx * 0.5) % 360 + 360) % 360);
      gMapRef.current.setTilt(Math.max(0, Math.min(67, s.tilt - dy * 0.3)));
    };
    el.onmouseup = el.onmouseleave = () => {
      dragRef.current.active = false;
      el.style.cursor = '';
    };
  }

  async function ensurePhotoCtrl() {
    if (photoCtrlRef.current || !photoHostRef.current) return;
    photoCtrlRef.current = await initPhoto3D(photoHostRef.current!, getCamera());
    // 若 map3d.ts 有暴露 setLabels，這裡設定面板文字
    // photoCtrlRef.current.setLabels?.({
    //   hr: 'HR',
    //   battery: 'Battery',
    //   sos: 'SOS',
    //   time: 'Time',
    // });

    photoCtrlRef.current.onMarkerClick = (id: string) => {
      setPicked(id);
      setShowPanel(true);
    };
  }

  async function applyLayer(next: Layer) {
    await ensureVectorMap();
    const map = gMapRef.current;
    if (!map) return;

    const cam = getCamera();

    if (next === 'photo3d') {
      await ensurePhotoCtrl();
      devices.forEach(d => photoCtrlRef.current?.upsertDevice(map3dDeviceFrom(d)));
      (document.getElementById('gmap') as HTMLElement).style.display = 'none';
      photoHostRef.current!.style.display = 'block';
      photoCtrlRef.current?.setActiveDevice(pickedRef.current || null);
      if (cam.center?.lat && cam.center?.lng) {
        photoCtrlRef.current?.flyTo(cam.center.lat, cam.center.lng, {
          tilt: Math.max(45, cam.tilt ?? 67),
          heading: cam.heading ?? 0,
          range: 5000,
        });
      }
      return;
    }

    photoHostRef.current?.style && (photoHostRef.current.style.display = 'none');
    (document.getElementById('gmap') as HTMLElement).style.display = 'block';

    const targetType = next === 'buildings3d' ? 'roadmap' : next;
    map.setOptions({ mapTypeId: targetType as any, mapId: pickMapId(next) || undefined });

    map.setCenter(cam.center);
    map.setZoom(cam.zoom);
    if (next === 'buildings3d') {
      map.setTilt(Math.max(45, cam.tilt ?? 45));
    } else {
      map.setTilt(cam.tilt ?? 0);
      map.setHeading(cam.heading ?? 0);
    }
  }

  function upsertVectorMarker(d: Device) {
    if (!gMapRef.current || d.lat == null || d.lon == null) return;
    const g = (window as any).google;
    const { AdvancedMarkerElement, PinElement } = g.maps.marker;

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
      mk.addListener?.('gmp-click', () => {
        setPicked(d.device_id);
        setShowPanel(true);
        focusOnDevice(d.device_id);
      });
      gAdvMarkers.current[d.device_id] = mk;
    } else {
      mk.position = { lat: d.lat, lng: d.lon };
    }
  }

  function focusOnDevice(id: string) {
    const m = gMapRef.current;
    const v = gAdvMarkers.current[id];

    if (layer === 'photo3d') {
      photoCtrlRef.current?.setActiveDevice(id);
      photoCtrlRef.current?.flyToDevice(id, { range: 1200, tilt: 75 });
      return;
    }
    if (v?.position && m) {
      m.panTo(v.position);
      if ((m.getZoom?.() || 10) < 12) m.setZoom(13);
    }
  }

  async function drawTrailG(id: string) {
    if (!id || !gMapRef.current) return;
    const geo = await fetch(
      `/api/device/${encodeURIComponent(id)}/trail?from=${encodeURIComponent(fromISO())}&limit=5000`,
      { cache: 'no-store' }
    ).then(r => r.json());
    const coords: Array<{ lat: number; lng: number }> = (geo.features || [])
      .map((f: any) => f?.geometry?.coordinates)
      .filter((c: any) => Array.isArray(c))
      .map((c: any) => ({ lat: c[1], lng: c[0] }));

    const g = (window as any).google;
    if (gPolylineRef.current) gPolylineRef.current.setMap(null);
    gPolylineRef.current = new g.maps.Polyline({ path: coords, map: gMapRef.current });

    const last = coords[coords.length - 1];
    if (last) {
      gMapRef.current.setCenter(last);
      gMapRef.current.setZoom(12);
    }
  }

  function map3dDeviceFrom(d: Device): Device {
    return {
      device_id: d.device_id,
      hr: d.hr ?? null,
      battery: d.battery ?? null,
      ts: (d.ts ?? (d as any).last_ts ?? null) as string | null,
      lat: d.lat ?? null,
      lon: d.lon ?? null,
      alt: d.alt ?? null,
      sos: (d as any).sos ?? null,
    };
  }

  async function loadList() {
    const rows: Device[] = await fetch('/api/devices', { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error('/api/devices failed');
      return r.json();
    });
    setDevices(rows.map(r => ({ ...r, ts: (r as any).last_ts ?? r.ts ?? null })));
    rows.forEach(r => {
      upsertVectorMarker(r);
      photoCtrlRef.current?.upsertDevice(map3dDeviceFrom(r));
    });
  }

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        await ensureVectorMap();
        if (disposed) return;

        await applyLayer(layer);
        await loadList();

        const es = new EventSource('/api/stream');
        es.onmessage = ev => {
          try {
            const data = JSON.parse(ev.data);
            if (data.type === 'telemetry') {
              const d: Device = {
                device_id: data.device_id,
                hr: data.hr,
                battery: data.battery,
                ts: data.ts,
                lat: data.lat,
                lon: data.lon,
                alt: data.alt,
                sos: data.sos
              };
              upsertVectorMarker(d);
              setDevices(prev => {
                const idx = prev.findIndex(x => x.device_id === d.device_id);
                if (idx === -1) return [...prev, d];
                const next = [...prev];
                next[idx] = { ...next[idx], ...d };
                return next;
              });
              photoCtrlRef.current?.upsertDevice(map3dDeviceFrom(d));

              if (followRef.current && pickedRef.current && pickedRef.current === d.device_id) {
                drawTrailG(d.device_id);
                if (d.lat != null && d.lon != null) {
                  const m = gMapRef.current;
                  m?.setCenter({ lat: d.lat, lng: d.lon });
                  if ((m?.getZoom?.() || 10) < 12) m?.setZoom(12);
                }
                if (layer === 'photo3d' && d.lat != null && d.lon != null) {
                  photoCtrlRef.current?.flyTo(d.lat, d.lon, { tilt: 67, range: 2000 });
                }
              }
            }
          } catch {}
        };
        esRef.current = es;
      } catch (e: any) {
        console.error(e);
        setErrMsg(e?.message || 'map init failed');
      }
    })();
    return () => {
      try { esRef.current?.close(); } catch {}
      gMapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyLayer(layer).catch(err => {
      console.error(err);
      setErrMsg(String(err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer]);

  useEffect(() => {
    if (picked) focusOnDevice(picked);
  }, [picked]);

  function copyCoords(txt: string) {
    try { navigator.clipboard?.writeText(txt); } catch {}
  }

  return (
    <main className={styles.root}>
      {/* Top 控制列（平板優化） */}
      <div className={styles.topbar}>
        <div className={styles.row}>
          <div className={styles.group}>
            <label className={styles.label}>{t('layer')}</label>
            <select
              className={styles.select}
              value={layer}
              onChange={e => setLayer(e.target.value as Layer)}
              aria-label={t('layer')}
            >
              <option value="roadmap">{t('roadmap')}</option>
              <option value="terrain">{t('terrain')}</option>
              <option value="satellite">{t('satellite')}</option>
              <option value="hybrid">{t('hybrid')}</option>
              <option value="buildings3d">{t('buildings3d')}</option>
              <option value="photo3d">{t('photo3d')}</option>
            </select>

            <button
              className={styles.btn}
              onClick={() => {
                gMapRef.current?.setTilt(0);
                gMapRef.current?.setHeading(0);
              }}
              aria-label={t('resetView')}
              title={t('resetView')}
            >
              {t('resetView')}
            </button>

            {/* 語言切換 */}
            <label className={styles.label} style={{ marginLeft: 8 }}>{t('language')}</label>
            <select
              className={styles.select}
              value={lang}
              onChange={e => setLang(e.target.value as Lang)}
              aria-label="Language"
              style={{ marginLeft: 4 }}
            >
              <option value="zh">繁體中文</option>
              <option value="en">English</option>
            </select>
          </div>

          <div className={styles.group}>
            <label className={styles.label}>{t('device')}</label>
            <select
              className={styles.select}
              value={picked}
              onChange={e => {
                setPicked(e.target.value);
                setShowPanel(!!e.target.value);
              }}
              aria-label={t('device')}
            >
              <option value="">（{t('device')} + {t('coord')}）</option>
              {devices.map(d => (
                <option key={d.device_id} value={d.device_id}>
                  {d.device_id}
                </option>
              ))}
            </select>

            <button className={styles.btn} onClick={loadList} aria-label={t('refresh')}>
              {t('refresh')}
            </button>

            <label className={styles.chk}>
              <input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} />
              <span>{t('follow')}</span>
            </label>

            {picked && (
              <button className={styles.btn} onClick={() => drawTrailG(picked)}>
                {t('redrawTrail')}
              </button>
            )}
          </div>
        </div>

        {errMsg && <div className={styles.err}>⚠ {errMsg}</div>}
      </div>

      {/* 右上角資訊面板 */}
      {showPanel && picked && (() => {
        const d = getPicked();
        if (!d) return null;
        const x = panelHTML(d);
        const coord = `${x.lat}, ${x.lon}`;
        return (
          <aside className={styles.info}>
            <header className={styles.infoHeader}>
              <strong className={styles.id}>{d.device_id}</strong>
              <div className={styles.hdrBtns}>
                <button
                  className={styles.iconBtn}
                  title={t('copyCoord')}
                  onClick={() => copyCoords(coord)}
                  aria-label={t('copyCoord')}
                >
                  {'\u{1F4CC}'} {/* pushpin */}
                </button>
                <button
                  className={styles.iconBtn}
                  title={t('close')}
                  onClick={() => setShowPanel(false)}
                  aria-label={t('close')}
                >
                  {'\u2715'} {/* ✕ */}
                </button>
              </div>
            </header>

            <div className={styles.grid}>
              <div className={styles.item}>
                <div className={styles.k}>{t('hr')}</div>
                <div className={`${styles.v} ${hrClass(d.hr)}`}>{d.hr ?? '-'}</div>
              </div>
              <div className={styles.item}>
                <div className={styles.k}>{t('battery')}</div>
                <div className={styles.v}>{d.battery ?? '-'}%</div>
              </div>
              <div className={styles.item}>
                <div className={styles.k}>{t('sos')}</div>
                <div className={`${styles.v} ${sosClass(d.sos)}`}>[SOS={String(!!d.sos)}]</div>
              </div>
              <div className={`${styles.item} ${styles.span2}`}>
                <div className={styles.k}>{t('coord')}</div>
                <div className={`${styles.v} ${styles.code}`}>{coord}</div>
              </div>
              <div className={`${styles.item} ${styles.span2}`}>
                <div className={styles.k}>{t('time')}</div>
                <div className={styles.v}>{x.ts}</div>
              </div>
            </div>
          </aside>
        );
      })()}

      {/* Vector 容器 */}
      <div id="gmap" className={styles.map} />

      {/* Photo 3D 容器（切到 photo3d 才顯示） */}
      <div id="photo3d-host" ref={photoHostRef} className={styles.map} style={{ display: 'none' }} />
    </main>
  );
}

export default function Page() {
  // 外層包 I18nProvider，避免 JSX 出現在 .ts i18n 檔
  return (
    <I18nProvider>
      <MapInner />
    </I18nProvider>
  );
}
