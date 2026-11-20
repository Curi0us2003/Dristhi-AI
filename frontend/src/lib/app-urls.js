/**
 * The admin and attendee apps are one build deployed to two Firebase Hosting sites
 * (see firebase.json targets `admin` and `attendee`). Admin pages link to the attendee app with
 * this. Empty (the local default) means "same site", e.g. http://localhost:9002/join.
 */
export const ATTENDEE_URL = (process.env.NEXT_PUBLIC_ATTENDEE_URL ?? '').replace(/\/$/, '');
