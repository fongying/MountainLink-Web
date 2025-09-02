import './globals.css';

export const metadata = {
  title: 'MountainLink',
  description: 'MountainLink MVP',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
