'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, ArrowLeft, BellRing, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { getAuthErrorMessage } from '@/lib/auth-service';
function GoogleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.01z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.2c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: authLoading, loginEmail, loginGoogle } = useAuth();

  // Operators only. Attendees never sign in: they scan the event QR (/join).
  const role = 'admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.push(user.role === 'admin' ? '/dashboard' : '/user/dashboard');
    }
  }, [user, authLoading, router]);

  if (authLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ds-ground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const adminCredentials = { username, employeeId };

  const redirectAfterLogin = (userRole) => {
    router.push(userRole === 'admin' ? '/dashboard' : '/user/dashboard');
  };

  const handleAuthError = (error) => {
    const code =
      error instanceof Error && 'code' in error
        ? String(error.code)
        : error instanceof Error
          ? error.message
          : 'unknown';
    toast({
      title: 'Authentication failed',
      description: getAuthErrorMessage(code),
      variant: 'destructive',
    });
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const profile = await loginEmail(email, password, role, adminCredentials);
      toast({
        title: 'Welcome back',
        description: `Signed in as ${profile.fullName}`,
      });
      redirectAfterLogin(profile.role);
    } catch (error) {
      handleAuthError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!username || !employeeId) {
      toast({
        title: 'Admin details required',
        description: 'Enter your username and employee ID before signing in with Google.',
        variant: 'destructive',
      });
      return;
    }

    setGoogleLoading(true);
    try {
      const profile = await loginGoogle(role, adminCredentials);
      toast({
        title: 'Welcome back',
        description: `Signed in as ${profile.fullName}`,
      });
      redirectAfterLogin(profile.role);
    } catch (error) {
      handleAuthError(error);
    } finally {
      setGoogleLoading(false);
    }
  };

  const isBusy = loading || googleLoading;

  return (
    <main className="flex min-h-screen bg-ds-ground text-ds-ink">
      {/* Left column: brand and what the console does. Plain surface, no imagery or motion. */}
      <aside className="hidden w-[42%] max-w-xl flex-col justify-between border-r border-ds-border bg-ds-surface p-12 lg:flex">
        <Brand />

        <div className="max-w-sm space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ds-accent-ink">
              Operator console
            </p>
            <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight">
              Crowd safety for live events
            </h1>
            <p className="text-sm leading-relaxed text-ds-muted">
              Monitor zone density, respond to alerts and coordinate staff from one control room.
            </p>
          </div>

          <ul className="divide-y divide-ds-divider border-y border-ds-divider">
            {[
              { icon: Activity, text: 'Live crowd density by zone' },
              { icon: BellRing, text: 'Alerts with dispatch for guards and medical' },
              { icon: Lock, text: 'Role-based access per event' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 py-3.5 text-sm text-ds-ink-2">
                <Icon className="h-4 w-4 shrink-0 text-ds-accent" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-ds-muted">© {new Date().getFullYear()} Dristhi AI</p>
      </aside>

      {/* Login form */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-10">
        <div className="mb-8 lg:hidden">
          <Brand />
        </div>

        <div className="w-full max-w-sm space-y-6">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1.5 text-sm text-ds-muted">
              Control room staff only. Use the account your event owner set up for you.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-11 w-full gap-3 bg-ds-surface font-medium"
            onClick={handleGoogleLogin}
            disabled={isBusy}
          >
            {googleLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <GoogleIcon className="h-5 w-5" />
            )}
            Continue with Google
          </Button>

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-ds-ground px-3 text-xs text-ds-muted">
              or sign in with email
            </span>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={isBusy}
                  className="h-11 bg-ds-surface"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employeeId">Employee ID</Label>
                <Input
                  id="employeeId"
                  placeholder="DRISHTI-001"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  required
                  disabled={isBusy}
                  className="h-11 bg-ds-surface"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isBusy}
                className="h-11 bg-ds-surface"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isBusy}
                  className="h-11 bg-ds-surface pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-muted transition-colors hover:text-ds-ink"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="h-11 w-full text-sm font-semibold" disabled={isBusy}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          <div className="space-y-3 border-t border-ds-divider pt-5">
            <p className="text-sm text-ds-muted">
              Attending an event? You don’t sign in here. Scan the QR code on the event posters with your
              phone camera.
            </p>
            <Link
              href="/"
              className="inline-flex items-center text-sm font-medium text-ds-accent-ink hover:underline"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Same mark as the operator sidebar (components/admin/admin-shell.jsx). */
function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-ds-accent">
        <Eye className="h-[18px] w-[18px] text-ds-on-accent" strokeWidth={2} aria-hidden />
      </span>
      <span className="font-display text-xl font-semibold text-ds-ink">Dristhi</span>
    </span>
  );
}
