import { db } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

// This is the type that will be stored in Firestore.
export const createGrievance = async (data) => {
  // Manually construct the payload to ensure no File object is included.
  const grievancePayload = {
    type: data.type,
    details: data.details,
    submittedBy: data.submittedBy,
    status: 'new',
    submittedAt: serverTimestamp(),
  };

  if (data.attendeeId) grievancePayload.attendeeId = data.attendeeId;
  if (data.eventSlug) grievancePayload.eventSlug = data.eventSlug;
  if (data.email) grievancePayload.email = data.email;
  if (data.coords) grievancePayload.coords = data.coords;
  if (data.urgency) grievancePayload.urgency = data.urgency;
  if (data.location) grievancePayload.location = data.location;
  if (data.personName) grievancePayload.personName = data.personName;
  if (data.lastSeen) grievancePayload.lastSeen = data.lastSeen;
  if (data.photoDataUri) grievancePayload.photoDataUri = data.photoDataUri;

  try {
    const docRef = await addDoc(collection(db, 'grievances'), grievancePayload);
    console.log('Grievance created with ID:', docRef.id);
    return { success: true, grievanceId: docRef.id };
  } catch (error) {
    console.error('Error creating grievance:', error);
    throw new Error(error instanceof Error ? error.message : 'An unknown error occurred');
  }
};
