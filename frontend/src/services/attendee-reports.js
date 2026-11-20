/**
 * Reports an attendee sends from the assistant or the Help page. Nothing is written until the
 * attendee taps Send on a draft. Firestore stays the store until task 08 moves this to the backend.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createGrievance } from '@/services/grievance-service';

function position(coords) {
  return coords ? { lat: coords.lat, lng: coords.lng, accuracy_m: coords.accuracy_m } : undefined;
}

async function notify(reporter, message) {
  await addDoc(collection(db, 'notifications'), {
    attendeeId: reporter.attendeeId,
    message,
    createdAt: serverTimestamp(),
    read: false,
  });
}

export async function sendMedicalReport(reporter, d, coords) {
  const res = await createGrievance({
    type: 'Medical Attention',
    submittedBy: reporter.displayName,
    attendeeId: reporter.attendeeId,
    eventSlug: reporter.eventSlug,
    details: d.details.trim(),
    location: d.where.trim() || (coords ? 'Shared location' : undefined),
    urgency: d.urgency,
    coords: position(coords),
  });
  await notify(reporter, 'Your medical request reached the control room. Stay where you are if you can.');
  return res;
}

export async function sendMissingPersonReport(reporter, d, coords) {
  const lastSeen = [d.lastSeenPlace.trim(), d.lastSeenTime && `at ${d.lastSeenTime}`]
    .filter(Boolean)
    .join(' ');
  const res = await createGrievance({
    type: 'Missing Person',
    submittedBy: reporter.displayName,
    attendeeId: reporter.attendeeId,
    eventSlug: reporter.eventSlug,
    personName: d.name.trim() || undefined,
    details: d.description.trim(),
    lastSeen,
    photoDataUri: d.photoDataUri ?? undefined,
    coords: position(coords),
  });
  await notify(
    reporter,
    `Your report for ${d.name.trim() || 'the missing person'} reached the control room. Staff have been alerted.`,
  );
  return res;
}
