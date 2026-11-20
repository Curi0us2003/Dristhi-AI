# Data Connect schema (not used yet)

The hackathon build stores admin data in Firestore (`events`, `zones`, `staff`, `dispatches`; see
`src/lib/admin-data.ts`). These files describe the same data for a later move to Firebase Data
Connect (Postgres). They are not wired into `firebase.json`.

To use them later, on a machine where the Data Connect emulator can run (Windows Smart App Control
blocks it):

1. Add `"dataconnect": { "source": "dataconnect" }` to `firebase.json`.
2. `npx firebase dataconnect:sdk:generate` creates `src/dataconnect-generated`.
3. Replace the Firestore calls in `src/lib/admin-data.ts` with the generated functions.
