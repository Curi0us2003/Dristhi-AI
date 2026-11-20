'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/header';
import MainNav from '@/components/main-nav';
import { useAuth } from '@/contexts/auth-context';
import { EventProvider } from '@/contexts/event-context';
import EventSwitcher from '@/components/admin/event-switcher';
import { Loader2 } from 'lucide-react';

export default function AppLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (user.role !== 'admin') {
        router.push('/user/dashboard');
      }
    }
  }, [user, loading, router]);

  if (loading || !user || user.role !== 'admin') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <EventProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <MainNav />
            <EventSwitcher />
          </div>
          <main>{children}</main>
        </div>
      </div>
    </EventProvider>
  );
}
