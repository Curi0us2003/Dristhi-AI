/**
 * Reports an attendee sends from the assistant or the Help page. Nothing is written until the
 * attendee taps Send on a draft. The backend stores the report in Cloud SQL and sends the
 * attendee a confirmation notification (backend/dristhi/routers/reports.py).
 */
import { attendeeApi } from '@/lib/api';

function position(coords) {
  return coords ? { lat: coords.lat, lng: coords.lng, accuracy_m: coords.accuracy_m } : undefined;
}

function send(reporter, body) {
  if (!reporter?.attendeeId || reporter.attendeeId.startsWith('local-')) {
    throw new Error('Join the event from its QR code before sending a report.');
  }
  return attendeeApi(`/api/attendees/${encodeURIComponent(reporter.attendeeId)}/reports`, {
    method: 'POST',
    body,
  });
}

export async function sendMedicalReport(reporter, d, coords) {
  const g = await send(reporter, {
    type: 'Medical Attention',
    details: d.details.trim(),
    location_text: d.where.trim() || (coords ? 'Shared location' : undefined),
    urgency: d.urgency,
    coords: position(coords),
  });
  return { success: true, grievanceId: g.id };
}

export async function sendMissingPersonReport(reporter, d, coords) {
  const lastSeen = [d.lastSeenPlace.trim(), d.lastSeenTime && `at ${d.lastSeenTime}`]
    .filter(Boolean)
    .join(' ');
  const g = await send(reporter, {
    type: 'Missing Person',
    person_name: d.name.trim() || undefined,
    details: d.description.trim(),
    last_seen: lastSeen || undefined,
    photo_data_uri: d.photoDataUri ?? undefined,
    coords: position(coords),
  });
  return { success: true, grievanceId: g.id };
}
