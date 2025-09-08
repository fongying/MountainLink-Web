'use client';
import { useEffect, useState } from 'react';
import styles from './AdminPage.module.css'; // 引入 CSS 模組

type Row = {
  device_id: string;
  hr: number | null;
  battery: number | null;
  last_ts: string | null;
  lat: number | null;
  lon: number | null;
  alt: number | null;
};

export default function DevicesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');

  async function load() {
    const r = await fetch('/api/devices', { cache: 'no-store', credentials: 'include' });
    if (!r.ok) { alert('/api/devices 失敗'); return; }
    const data: Row[] = await r.json();
    setRows(data);
  }
  useEffect(() => { load(); }, []);

  const filtered = rows.filter(r => !q || r.device_id.toLowerCase().includes(q.toLowerCase()));

  return (
    <main className={styles.main}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>裝置清單</h2>

        <div className={styles.header}>
          <input className={styles.input} placeholder="搜尋裝置 ID…" value={q} onChange={e=>setQ(e.target.value)} />
          <button className={`${styles.button} ${styles.primaryButton}`} onClick={load}>重整</button>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th><th>HR</th><th>電量</th><th>最後時間</th><th>Lat</th><th>Lon</th><th>Alt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r=>(
                <tr key={r.device_id}>
                  <td>{r.device_id}</td>
                  <td>{r.hr ?? '-'}</td>
                  <td>{r.battery ?? '-'}</td>
                  <td>{r.last_ts ?? '-'}</td>
                  <td>{r.lat ?? '-'}</td>
                  <td>{r.lon ?? '-'}</td>
                  <td>{r.alt ?? '-'}</td>
                </tr>
              ))}
              {filtered.length===0 && (
                <tr><td colSpan={7} className={styles.centerText}>（尚無資料）</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
