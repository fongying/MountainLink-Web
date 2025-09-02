'use client';
export default function Home() {
  return (
    <main style={{padding:24,fontFamily:'system-ui'}}>
      <h1>MountainLink</h1>
      <p>前端就緒。請前往 <a href="/login">登入</a> 或 <a href="/map">地圖</a>。</p>
      <p><a href="/api/health" target="_blank" rel="noreferrer">/api/health</a> 測試後端。</p>
    </main>
  );
}
