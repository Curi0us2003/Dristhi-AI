/**
 * Admin app data (hackathon build): events, zones, staff and dispatches in Firestore.
 * Every document except events carries `eventId`. See docs/admin-app.md, "Hackathon build".
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

/**
 * Document shapes (Firestore). `id` is the document id.
 *
 * @typedef {'draft' | 'live' | 'ended'} EventStatus
 * @typedef {'guard' | 'supervisor' | 'medic' | 'doctor' | 'ambulance' | 'volunteer'} StaffKind
 * @typedef {'available' | 'dispatched' | 'on_scene' | 'off_duty'} StaffStatus
 *
 * @typedef {object} EventDoc  collection `events`
 * @property {string} id
 * @property {string} name
 * @property {string} venue
 * @property {string} city
 * @property {string} startsAt      datetime-local string, e.g. 2026-11-21T18:00
 * @property {string} endsAt
 * @property {EventStatus} status
 * @property {number} warningPct    zone density % that shows Warning
 * @property {number} criticalPct   zone density % that shows Critical
 * @property {number} peoplePerGuard
 *
 * @typedef {object} ZoneDoc  collection `zones`
 * @property {string} id
 * @property {string} eventId
 * @property {string} name
 * @property {number} capacity
 * @property {number} minGuards
 * @property {string | null} feedId  backend camera id (feeds.json key, e.g. feed_1)
 *
 * @typedef {object} StaffDoc  collection `staff`
 * @property {string} id
 * @property {string} eventId
 * @property {string} name
 * @property {string} phone
 * @property {StaffKind} kind
 * @property {StaffStatus} status
 * @property {string | null} zoneId
 *
 * @typedef {object} DispatchDoc  collection `dispatches`
 * @property {string} id
 * @property {string} eventId
 * @property {string} staffId
 * @property {string} staffName
 * @property {string | null} fromZoneName
 * @property {string | null} toZoneName
 * @property {string | null} grievanceId  Firestore grievance id when sent to a report
 * @property {string} reason
 * @property {{ seconds: number } | null} createdAt
 *
 * @typedef {{ staff: StaffDoc, fromZone: ZoneDoc | null, toZone: ZoneDoc }} StaffMove
 */

export const STAFF_KINDS = ['guard', 'supervisor', 'medic', 'doctor', 'ambulance', 'volunteer'];
export const STAFF_STATUSES = ['available', 'dispatched', 'on_scene', 'off_duty'];

export const STAFF_KIND_LABEL = {
  guard: 'Guard',
  supervisor: 'Supervisor',
  medic: 'Medic',
  doctor: 'Doctor',
  ambulance: 'Ambulance',
  volunteer: 'Volunteer',
};

export const STAFF_STATUS_LABEL = {
  available: 'Available',
  dispatched: 'On the way',
  on_scene: 'On scene',
  off_duty: 'Off duty',
};

export const DEFAULT_EVENT = {
  name: '',
  venue: '',
  city: '',
  startsAt: '',
  endsAt: '',
  status: 'draft',
  warningPct: 70,
  criticalPct: 90,
  peoplePerGuard: 100,
};

function byName(a, b) {
  return a.name.localeCompare(b.name);
}

// ── Subscriptions ────────────────────────────────────────────────

export function watchEvents(cb, onError) {
  return onSnapshot(
    collection(db, 'events'),
    (snap) => cb(snap.docs.map((d) => ({ ...DEFAULT_EVENT, ...d.data(), id: d.id })).sort(byName)),
    onError,
  );
}

export function watchZones(eventId, cb) {
  return onSnapshot(query(collection(db, 'zones'), where('eventId', '==', eventId)), (snap) =>
    cb(snap.docs.map((d) => ({ minGuards: 1, feedId: null, ...d.data(), id: d.id })).sort(byName)),
  );
}

export function watchStaff(eventId, cb) {
  return onSnapshot(query(collection(db, 'staff'), where('eventId', '==', eventId)), (snap) =>
    cb(
      snap.docs
        .map((d) => ({ phone: '', status: 'available', zoneId: null, ...d.data(), id: d.id }))
        .sort(byName),
    ),
  );
}

export function watchDispatches(eventId, cb) {
  return onSnapshot(query(collection(db, 'dispatches'), where('eventId', '==', eventId)), (snap) =>
    cb(
      snap.docs
        .map((d) => ({ ...d.data(), id: d.id }))
        .sort((a, b) => (b.createdAt?.seconds ?? Infinity) - (a.createdAt?.seconds ?? Infinity))
        .slice(0, 20),
    ),
  );
}

// ── Events ───────────────────────────────────────────────────────

export async function createEvent(input) {
  const ref = await addDoc(collection(db, 'events'), {
    ...input,
    createdBy: auth.currentUser?.uid ?? null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function updateEvent(id, input) {
  return updateDoc(doc(db, 'events', id), input);
}

// ── Zones ────────────────────────────────────────────────────────

export function createZone(input) {
  return addDoc(collection(db, 'zones'), { ...input, createdAt: serverTimestamp() });
}

export function updateZone(id, input) {
  return updateDoc(doc(db, 'zones', id), input);
}

/** Deletes a zone and unassigns the staff who were in it. */
export async function deleteZone(zone) {
  const staffInZone = await getDocs(
    query(collection(db, 'staff'), where('eventId', '==', zone.eventId), where('zoneId', '==', zone.id)),
  );
  const batch = writeBatch(db);
  staffInZone.docs.forEach((d) => batch.update(d.ref, { zoneId: null }));
  batch.delete(doc(db, 'zones', zone.id));
  await batch.commit();
}

// ── Staff ────────────────────────────────────────────────────────

export function createStaff(input) {
  return addDoc(collection(db, 'staff'), { ...input, createdAt: serverTimestamp() });
}

export async function createStaffMany(inputs) {
  // Firestore batches hold up to 500 writes.
  for (let i = 0; i < inputs.length; i += 450) {
    const batch = writeBatch(db);
    for (const input of inputs.slice(i, i + 450)) {
      batch.set(doc(collection(db, 'staff')), { ...input, createdAt: serverTimestamp() });
    }
    await batch.commit();
  }
}

export function updateStaff(id, input) {
  return updateDoc(doc(db, 'staff', id), input);
}

export function deleteStaff(id) {
  return deleteDoc(doc(db, 'staff', id));
}

/** Moves staff between zones in one batch and logs each move as a dispatch. */
export async function approveMoves(eventId, moves, reason) {
  const batch = writeBatch(db);
  for (const move of moves) {
    batch.update(doc(db, 'staff', move.staff.id), { zoneId: move.toZone.id, status: 'dispatched' });
    batch.set(doc(collection(db, 'dispatches')), {
      eventId,
      staffId: move.staff.id,
      staffName: move.staff.name,
      fromZoneId: move.fromZone?.id ?? null,
      fromZoneName: move.fromZone?.name ?? null,
      toZoneId: move.toZone.id,
      toZoneName: move.toZone.name,
      grievanceId: null,
      reason,
      createdBy: auth.currentUser?.uid ?? null,
      createdAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/** Sends a staff member to a grievance: marks the grievance assigned, the staff on scene, logs it. */
export async function assignStaffToGrievance(eventId, staff, grievanceId, reason) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'grievances', grievanceId), {
    assignedStaffId: staff.id,
    assignedStaffName: staff.name,
    assignedStaffKind: staff.kind,
    assignedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'staff', staff.id), { status: 'on_scene' });
  batch.set(doc(collection(db, 'dispatches')), {
    eventId,
    staffId: staff.id,
    staffName: staff.name,
    fromZoneId: staff.zoneId,
    fromZoneName: null,
    toZoneId: null,
    toZoneName: null,
    grievanceId,
    reason,
    createdBy: auth.currentUser?.uid ?? null,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export function densityStatus(pct, event) {
  if (pct === null) return 'No data';
  if (pct >= event.criticalPct) return 'Critical';
  if (pct >= event.warningPct) return 'Warning';
  return 'Normal';
}

// ── Roster views for older screens ───────────────────────────────

export const GUARD_KINDS = ['guard', 'supervisor'];
export const MEDICAL_KINDS = ['medic', 'doctor'];

/**
 * The Dashboard summary and the autonomous agent were written for the old `guards`,
 * `ambulances` and `medical_staff` collections. This builds the same shapes from the event's
 * staff roster so those screens read one source of truth. `id` is always the staff doc id.
 *
 * @param {StaffDoc[]} staff
 * @param {ZoneDoc[]} zones
 */
export function rosterViews(staff, zones) {
  const zoneName = (id) => zones.find((z) => z.id === id)?.name ?? null;
  const onDuty = staff.filter((s) => s.status !== 'off_duty');

  const guards = onDuty
    .filter((s) => GUARD_KINDS.includes(s.kind))
    .map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      sector: zoneName(s.zoneId) ?? 'Standby Pool',
      // Old vocabulary: Active = posted in a zone, Standby = free to move, Alert = busy at an incident.
      status: s.status === 'on_scene' ? 'Alert' : s.status === 'available' && !s.zoneId ? 'Standby' : 'Active',
    }));

  const ambulances = staff
    .filter((s) => s.kind === 'ambulance')
    .map((s) => ({
      id: s.id,
      ambulanceNumber: s.name,
      zone: zoneName(s.zoneId) ?? 'Unassigned',
      isAvailable: s.status === 'available',
    }));

  const medicalStaff = staff
    .filter((s) => MEDICAL_KINDS.includes(s.kind))
    .map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status === 'available' ? 'available' : s.status === 'off_duty' ? 'off-duty' : 'on-duty',
      specialization: STAFF_KIND_LABEL[s.kind],
    }));

  return { guards, ambulances, medicalStaff };
}
