import Link from 'next/link';
import styles from './Home.module.css'; // 引入 CSS 模組

export default function HomePage() {
  return (
    <div className={styles.container}>
      {/* MountainLink 品牌名稱 */}
      <h1 className={styles.brandName}>MountainLink</h1>

      {/* 導航連結 */}
      <nav className={styles.navigation}>
        <Link href="/devices/admin" className={styles.navButton}>
          裝置管理
        </Link>
        <Link href="/map" className={styles.navButton}>
          地圖
        </Link>
        {/* 如果有其他連結，可以在這裡新增 */}
      </nav>

      {/* 版權資訊 */}
      <footer className={styles.footer}>
        © {new Date().getFullYear()} MountainLink. All rights reserved.
      </footer>
    </div>
  );
}