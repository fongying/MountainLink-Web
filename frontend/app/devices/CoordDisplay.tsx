'use client';
import { useState, useEffect } from 'react'; // 1. 引入 useEffect
import { useI18n } from './i18n';
import styles from './AdminPage.module.css';

type CoordDisplayProps = {
  lat?: number | null;
  lon?: number | null;
  alt?: number | null;
};

export default function CoordDisplay({ lat, lon, alt }: CoordDisplayProps) {
  const { t } = useI18n();
  
  // --- 修改開始 (第 16 行 到 36 行) ---
  // 將狀態從儲存「文字」改為儲存「狀態」，'idle' | 'copied' | 'failed'
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  // 當語言變更時 (t 函數的實例會變)，重設按鈕狀態
  useEffect(() => {
    setCopyStatus('idle');
  }, [t]);

  const handleCopy = () => {
    const coordString = `${lat}, ${lon}`;
    navigator.clipboard.writeText(coordString).then(() => {
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }).catch(() => {
      setCopyStatus('failed');
      setTimeout(() => setCopyStatus('idle'), 2000);
    });
  };
  // --- 修改結束 ---

  if (lat == null || lon == null) {
    return <span>-</span>;
  }

  const openInMap = () => {
    window.open(`https://www.google.com/maps?q=${lat},${lon}`, '_blank');
  };

  // --- 修改開始 (第 50 行 到 63 行) ---
  // 根據目前的 copyStatus 決定要顯示什麼文字
  const getButtonText = () => {
    switch (copyStatus) {
      case 'copied':
        return 'Copied!'; // 這裡可以使用 t('copied') 如果你有新增翻譯
      case 'failed':
        return 'Failed!'; // 同上
      default:
        return t('copy_coord'); // 預設情況下，永遠使用最新的翻譯
    }
  };

  return (
    <div className={styles.coordCell}>
      <div className={styles.coordValues}>
        <span>{t('lat')}: {lat.toFixed(6)}</span>
        <span>{t('lon')}: {lon.toFixed(6)}</span>
        {alt != null ? <span>{t('alt')}: {alt}m</span> : null}
      </div>
      <div className={styles.coordActions}>
        <button className={styles.coordButton} onClick={handleCopy}>
          {getButtonText()}
        </button>
        <button className={styles.coordButton} onClick={openInMap}>
          {t('open_map')}
        </button>
      </div>
    </div>
  );
  // --- 修改結束 ---
}