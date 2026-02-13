import './globals.css';
import Link from 'next/link';
import type { ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top-nav-wrap">
          <nav className="top-nav">
            <Link href="/">Create Job</Link>
            <Link href="/jobs">All Lists</Link>
            <Link href="/usage">Usage Data</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
