'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './AdminPage.module.css';
import { I18nProvider, useI18n } from './i18n';
import LanguageSwitcher from './LanguageSwitcher';
import CoordDisplay from './CoordDisplay'; // <--- 1. 引入新元件

// ... (DeviceRow type and constants remain the same)
type DeviceRow = {
  device_id: string;
  nickname?: string;
  role?: string;
  firmware?: string;
  tags?: string[];
  ts?: string | null;
  hr?: number | null;
  battery?: number | null;
  lat?: number | null;
  lon?: number | null;
  alt?: number | null;
  sos?: boolean | null;
  rssi?: number | null;
  snr?: number | null;
  online?: boolean;
};
const ONLINE_WINDOW_SEC = 90;
const HR_BAD_LOW = 60;
const HR_BAD_HIGH = 120;
const LOW_BATTERY = 20;


function DevicesInner() {
  const { t } = useI18n();
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [q, setQ] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);

  // ... (all functions like load, requestDelete, doDelete, isOnline, etc. remain the same)
  function clearConfirmTimer() {
    if (confirmTimerRef.current) {
      window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }

  async function load() {
    const r = await fetch('/api/devices', { cache: 'no-store', credentials: 'include' });
    if (!r.ok) { alert('/api/devices failed'); return; }
    const data: DeviceRow[] = await r.json();
    setRows(data);
  }
  useEffect(() => { load(); }, []);

  function requestDelete(id: string) {
    setConfirmId(id);
    clearConfirmTimer();
    confirmTimerRef.current = window.setTimeout(() => {
      setConfirmId(null);
      confirmTimerRef.current = null;
    }, 5000);
  }
  async function doDelete(id: string) {
    clearConfirmTimer();
    setDeletingId(id);
    try {
      const r = await fetch(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        alert(`Delete failed: ${r.status} ${r.statusText}\n${text}`);
        return;
      }
      setRows(prev => prev.filter(x => x.device_id !== id));
    } catch (e: any) {
      alert(e?.message || String(e));
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  function isOnline(ts?: string | null): boolean {
    if (!ts) return false;
    const t = new Date(ts).getTime();
    if (!isFinite(t)) return false;
    return (Date.now() - t) <= ONLINE_WINDOW_SEC * 1000;
  }

  function hrClass(hr?: number | null) {
    if (hr == null) return '';
    if (hr < HR_BAD_LOW || hr > HR_BAD_HIGH) return styles.bad;
    return styles.ok;
  }
  function batClass(b?: number | null) {
    if (b == null) return '';
    if (b <= LOW_BATTERY) return styles.warn;
    return '';
  }

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return rows;
    return rows.filter(r =>
      r.device_id.toLowerCase().includes(ql) ||
      (r.nickname ?? '').toLowerCase().includes(ql)
    );
  }, [rows, q]);


  return (
    <main className={styles.main}>
      <section className={styles.section}>
        <div className={styles.header}>
          <h2 className={styles.sectionTitle}>{t('devices')}</h2>
          <div className={styles.tools}>
            <input
              className={styles.input}
              placeholder={t('search_placeholder')}
              value={q}
              onChange={e => setQ(e.target.value)}
              aria-label={t('search_placeholder')}
            />
            <button
              className={`${styles.button} ${styles.primaryButton}`}
              onClick={() => { setConfirmId(null); load(); }}
            >
              {t('refresh')}
            </button>
            <LanguageSwitcher />
          </div>
        </div>

        <div
          className={styles.tableWrapper}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (!target.closest(`.${styles.dangerButton}`) &&
                !target.closest(`.${styles.dangerButtonConfirm}`)) {
              if (confirmId) { clearConfirmTimer(); setConfirmId(null); }
            }
          }}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('status')}</th>
                <th scope="col">{t('device')}</th>
                <th scope="col">{t('sos')}</th>
                <th scope="col">{t('hr')}</th>
                <th scope="col">{t('battery')}</th>
                <th scope="col">{t('coords')}</th>
                <th scope="col">{t('last_ts')}</th>
                <th scope="col">{t('role_fw')}</th>
                <th scope="col">{t('signal')}</th>
                <th scope="col" className={styles.rightText}>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const online = r.online ?? isOnline(r.ts);
                const isConfirm = confirmId === r.device_id;
                const isDeleting = deletingId === r.device_id;
                const sos = r.sos ?? false;

                return (
                  <tr key={r.device_id}>
                    <td>
                      <span
                        className={styles.statusDot}
                        style={{ backgroundColor: online ? '#16a34a' : '#9ca3af' }}
                        aria-hidden
                      />
                      <span className={styles.statusText}>
                        {online ? t('online') : t('offline')}
                      </span>
                    </td>
                    <td>
                      <div className={styles.deviceCell}>
                        <strong>{r.device_id}</strong>
                        {r.nickname && <span className={styles.nickname}>{r.nickname}</span>}
                      </div>
                    </td>
                    <td>
                       {/* --- 2. 使用新的 SOS 徽章樣式 --- */}
                       {sos ? <span className={styles.sos}>SOS</span> : <span className={styles.okStatus}>OK</span>}
                    </td>
                    <td className={hrClass(r.hr)}>{r.hr ?? '-'}</td>
                    <td className={batClass(r.battery)}>
                      {r.battery != null ? `${r.battery}%` : '-'}
                    </td>
                    <td>
                      {/* --- 3. 使用新的 CoordDisplay 元件 --- */}
                      <CoordDisplay lat={r.lat} lon={r.lon} alt={r.alt} />
                    </td>
                    <td>{r.ts?.replace('T', ' ') ?? '-'}</td>
                    <td>{r.role || '-'}{r.firmware ? ` / ${r.firmware}` : ''}</td>
                    <td>
                      {r.rssi != null || r.snr != null
                        ? <span title={`RSSI ${r.rssi ?? '-'} / SNR ${r.snr ?? '-'}`}>
                            {`R:${r.rssi ?? '-'} / S:${r.snr ?? '-'}`}
                          </span>
                        : '-'}
                    </td>
                    <td className={`${styles.actionsCell} ${styles.rightText}`}>
                      {!isConfirm ? (
                        <button
                          type="button"
                          className={`${styles.button} ${styles.dangerButton}`}
                          onClick={(e) => { e.stopPropagation(); requestDelete(r.device_id); }}
                          aria-label={`${t('delete')} ${r.device_id}`}
                          title={t('delete')}
                        >
                          {t('delete')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`${styles.button} ${styles.dangerButtonConfirm}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isDeleting) doDelete(r.device_id);
                          }}
                          disabled={isDeleting}
                          aria-label={`${t('confirm_delete')} ${r.device_id}`}
                          title={t('confirm_delete')}
                        >
                          {isDeleting ? t('deleting') : t('confirm_delete')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className={styles.centerText}>{t('empty')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default function DevicesPage() {
  return (
    <I18nProvider defaultLang="zh">
      <DevicesInner />
    </I18nProvider>
  );
}