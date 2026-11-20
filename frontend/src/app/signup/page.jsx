import Link from 'next/link';

/**
 * Attendee email sign-up was removed in task 07a: attendees join anonymously from the event QR,
 * and operator accounts are created by the event owner (`npm run create-admin`).
 */
export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 text-center">
        <h1 className="text-2xl font-bold">Sign-up is closed</h1>
        <p className="text-sm text-muted-foreground">
          Attending an event? You don’t need an account. Scan the QR code on the event posters with your phone
          camera.
        </p>
        <p className="text-sm text-muted-foreground">Operator accounts are created by your event owner.</p>
        <Link href="/login" className="inline-block font-medium text-primary hover:underline">
          Operator sign in
        </Link>
      </div>
    </main>
  );
}
