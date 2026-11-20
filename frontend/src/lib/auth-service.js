import {
  browserLocalPersistence,
  GoogleAuthProvider,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { api, ApiError } from '@/lib/api';
import { cacheProfile, cacheToken, clearAuthCache } from '@/lib/auth-cache';
const googleProvider = new GoogleAuthProvider();

let persistenceReady = null;

function ensurePersistence() {
  if (!persistenceReady) {
    persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => undefined);
  }
  return persistenceReady;
}

export async function getIdToken(forceRefresh = false) {
  const user = auth.currentUser;
  if (!user) return null;
  const token = await user.getIdToken(forceRefresh);
  cacheToken(token);
  return token;
}

/** Backend admin row (Cloud SQL `admins`) → the profile the app keeps in session. */
function toProfile(admin, firebaseUser) {
  return {
    id: admin.id,
    email: admin.email,
    fullName: admin.username || firebaseUser.displayName || 'Admin',
    role: 'admin',
    adminRole: admin.role,
    username: admin.username,
    employeeId: admin.employee_id,
  };
}

/** Maps backend error codes to the codes getAuthErrorMessage knows. */
function authCode(error) {
  if (!(error instanceof ApiError)) return error;
  if (error.code === 'not_an_admin' || error.code === 'admin_not_found') return new Error('ADMIN_NOT_FOUND');
  if (error.code === 'network') return new Error('BACKEND_UNREACHABLE');
  return new Error(error.code);
}

async function verifyRole(firebaseUser, role, adminCredentials) {
  if (!firebaseUser.email) {
    throw new Error('NO_EMAIL');
  }

  // Attendees never sign in (task 07a): they join anonymously from the event QR.
  if (role !== 'admin') {
    throw new Error('OPERATORS_ONLY');
  }

  if (!adminCredentials?.username || !adminCredentials?.employeeId) {
    throw new Error('ADMIN_FIELDS_REQUIRED');
  }

  // The backend verifies the Firebase ID token and checks the admin in Cloud SQL.
  try {
    const admin = await api('/api/auth/admin-login', {
      method: 'POST',
      body: { username: adminCredentials.username.trim(), employee_id: adminCredentials.employeeId.trim() },
    });
    return toProfile(admin, firebaseUser);
  } catch (error) {
    throw authCode(error);
  }
}

async function finalizeLogin(firebaseUser, role, adminCredentials) {
  const profile = await verifyRole(firebaseUser, role, adminCredentials);
  const token = await firebaseUser.getIdToken();
  cacheToken(token);
  cacheProfile(profile);
  return profile;
}

export async function loginWithEmail(email, password, role, adminCredentials) {
  await ensurePersistence();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  try {
    return await finalizeLogin(credential.user, role, adminCredentials);
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

export async function loginWithGoogle(role, adminCredentials) {
  await ensurePersistence();
  const credential = await signInWithPopup(auth, googleProvider);
  try {
    return await finalizeLogin(credential.user, role, adminCredentials);
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

export async function resolveProfileFromFirebaseUser(firebaseUser) {
  const cached = getCachedProfileSafe();
  if (cached && cached.email === firebaseUser.email) {
    return cached;
  }
  if (!firebaseUser.email) return null;

  try {
    const profile = toProfile(await api('/api/auth/me'), firebaseUser);
    cacheProfile(profile);
    return profile;
  } catch {
    return null;
  }
}

function getCachedProfileSafe() {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem('drishti_auth_profile');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function logoutUser() {
  clearAuthCache();
  await signOut(auth);
}

export function getAuthErrorMessage(code) {
  const messages = {
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed before completing.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.',
    USER_NOT_FOUND: 'No user account found. Please sign up first.',
    ADMIN_NOT_FOUND: 'Invalid admin credentials. Check username and employee ID.',
    ADMIN_FIELDS_REQUIRED: 'Username and employee ID are required for admin login.',
    NO_EMAIL: 'Could not retrieve email from your account.',
    OPERATORS_ONLY: 'Only control room operators sign in here. Attendees scan the event QR code.',
    BACKEND_UNREACHABLE: 'Cannot reach the server. Check that the backend is running.',
    auth_not_configured: 'Sign-in is not configured on the server (FIREBASE_PROJECT_ID).',
    database_not_configured: 'The server has no database configured.',
  };
  return messages[code] || 'Authentication failed. Please try again.';
}
