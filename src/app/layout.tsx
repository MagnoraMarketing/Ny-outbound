import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Ny-outbound',
  description:
    'Outbound salgsplatform med CRM, power dialer, opkaldsoptagelse og AI-analyse.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
