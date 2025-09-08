'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Lang = 'zh' | 'en';

type Dict = Record<string, string>;
const DICTS: Record<Lang, Dict> = {
  zh: {
    layer: '圖層',
    roadmap: '道路',
    terrain: '地形',
    satellite: '衛星',
    hybrid: '混合',
    buildings3d: '3D建築（向量）',
    photo3d: '3D寫實（預覽）',
    resetView: '重置視角',
    device: '裝置',
    refresh: '重整清單',
    follow: '追隨',
    redrawTrail: '重畫軌跡',
    coord: '座標',
    time: '時間',
    battery: '電量',
    hr: 'HR',
    sos: 'SOS',
    copyCoord: '複製座標',
    close: '關閉',
    language: '語言',
    sosTag: 'SOS',
    sosTrue: '是',
    sosFalse: '否',
  },
  en: {
    layer: 'Layer',
    roadmap: 'Roadmap',
    terrain: 'Terrain',
    satellite: 'Satellite',
    hybrid: 'Hybrid',
    buildings3d: '3D Buildings (Vector)',
    photo3d: 'Photorealistic 3D (Preview)',
    resetView: 'Reset View',
    device: 'Device',
    refresh: 'Refresh',
    follow: 'Follow',
    redrawTrail: 'Redraw Trail',
    coord: 'Coordinate',
    time: 'Time',
    battery: 'Battery',
    hr: 'HR',
    sos: 'SOS',
    copyCoord: 'Copy coords',
    close: 'Close',
    language: 'Language',
    sosTag: 'SOS',
    sosTrue: 'True',
    sosFalse: 'False',
  },
};

function makeT(lang: Lang) {
  return (k: string) => DICTS[lang]?.[k] ?? k;
}

// 也提供給非 React 檔案使用
export function translate(lang: Lang, key: string) {
  return (DICTS[lang]?.[key] ?? key);
}

type CtxValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: string) => string;
};

const Ctx = createContext<CtxValue | null>(null);

export function I18nProvider(props: { children: any }) {
  const [lang, setLang] = useState<Lang>('zh');
  const t = useMemo(() => makeT(lang), [lang]);

  // 同步到瀏覽器全域，給 map3d.ts 取用
  useEffect(() => {
    try {
      (window as any).__mlinkLang = lang;
      (window as any).__mlinkTranslate = (key: string) => makeT((window as any).__mlinkLang ?? 'zh')(key);
    } catch {}
  }, [lang]);

  const value: CtxValue = useMemo(() => ({ lang, setLang, t }), [lang, t]);

  // 用 React.createElement 避免在 .ts 檔使用 JSX
  // eslint-disable-next-line react/no-children-prop
  return (require('react') as any).createElement(Ctx.Provider, { value }, props.children);
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>');
  return ctx;
}
