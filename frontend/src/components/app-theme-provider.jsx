'use client';

import { usePathname } from 'next/navigation';
import { ThemeProvider } from '@/components/theme-provider';

/** Pages that keep their own dark look: the landing redirect and the signup screen. */
const DARK_PAGES = ['/', '/signup'];

/**
 * The attendee app (/join, /user/*) and the operator screens use the light design system from
 * docs/design (off-white ground, white cards, teal accent). The attendee app is used outdoors on
 * phones, and the operator screens match it so both read as one product. The operator login uses
 * it too; only the landing redirect and signup keep the dark default.
 */
export function AppThemeProvider({ children }) {
  const path = usePathname() ?? '';
  const dark = DARK_PAGES.includes(path.replace(/\/$/, '') || '/');
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      forcedTheme={dark ? undefined : 'light'}
    >
      {children}
    </ThemeProvider>
  );
}
