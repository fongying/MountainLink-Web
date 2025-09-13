'use client';
import { useI18n, supportedLangs } from './i18n';
import styles from './AdminPage.module.css';

export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <label className={styles.langWrap} aria-label={t('lang')}>
      <span className={styles.langLabel}>{t('lang')}</span>
      <select
        className={styles.select}
        value={lang}
        onChange={(e) => setLang(e.target.value as any)}
      >
        {supportedLangs.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}
