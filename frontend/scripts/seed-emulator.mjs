// Seeds the local Firebase emulators with a demo admin, event, zones, staff and reports.
// Run `npm run emulators` first, then `npm run seed:emulator`. Emulator-only: refuses real projects.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  getDocs,
  getFirestore,
  Timestamp,
  writeBatch,
  doc,
} from 'firebase/firestore';

// Test-only login for the emulator. Never use these values on a real Firebase project.
const DEMO_ADMIN = {
  email: 'admin@dristhi.test',
  password: 'demo-admin-123',
  username: 'control',
  employeeId: 'EMP001',
};

const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-dristhi' });
const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8081);

async function signInAdmin() {
  try {
    await createUserWithEmailAndPassword(auth, DEMO_ADMIN.email, DEMO_ADMIN.password);
    console.log('Created admin user', DEMO_ADMIN.email);
  } catch (e) {
    if (e.code !== 'auth/email-already-in-use') throw e;
    await signInWithEmailAndPassword(auth, DEMO_ADMIN.email, DEMO_ADMIN.password);
  }
}

async function main() {
  await signInAdmin();

  const existing = await getDocs(collection(db, 'events'));
  if (!existing.empty) {
    console.log('Events already exist; nothing to seed.');
    process.exit(0);
  }

  await addDoc(collection(db, 'admin'), {
    email: DEMO_ADMIN.email,
    username: DEMO_ADMIN.username,
    employee_id: DEMO_ADMIN.employeeId,
  });

  const eventRef = await addDoc(collection(db, 'events'), {
    name: 'Demo Fest 2026',
    venue: 'Phoenix Marketcity',
    city: 'Bengaluru',
    startsAt: '2026-11-21T16:00',
    endsAt: '2026-11-21T23:00',
    status: 'live',
    warningPct: 70,
    criticalPct: 90,
    peoplePerGuard: 60,
    createdBy: auth.currentUser.uid,
    createdAt: Timestamp.now(),
  });
  const eventId = eventRef.id;

  const feeds = JSON.parse(readFileSync(new URL('../../backend/feeds.json', import.meta.url), 'utf8'));
  const zoneIds = {};
  const batch = writeBatch(db);
  for (const [feedId, feed] of Object.entries(feeds)) {
    const ref = doc(collection(db, 'zones'));
    zoneIds[feed.name] = ref.id;
    batch.set(ref, {
      eventId,
      name: feed.name,
      capacity: feed.max_capacity,
      minGuards: 1,
      feedId,
      createdAt: Timestamp.now(),
    });
  }

  // Uneven on purpose so the Command page has moves to suggest.
  const guardsPerZone = { 'Main Entrance': 1, 'Mall Stage': 3, 'Red Street Road': 4, 'Exit Gate': 1, Subway: 3, Market: 2, 'Cross Road': 4, Lobby: 1 };
  const firstNames = ['Ravi', 'Arjun', 'Meena', 'Suresh', 'Kavya', 'Imran', 'Deepa', 'Vikram', 'Lakshmi', 'Naveen', 'Pooja', 'Rahul', 'Sana', 'Manoj', 'Asha', 'Kiran', 'Farah', 'Gopal', 'Nisha'];
  let n = 0;
  for (const [zone, count] of Object.entries(guardsPerZone)) {
    for (let i = 0; i < count; i++) {
      batch.set(doc(collection(db, 'staff')), {
        eventId,
        name: `${firstNames[n % firstNames.length]} (G${String(n + 1).padStart(2, '0')})`,
        phone: `+9198450${String(10000 + n).slice(-5)}`,
        kind: 'guard',
        status: 'available',
        zoneId: zoneIds[zone] ?? null,
        createdAt: Timestamp.now(),
      });
      n++;
    }
  }
  const medical = [
    ['Dr. Anita Rao', 'doctor', 'Mall Stage'],
    ['Joseph Thomas', 'medic', 'Main Entrance'],
    ['Priya Nair', 'medic', 'Market'],
    ['KA-01-AM-4821', 'ambulance', 'Exit Gate'],
  ];
  for (const [name, kind, zone] of medical) {
    batch.set(doc(collection(db, 'staff')), {
      eventId, name, phone: '', kind, status: 'available', zoneId: zoneIds[zone], createdAt: Timestamp.now(),
    });
  }
  await batch.commit();

  const ago = (min) => Timestamp.fromMillis(Date.now() - min * 60000);
  const reports = [
    { type: 'Medical Attention', details: 'Elderly man fainted near the stage barrier.', location: 'Mall Stage, left side', submittedAt: ago(1) },
    { type: 'Missing Person', details: 'Lost a 7-year-old boy in a red T-shirt.', personName: 'Aarav', lastSeen: 'Market food court', submittedAt: ago(7) },
    { type: 'General Grievance', details: 'Washroom near Lobby is flooded.', location: 'Lobby', submittedAt: ago(25) },
  ];
  for (const r of reports) {
    await addDoc(collection(db, 'grievances'), {
      ...r, status: 'new', submittedBy: 'attendee@dristhi.test', email: 'attendee@dristhi.test',
    });
  }

  console.log(`Seeded event ${eventId}: ${Object.keys(zoneIds).length} zones, ${n + medical.length} staff, ${reports.length} reports.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
