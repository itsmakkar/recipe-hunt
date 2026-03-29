import admin from "firebase-admin";

let _initialized = false;

export function getFirebaseAdmin() {
  if (_initialized) return admin;

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID || "nijatham-ashram";

  if (!admin.apps.length) {
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: `${projectId}.firebasestorage.app`,
      });
    } else if (serviceAccountPath) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: `${projectId}.firebasestorage.app`,
      });
    } else {
      throw new Error(
        "Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH."
      );
    }
  }
  _initialized = true;
  return admin;
}

export function getStorage() {
  return getFirebaseAdmin().storage().bucket();
}

export function getFirestore() {
  return getFirebaseAdmin().firestore();
}
