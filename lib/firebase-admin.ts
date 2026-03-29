import admin from "firebase-admin";

let _initialized = false;

function tryParseJsonObject(s: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(s) as unknown;
    return o !== null && typeof o === "object" && !Array.isArray(o)
      ? (o as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function loadServiceAccountFromEnv(): Record<string, unknown> | null {
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (path) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(path) as Record<string, unknown>;
      return mod;
    } catch {
      return null;
    }
  }

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (b64) {
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      return tryParseJsonObject(decoded);
    } catch {
      return null;
    }
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;

  const direct = tryParseJsonObject(raw);
  if (direct) return direct;

  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    return tryParseJsonObject(decoded);
  } catch {
    return null;
  }
}

export function isFirebaseConfigured(): boolean {
  return loadServiceAccountFromEnv() !== null;
}

export function getFirebaseAdmin() {
  if (_initialized) return admin;

  if (!admin.apps.length) {
    const serviceAccount = loadServiceAccountFromEnv();
    const projectId = process.env.FIREBASE_PROJECT_ID || "nijatham-ashram";

    if (!serviceAccount) {
      throw new Error(
        "Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT (JSON or base64), FIREBASE_SERVICE_ACCOUNT_BASE64, or FIREBASE_SERVICE_ACCOUNT_PATH."
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert(
        serviceAccount as admin.ServiceAccount
      ),
      storageBucket: `${projectId}.firebasestorage.app`,
    });
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
