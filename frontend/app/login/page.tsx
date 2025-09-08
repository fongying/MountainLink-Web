'use client';
import { useState, FormEvent } from 'react';
import styles from './Login.module.css'; // 引入 CSS 模組

export default function LoginPage() {
  const [email, setEmail] = useState('admin@mountain.link');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // 一定要帶 cookie
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        window.location.href = '/map'; // 成功導到地圖
      } else {
        setErr('帳號或密碼錯誤');
      }
    } catch (error) {
      console.error('Login failed:', error);
      setErr('登入時發生網路錯誤');
    }
  };

  return (
    <main className={styles.main}>
      <div className={styles.formContainer}>
        <h2 className={styles.title}>MountainLink</h2>
        <form onSubmit={submit}>
          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={styles.input}
              placeholder="請輸入您的 Email"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.label}>
              密碼
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={styles.input}
              placeholder="請輸入您的密碼"
            />
          </div>

          {err && <div className={styles.error}>⚠ {err}</div>}

          <button type="submit" className={styles.button}>
            登入
          </button>
        </form>
      </div>
    </main>
  );
}