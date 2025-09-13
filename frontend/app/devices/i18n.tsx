'use client';
import React, { createContext, useContext, useMemo, useState } from 'react';

export type Lang = 'zh' | 'en';

type Dict = Record<string, string>;

const dicts: Record<Lang, Dict> = {
  zh: {
    devices: '裝置清單',
    search_placeholder: '搜尋裝置 ID、暱稱…',
    refresh: '重整',
    status: '狀態',
    device: '裝置',
    sos: 'SOS',
    hr: 'HR',
    battery: '電量',
    coords: '座標',
    last_ts: '最後時間',
    role_fw: '角色 / 固件',
    signal: '訊號',
    actions: '操作',
    online: 'ONLINE',
    offline: 'OFFLINE',
    lat: 'Lat',
    lon: 'Lon',
    alt: 'Alt',
    delete: '刪除',
    confirm_delete: '確認刪除？',
    deleting: '刪除中…',
    empty: '（尚無資料）',
    copy_coord: '複製座標',
    open_map: '在地圖開啟',
    lang: '語言',
  },
  en: {
    devices: 'Devices',
    search_placeholder: 'Search device ID, nickname…',
    refresh: 'Refresh',
    status: 'Status',
    device: 'Device',
    sos: 'SOS',
    hr: 'HR',
    battery: 'Battery',
    coords: 'Coords',
    last_ts: 'Last Seen',
    role_fw: 'Role / FW',
    signal: 'Signal',
    actions: 'Actions',
    online: 'ONLINE',
    offline: 'OFFLINE',
    lat: 'Lat',
    lon: 'Lon',
    alt: 'Alt',
    delete: 'Delete',
    confirm_delete: 'Confirm?',
    deleting: 'Deleting…',
    empty: '(No data)',
    copy_coord: 'Copy coords',
    open_map: 'Open on map',
    lang: 'Language',
  },
};

type I18nCtx = {
  lang: Lang;
  t: (key: string) => string;
  setLang: (l: Lang) => void;
  dict: Dict;
};

const I18nContext = createContext<I18nCtx | null>(null);

// ✅ 加上明確的 props 型別
type I18nProviderProps = {
  children: React.ReactNode;
  defaultLang?: Lang;
};

export function I18nProvider({ children, defaultLang = 'zh' as Lang }: I18nProviderProps) {
  const [lang, setLang] = useState<Lang>(defaultLang);
  const dict = useMemo(() => dicts[lang], [lang]);
  const t = (key: string) => dict[key] ?? key;
  const value = useMemo(() => ({ lang, setLang, dict, t }), [lang, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

export const supportedLangs: Array<{ value: Lang; label: string }> = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
];