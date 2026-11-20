// Creates the demo admin's sign-in account in the local Firebase Auth emulator.
// Run `npm run emulators` first, then `npm run seed:emulator`. Emulator-only: refuses real projects.
//
// Firebase only signs people in. The admin row itself (username, employee ID, role) lives in
// Cloud SQL; create it with:
//   cd backend && python scripts/create_admin.py --email admin@dristhi.test --username control --employee-id EMP001
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';

// Test-only login for the emulator. Never use these values on a real Firebase project.
const DEMO_ADMIN = {
  email: 'admin@dristhi.test',
  password: 'demo-admin-123',
  username: 'control',
  employeeId: 'EMP001',
};

const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-dristhi' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

try {
  await createUserWithEmailAndPassword(auth, DEMO_ADMIN.email, DEMO_ADMIN.password);
  console.log('Created sign-in account', DEMO_ADMIN.email);
} catch (e) {
  if (e.code !== 'auth/email-already-in-use') throw e;
  console.log('Sign-in account already exists:', DEMO_ADMIN.email);
}

process.exit(0);
