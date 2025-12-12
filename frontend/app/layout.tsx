import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wing Gundam Zero System',
  description: 'Agentic OS Monitor',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased h-screen w-screen overflow-hidden relative m-0 p-0 bg-black">
        <div className="scanline" />
        <div className="crt-flicker h-full w-full">
          {children}
        </div>
      </body>
    </html>
  );
}
