import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from './components/app-shell';

export const metadata: Metadata = {
  title: 'Cindr | FinOps control plane',
  description: 'Catch the waste before it burns.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AppShell>{children}</AppShell></body></html>;
}
