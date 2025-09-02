'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@mountain.link');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e: any) => {
    e.preventDefault();
    setErr('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',                 // 一定要帶 cookie
      body: JSON.stringify({ email, password })
    });
    if (res.ok) location.href = '/map';       // 成功導到地圖
    else setErr('帳號或密碼錯誤');
  };

  return (
    <main style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'system-ui'}}>
      <form onSubmit={submit} style={{padding:24,border:'1px solid #ddd',borderRadius:12,minWidth:320,background:'#fff'}}>
        <h2 style={{marginTop:0}}>登入 MountainLink</h2>
        <label style={{display:'block',marginTop:8}}>Email
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required style={{width:'100%'}}/>
        </label>
        <label style={{display:'block',marginTop:8}}>密碼
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required style={{width:'100%'}}/>
        </label>
        {err && <div style={{color:'#b00',marginTop:8}}>⚠ {err}</div>}
        <button type="submit" style={{marginTop:12,width:'100%'}}>登入</button>
      </form>
    </main>
  );
}
