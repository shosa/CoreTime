import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CoreTime',
  description: 'Sistema gestione presenze e paghe',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
