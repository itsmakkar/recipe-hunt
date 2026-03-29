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

/**
 * Load service account JSON. Order matters on Vercel:
 * inline JSON / base64 must come first — FIREBASE_SERVICE_ACCOUNT_PATH only works
 * when that file exists on disk (local dev), not in serverless deployments.
 */
function loadServiceAccountFromEnv(): Record<string, unknown> | null {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (b64) {
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      const parsed = tryParseJsonObject(decoded);
      if (parsed) return parsed;
    } catch {
      /* fall through */
    }
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (raw) {
    const direct = tryParseJsonObject(raw);
    if (direct) return direct;
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf-8");
      const parsed = tryParseJsonObject(decoded);
      if (parsed) return parsed;
    } catch {
      /* fall through */
    }
  }

  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (path) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(path) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return null;
}

export function isFirebaseConfigured(): boolean {
  return loadServiceAccountFromEnv() !== null;
}

export function getFirebaseAdmin() {
  if (_initialized) return admin;

  if (!admin.apps.length) {
    const serviceAccount = loadServiceAccountFromEnv();
    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
      (typeof serviceAccount?.project_id === "string"
        ? serviceAccount.project_id
        : "nijatham-ashram");

    if (!serviceAccount) {
      throw new Error(
        "Firebase credentials not found. Set FIREBASE_SERVICE_ACCOUNT (JSON or base64), FIREBASE_SERVICE_ACCOUNT_BASE64, or FIREBASE_SERVICE_ACCOUNT_PATH (local file only)."
      );
    }

    const bucket =
      process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
      `${projectId}.firebasestorage.app`;

    admin.initializeApp({
      credential: admin.credential.cert(
        serviceAccount as admin.ServiceAccount
      ),
      storageBucket: bucket,
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
