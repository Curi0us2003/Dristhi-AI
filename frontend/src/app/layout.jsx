import { Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { AppThemeProvider } from '@/components/app-theme-provider';
import { AuthProvider } from '@/contexts/auth-context';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-display' });

export const metadata = {
  title: 'Drishti AI: Event Guardian',
  description: 'AI-powered situational awareness platform for proactive crowd safety management.',
};

// viewport-fit=cover lets the attendee tab bar pad itself with env(safe-area-inset-bottom).
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${display.variable} font-sans`}>
        <AppThemeProvider>
          <AuthProvider>{children}</AuthProvider>
          <Toaster />
        </AppThemeProvider>
      </body>
    </html>
  );
}
