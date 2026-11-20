'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { EventProvider } from '@/contexts/event-context';
import AdminShell from '@/components/admin/admin-shell';
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
      <div className="flex min-h-screen items-center justify-center bg-ds-ground">
        <Loader2 className="h-8 w-8 animate-spin text-ds-accent" />
      </div>
    );
  }

  return (
    <EventProvider>
      <AdminShell>{children}</AdminShell>
    </EventProvider>
  );
}
