import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Operations Control',
  description: 'Operations Control',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
