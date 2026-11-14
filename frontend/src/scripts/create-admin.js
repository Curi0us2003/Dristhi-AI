// Creates (or repairs) an Operator/Admin account:
//   1. a Firebase Auth email/password user
//   2. a matching document in the Firestore "admin" collection
//
// Usage:
//   npm run create-admin -- --email ops@example.com --password "S3cret!" --username ops --employee-id D001
//
// The login page checks email + password (Firebase Auth) and then
// username + employee ID against the "admin" collection.
require('dotenv').config({ path: './.env' });
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc } = require('firebase/firestore');
const { getAuth, createUserWithEmailAndPassword } = require('firebase/auth');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) out[key.slice(2)] = argv[i + 1], i++;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const email = args.email;
const password = args.password;
const username = args.username;
const employeeId = args['employee-id'];

if (!email || !password || !username || !employeeId) {
  console.error(
    'Usage: npm run create-admin -- --email <email> --password <password> --username <username> --employee-id <id>'
  );
  process.exit(1);
}
if (password.length < 6) {
  console.error('Password must be at least 6 characters (Firebase Auth requirement).');
  process.exit(1);
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
  console.error('Firebase configuration is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function main() {
  console.log(`1. Creating Firebase Auth user ${email}...`);
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    console.log('   ✅ Auth user created.');
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      console.log('   ⚠️  Auth user already exists, keeping the existing password.');
    } else {
      throw error;
    }
  }

  console.log('2. Writing "admin" Firestore document...');
  const adminCollection = collection(db, 'admin');
  const existing = await getDocs(query(adminCollection, where('email', '==', email)));
  for (const d of existing.docs) await deleteDoc(d.ref);

  // The password is NOT stored in Firestore; Firebase Auth handles it.
  await addDoc(adminCollection, {
    username,
    email,
    employee_id: employeeId,
    createdAt: new Date(),
  });

  console.log('   ✅ Admin document saved.\n');
  console.log('Log in on the Operator tab with:');
  console.log(`   Email: ${email} | Username: ${username} | Employee ID: ${employeeId}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
