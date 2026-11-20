'use client';

import { usePathname } from 'next/navigation';
import { ThemeProvider } from '@/components/theme-provider';

/**
 * Operator screens keep the dark default and the theme toggle. The attendee app (/join, /user/*)
 * is always light, as in the design mockups: it is used outdoors on phones, often in daylight.
 */
export function AppThemeProvider({ children }) {
  const path = usePathname() ?? '';
  const attendee = path.startsWith('/user') || path.startsWith('/join');
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      forcedTheme={attendee ? 'light' : undefined}
    >
      {children}
    </ThemeProvider>
  );
}
