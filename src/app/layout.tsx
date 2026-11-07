import type { Metadata, Viewport } from 'next';
import { archivo, hanken, plexMono } from './fonts';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: { default: 'Break Records', template: '%s · Break Records' },
  description: 'Your label, run by a team that never sleeps. You approve what matters.',
};

export const viewport: Viewport = {
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${archivo.variable} ${hanken.variable} ${plexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
