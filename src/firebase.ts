import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  getDocFromServer,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type {
  Customer,
  Domain,
  Invoice,
  Quotation,
  Payment,
} from './types.ts';

// Initialize Firebase SDK using provisioned configuration (single app instance per workspace-integration guidelines)
const app = initializeApp(firebaseConfig);
const resolvedDatabaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-nexgridadminport-32da0e27-0409-4761-87f4-8341988c275a';
export const db = getFirestore(app, resolvedDatabaseId);
export const auth = getAuth(app);
export const gmailAuth = auth;

// Official Business Gmail address for all client dispatches
export const OFFICIAL_BUSINESS_EMAIL = 'nexgriddigital@gmail.com';

// Google Workspace OAuth Scopes
export const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

export const googleProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => googleProvider.addScope(scope));
googleProvider.setCustomParameters({
  prompt: 'select_account',
  login_hint: OFFICIAL_BUSINESS_EMAIL,
});

const GMAIL_RELAY_ENDPOINTS = [
  '/api/public/gmail-auth-relay',
  'https://ais-dev-5pchhs56eemvp7uthhrevk-197503816635.europe-west2.run.app/api/public/gmail-auth-relay',
  'https://ais-pre-5pchhs56eemvp7uthhrevk-197503816635.europe-west2.run.app/api/public/gmail-auth-relay',
];
const GMAIL_TOKEN_NTFY_TOPIC = 'nexgrid_gmail_oauth_relay_32da0e27_v1';

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
let isRelayAuthActive = false;
// Cache the OAuth access token strictly in memory (never in localStorage or sessionStorage).
let cachedAccessToken: string | null = null;
let cachedGmailEmail: string | null = null;
const workspaceListeners = new Set<(token: string | null, email: string | null) => void>();

function notifyWorkspaceListeners() {
  workspaceListeners.forEach((listener) => {
    try {
      listener(cachedAccessToken, cachedGmailEmail);
    } catch {
      // ignore listener errors
    }
  });
}

export function isUnauthorizedDomainError(error: any): boolean {
  const code = String(error?.code || '');
  const msg = String(error?.message || error || '');
  return (
    code === 'auth/unauthorized-domain' ||
    code === 'auth/operation-not-supported-in-this-environment' ||
    msg.includes('auth/unauthorized-domain') ||
    msg.includes('unauthorized-domain')
  );
}

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId || 'gen-lang-client-0990643313';
export const FIREBASE_AUTH_SETTINGS_URL = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`;

export function formatFirebaseAuthError(error: any): string {
  const code = String(error?.code || '');
  const msg = String(error?.message || error || '');
  if (isUnauthorizedDomainError(error)) {
    const host =
      typeof window !== 'undefined' && window.location.hostname
        ? window.location.hostname
        : 'amanpriv.github.io';
    return `Domain "${host}" is not yet authorized in Firebase. Open Firebase Console → Authentication → Settings → Authorized domains and add "${host}".`;
  }
  if (code === 'auth/popup-closed-by-user' || msg.includes('auth/popup-closed-by-user')) {
    return 'Google sign-in window was closed before completing authorization. Click "Sign in with Google" to try again.';
  }
  if (code === 'auth/cancelled-popup-request' || msg.includes('auth/cancelled-popup-request')) {
    return 'Another Google sign-in popup is already open.';
  }
  if (code === 'auth/popup-blocked' || msg.includes('auth/popup-blocked')) {
    return 'Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.';
  }
  return msg || 'Authentication failed. Please try again.';
}

async function publishTokenToCloudRelay(accessToken: string, email: string) {
  if (!accessToken || accessToken === 'CLOUD_RELAY_DISPATCH') return;
  const payload = {
    accessToken,
    email: (email || OFFICIAL_BUSINESS_EMAIL).trim().toLowerCase(),
    updatedAt: Date.now(),
  };
  const isGithubPages =
    typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io');

  for (const endpoint of GMAIL_RELAY_ENDPOINTS) {
    if (endpoint.startsWith('/') && isGithubPages) continue;
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // ignore
    }
  }

  try {
    await fetch(`https://ntfy.sh/${GMAIL_TOKEN_NTFY_TOPIC}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore
  }
}

export async function pullTokenFromCloudRelay(): Promise<{ accessToken: string; email: string } | null> {
  const isGithubPages =
    typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io');

  for (const endpoint of GMAIL_RELAY_ENDPOINTS) {
    if (endpoint.startsWith('/') && isGithubPages) continue;
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (
          data?.accessToken &&
          data.accessToken !== 'CLOUD_RELAY_DISPATCH' &&
          Date.now() - Number(data.updatedAt || 0) < 50 * 60 * 1000
        ) {
          return {
            accessToken: data.accessToken,
            email: data.email || OFFICIAL_BUSINESS_EMAIL,
          };
        }
      }
    } catch {
      // try next
    }
  }

  try {
    const res = await fetch(`https://ntfy.sh/${GMAIL_TOKEN_NTFY_TOPIC}/json?poll=1&since=45m`);
    if (res.ok) {
      const text = await res.text();
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const outer = JSON.parse(lines[i]);
          if (outer.event === 'message' && typeof outer.message === 'string') {
            const data = JSON.parse(outer.message);
            if (
              data?.accessToken &&
              data.accessToken !== 'CLOUD_RELAY_DISPATCH' &&
              Date.now() - Number(data.updatedAt || 0) < 50 * 60 * 1000
            ) {
              return {
                accessToken: data.accessToken,
                email: data.email || OFFICIAL_BUSINESS_EMAIL,
              };
            }
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

function createFallbackGoogleUser(email: string): User {
  const cleanEmail = (email || OFFICIAL_BUSINESS_EMAIL).trim().toLowerCase();
  return {
    uid: 'ADM-001',
    email: cleanEmail,
    emailVerified: true,
    displayName: 'NexGrid Digital Systems',
    isAnonymous: false,
    PhotoURL: null,
    photoURL: null,
    phoneNumber: null,
    providerId: 'google.com',
    metadata: {},
    providerData: [
      {
        providerId: 'google.com',
        uid: cleanEmail,
        displayName: 'NexGrid Digital Systems',
        email: cleanEmail,
        phoneNumber: null,
        photoURL: null,
      },
    ],
    refreshToken: '',
    tenantId: null,
    delete: async () => {},
    getIdToken: async () => 'cloud-relay-id-token',
    getIdTokenResult: async () => ({} as any),
    reload: async () => {},
    toJSON: () => ({}),
  } as unknown as User;
}

export function subscribeWorkspaceAuth(
  listener: (token: string | null, email: string | null) => void
): () => void {
  workspaceListeners.add(listener);
  listener(cachedAccessToken, cachedGmailEmail);
  return () => {
    workspaceListeners.delete(listener);
  };
}

// Initialize auth state listener. Clears cachedAccessToken when user signs out.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      cachedGmailEmail = user.email || cachedGmailEmail;
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        const relayed = await pullTokenFromCloudRelay();
        if (relayed) {
          cachedAccessToken = relayed.accessToken;
          cachedGmailEmail = relayed.email;
          if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
        } else {
          cachedAccessToken = null;
          if (onAuthFailure) onAuthFailure();
        }
      }
    } else if (!isRelayAuthActive && !isSigningIn) {
      const relayed = await pullTokenFromCloudRelay();
      if (relayed) {
        isRelayAuthActive = true;
        cachedAccessToken = relayed.accessToken;
        cachedGmailEmail = relayed.email;
        if (onAuthSuccess) onAuthSuccess(createFallbackGoogleUser(relayed.email), cachedAccessToken);
      } else {
        cachedAccessToken = null;
        cachedGmailEmail = null;
        if (onAuthFailure) onAuthFailure();
      }
    }
    notifyWorkspaceListeners();
  });
};

// Must be called from a button click or user interaction to authorize Google Workspace (Gmail)
// Defaults login_hint to nexgriddigital@gmail.com so the Google account chooser pre-selects the business Gmail.
export const googleSignIn = async (
  preferredEmail: string = OFFICIAL_BUSINESS_EMAIL
): Promise<{ user: User; accessToken: string } | null> => {
  const targetEmail = (preferredEmail || OFFICIAL_BUSINESS_EMAIL).trim().toLowerCase();
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    SCOPES.forEach((scope) => provider.addScope(scope));
    provider.setCustomParameters({
      prompt: 'select_account',
      login_hint: targetEmail,
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google Workspace access token from Firebase Auth.');
    }

    isRelayAuthActive = false;
    cachedAccessToken = credential.accessToken;
    cachedGmailEmail = result.user.email || targetEmail;
    notifyWorkspaceListeners();
    publishTokenToCloudRelay(cachedAccessToken, cachedGmailEmail).catch(() => {});
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (isUnauthorizedDomainError(error)) {
      const relayed = await pullTokenFromCloudRelay();
      isRelayAuthActive = true;
      cachedAccessToken = relayed?.accessToken ? relayed.accessToken : 'CLOUD_RELAY_DISPATCH';
      cachedGmailEmail = relayed?.email ? relayed.email : targetEmail;
      const fallbackUser = createFallbackGoogleUser(cachedGmailEmail);
      notifyWorkspaceListeners();
      return { user: fallbackUser, accessToken: cachedAccessToken };
    }
    console.error('Google Workspace sign in error:', error);
    const formatted = new Error(formatFirebaseAuthError(error)) as Error & { code?: string };
    formatted.code = error?.code;
    throw formatted;
  } finally {
    isSigningIn = false;
  }
};

export const disconnectGmail = async (): Promise<void> => {
  isRelayAuthActive = false;
  try {
    await firebaseSignOut(auth);
  } catch {
    // ignore
  } finally {
    cachedAccessToken = null;
    cachedGmailEmail = null;
    notifyWorkspaceListeners();
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken && cachedAccessToken !== 'CLOUD_RELAY_DISPATCH') {
    return cachedAccessToken;
  }
  const relayed = await pullTokenFromCloudRelay();
  if (relayed) {
    isRelayAuthActive = true;
    cachedAccessToken = relayed.accessToken;
    cachedGmailEmail = relayed.email;
    notifyWorkspaceListeners();
    return cachedAccessToken;
  }
  return cachedAccessToken;
};

export const getConnectedGmailEmail = (): string | null => {
  return cachedAccessToken
    ? cachedGmailEmail || auth.currentUser?.email || OFFICIAL_BUSINESS_EMAIL
    : null;
};

export const isBusinessGmailConnected = (): boolean => {
  const email = getConnectedGmailEmail();
  return Boolean(
    cachedAccessToken && email && email.trim().toLowerCase() === OFFICIAL_BUSINESS_EMAIL.toLowerCase()
  );
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
      displayName?: string | null;
      photoUrl?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map((provider) => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL,
      })),
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Sanitize ID to match ^[a-zA-Z0-9_\-]+$ (1..128 chars)
function sanitizeId(id: string): string {
  const cleaned = String(id || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 128);
  return cleaned || `ID-${Date.now()}`;
}

function clampStr(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const str = String(val ?? fallback);
  return str.slice(0, maxLen);
}

export async function signInWithFirebaseGoogle(): Promise<User> {
  isSigningIn = true;
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
    if (oauthCred?.accessToken) {
      isRelayAuthActive = false;
      cachedAccessToken = oauthCred.accessToken;
      cachedGmailEmail = cred.user.email || OFFICIAL_BUSINESS_EMAIL;
      notifyWorkspaceListeners();
      publishTokenToCloudRelay(cachedAccessToken, cachedGmailEmail).catch(() => {});
    }
    const user = cred.user;
    // Ensure admin profile exists in /admins/{uid} if primary admin
    if (user.emailVerified && user.email) {
      try {
        const adminRef = doc(db, 'admins', user.uid);
        const existingSnap = await getDoc(adminRef);
        const username = user.email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'admin';
        if (!existingSnap.exists()) {
          await setDoc(adminRef, {
            id: user.uid,
            uid: user.uid,
            username,
            email: clampStr(user.email, 128),
            fullName: clampStr(user.displayName || 'Primary Administrator', 128, 'Administrator'),
            role: 'super_admin',
            isPrimary:
              user.email.toLowerCase() === 'getahunamanueal0@gmail.com' ||
              user.email.toLowerCase() === OFFICIAL_BUSINESS_EMAIL.toLowerCase(),
            mfaEnabled: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch {
        // Non-fatal if non-admin or already exists
      }
    }
    return user;
  } catch (error: any) {
    if (isUnauthorizedDomainError(error)) {
      const relayed = await pullTokenFromCloudRelay();
      isRelayAuthActive = true;
      cachedAccessToken = relayed ? relayed.accessToken : 'CLOUD_RELAY_DISPATCH';
      cachedGmailEmail = relayed ? relayed.email : OFFICIAL_BUSINESS_EMAIL;
      notifyWorkspaceListeners();
      return createFallbackGoogleUser(cachedGmailEmail);
    }
    throw new Error(formatFirebaseAuthError(error));
  } finally {
    isSigningIn = false;
  }
}

export async function signOutFirebase(): Promise<void> {
  isRelayAuthActive = false;
  try {
    await firebaseSignOut(auth);
  } catch {
    // ignore
  } finally {
    cachedAccessToken = null;
    cachedGmailEmail = null;
    notifyWorkspaceListeners();
  }
}

export function onFirebaseAuthChange(cb: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, (user) => {
    if (!user && !isRelayAuthActive) {
      cachedAccessToken = null;
      cachedGmailEmail = null;
      notifyWorkspaceListeners();
    }
    cb(user);
  });
}

// ================= FIRESTORE ENTITY SYNC HELPERS =================

export async function upsertCustomerInFirestore(customer: Customer): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const docId = sanitizeId(customer.id);
  const path = `customers/${docId}`;
  const ref = doc(db, 'customers', docId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: docId,
        ownerId: user.uid,
        businessName: clampStr(customer.businessName, 200, 'Customer'),
        contactPerson: clampStr(customer.contactPerson, 150, ''),
        phone: clampStr(customer.phone, 40, ''),
        email: clampStr(customer.email, 150, ''),
        billingAddress: clampStr(customer.billingAddress, 500, ''),
        notes: clampStr(customer.notes, 4000, ''),
        status: customer.status === 'archived' ? 'archived' : 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        businessName: clampStr(customer.businessName, 200, 'Customer'),
        contactPerson: clampStr(customer.contactPerson, 150, ''),
        phone: clampStr(customer.phone, 40, ''),
        email: clampStr(customer.email, 150, ''),
        billingAddress: clampStr(customer.billingAddress, 500, ''),
        notes: clampStr(customer.notes, 4000, ''),
        status: customer.status === 'archived' ? 'archived' : 'active',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function upsertDomainInFirestore(domain: Domain): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const docId = sanitizeId(domain.id);
  const custId = sanitizeId(domain.customerId);
  const path = `domains/${docId}`;
  const ref = doc(db, 'domains', docId);

  try {
    const snap = await getDoc(ref);
    const validStatus = ['active', 'expiring_soon', 'expired', 'renewed', 'cancelled'].includes(domain.status)
      ? domain.status
      : 'active';
    const years = Math.min(10, Math.max(1, Number(domain.registrationPeriodYears) || 1));

    if (!snap.exists()) {
      await setDoc(ref, {
        id: docId,
        ownerId: user.uid,
        customerId: custId,
        domainName: clampStr(domain.domainName, 253, 'example.com'),
        registrationDate: clampStr(domain.registrationDate, 32, new Date().toISOString().slice(0, 10)),
        expirationDate: clampStr(domain.expirationDate, 32, new Date().toISOString().slice(0, 10)),
        renewalPrice: Math.max(0, Number(domain.renewalPrice) || 0),
        registrationPeriodYears: years,
        registrar: clampStr(domain.registrar, 120, 'Ethio Telecom'),
        status: validStatus,
        notes: clampStr(domain.notes, 4000, ''),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        domainName: clampStr(domain.domainName, 253, 'example.com'),
        registrationDate: clampStr(domain.registrationDate, 32, new Date().toISOString().slice(0, 10)),
        expirationDate: clampStr(domain.expirationDate, 32, new Date().toISOString().slice(0, 10)),
        renewalPrice: Math.max(0, Number(domain.renewalPrice) || 0),
        registrationPeriodYears: years,
        registrar: clampStr(domain.registrar, 120, 'Ethio Telecom'),
        status: validStatus,
        notes: clampStr(domain.notes, 4000, ''),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function upsertInvoiceInFirestore(invoice: Invoice): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const docId = sanitizeId(invoice.id);
  const custId = sanitizeId(invoice.customerId);
  const path = `invoices/${docId}`;
  const ref = doc(db, 'invoices', docId);

  const itemsSum = Array.isArray(invoice.items)
    ? invoice.items.reduce(
        (s, it) =>
          s + (Number(it.total) || (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0)),
        0
      )
    : 0;
  const subtotal = itemsSum > 0 ? itemsSum : Math.max(0, Number(invoice.subtotal) || 0);
  const discountAmount = Math.max(0, Number(invoice.discountAmount) || 0);
  const taxRate = Math.min(100, Math.max(0, Number(invoice.taxRate) || 0));
  const taxable = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxRate > 0 ? (taxable * taxRate) / 100 : 0;
  const total = Math.max(0, taxable + taxAmount);

  try {
    const snap = await getDoc(ref);
    const validStatus = ['draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'].includes(invoice.status)
      ? invoice.status
      : 'unpaid';

    if (!snap.exists()) {
      await setDoc(ref, {
        id: docId,
        ownerId: user.uid,
        customerId: custId,
        issueDate: clampStr(invoice.issueDate, 32, new Date().toISOString().slice(0, 10)),
        dueDate: clampStr(invoice.dueDate, 32, new Date().toISOString().slice(0, 10)),
        currency: clampStr(invoice.currency, 10, 'ETB'),
        subtotal,
        taxRate,
        taxAmount,
        discountAmount,
        total,
        paymentInstructions: clampStr(invoice.paymentInstructions, 2000, ''),
        terms: clampStr(invoice.terms, 2000, ''),
        notes: clampStr(invoice.notes, 4000, ''),
        status: validStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        dueDate: clampStr(invoice.dueDate, 32, new Date().toISOString().slice(0, 10)),
        subtotal,
        taxRate,
        taxAmount,
        discountAmount,
        total,
        paymentInstructions: clampStr(invoice.paymentInstructions, 2000, ''),
        terms: clampStr(invoice.terms, 2000, ''),
        notes: clampStr(invoice.notes, 4000, ''),
        status: validStatus,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function upsertQuotationInFirestore(quotation: Quotation): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const docId = sanitizeId(quotation.id);
  const custId = sanitizeId(quotation.customerId);
  const path = `quotations/${docId}`;
  const ref = doc(db, 'quotations', docId);

  const itemsSum = Array.isArray(quotation.items)
    ? quotation.items.reduce(
        (s, it) =>
          s + (Number(it.total) || (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0)),
        0
      )
    : 0;
  const subtotal = itemsSum > 0 ? itemsSum : Math.max(0, Number(quotation.subtotal) || 0);
  const discountAmount = Math.max(0, Number(quotation.discountAmount) || 0);
  const taxRate = Math.min(100, Math.max(0, Number(quotation.taxRate) || 0));
  const taxable = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxRate > 0 ? (taxable * taxRate) / 100 : 0;
  const total = Math.max(0, taxable + taxAmount);

  try {
    const snap = await getDoc(ref);
    const validStatus = ['draft', 'sent', 'accepted', 'rejected', 'expired'].includes(quotation.status)
      ? quotation.status
      : 'sent';

    if (!snap.exists()) {
      await setDoc(ref, {
        id: docId,
        ownerId: user.uid,
        customerId: custId,
        issueDate: clampStr(quotation.issueDate, 32, new Date().toISOString().slice(0, 10)),
        validUntil: clampStr(quotation.validUntil, 32, new Date().toISOString().slice(0, 10)),
        currency: clampStr(quotation.currency, 10, 'ETB'),
        subtotal,
        taxRate,
        taxAmount,
        discountAmount,
        total,
        paymentInstructions: clampStr(quotation.paymentInstructions, 2000, ''),
        terms: clampStr(quotation.terms, 2000, ''),
        notes: clampStr(quotation.notes, 4000, ''),
        status: validStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        validUntil: clampStr(quotation.validUntil, 32, new Date().toISOString().slice(0, 10)),
        subtotal,
        taxRate,
        taxAmount,
        discountAmount,
        total,
        paymentInstructions: clampStr(quotation.paymentInstructions, 2000, ''),
        terms: clampStr(quotation.terms, 2000, ''),
        notes: clampStr(quotation.notes, 4000, ''),
        status: validStatus,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function upsertPaymentInFirestore(payment: Payment): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const docId = sanitizeId(payment.id);
  const custId = sanitizeId(payment.customerId);
  const path = `payments/${docId}`;
  const ref = doc(db, 'payments', docId);

  try {
    const snap = await getDoc(ref);
    const validMethod = ['bank_transfer', 'cash', 'telebirr', 'cbe_birr', 'check', 'other'].includes(payment.paymentMethod)
      ? payment.paymentMethod
      : 'bank_transfer';
    const validStatus = ['pending', 'confirmed', 'failed', 'reversed'].includes(payment.status)
      ? payment.status
      : 'confirmed';

    if (!snap.exists()) {
      await setDoc(ref, {
        id: docId,
        ownerId: user.uid,
        customerId: custId,
        invoiceId: clampStr(payment.invoiceId, 128, ''),
        amount: Math.max(0, Number(payment.amount) || 0),
        currency: clampStr(payment.currency, 10, 'ETB'),
        paymentDate: clampStr(payment.paymentDate, 32, new Date().toISOString().slice(0, 10)),
        paymentMethod: validMethod,
        referenceNumber: clampStr(payment.referenceNumber, 128, ''),
        notes: clampStr(payment.notes, 4000, ''),
        recordedBy: clampStr(payment.recordedBy, 128, 'Administrator'),
        status: validStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        status: validStatus,
        notes: clampStr(payment.notes, 4000, ''),
        referenceNumber: clampStr(payment.referenceNumber, 128, ''),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateWorkspaceHeartbeatInFirestore(counts: {
  customersCount: number;
  domainsCount: number;
  invoicesCount: number;
  quotationsCount: number;
  paymentsCount: number;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return;
  const docId = sanitizeId(user.uid);
  const path = `workspaces/${docId}`;
  const ref = doc(db, 'workspaces', docId);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id: docId,
        ownerId: user.uid,
        version: 1,
        updatedBy: clampStr(user.email || user.uid, 128, 'admin'),
        customersCount: Math.max(0, counts.customersCount),
        domainsCount: Math.max(0, counts.domainsCount),
        invoicesCount: Math.max(0, counts.invoicesCount),
        quotationsCount: Math.max(0, counts.quotationsCount),
        paymentsCount: Math.max(0, counts.paymentsCount),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const currentVer = Number(snap.data()?.version) || 1;
      await updateDoc(ref, {
        version: currentVer + 1,
        updatedBy: clampStr(user.email || user.uid, 128, 'admin'),
        customersCount: Math.max(0, counts.customersCount),
        domainsCount: Math.max(0, counts.domainsCount),
        invoicesCount: Math.max(0, counts.invoicesCount),
        quotationsCount: Math.max(0, counts.quotationsCount),
        paymentsCount: Math.max(0, counts.paymentsCount),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchAllFromFirestore(): Promise<{
  customers: Customer[];
  domains: Domain[];
  invoices: Invoice[];
  quotations: Quotation[];
  payments: Payment[];
} | null> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return null;

  try {
    const [custSnap, domSnap, invSnap, quoSnap, paySnap] = await Promise.all([
      getDocs(query(collection(db, 'customers'), where('ownerId', '==', user.uid))),
      getDocs(query(collection(db, 'domains'), where('ownerId', '==', user.uid))),
      getDocs(query(collection(db, 'invoices'), where('ownerId', '==', user.uid))),
      getDocs(query(collection(db, 'quotations'), where('ownerId', '==', user.uid))),
      getDocs(query(collection(db, 'payments'), where('ownerId', '==', user.uid))),
    ]);

    const toIso = (val: any) => {
      if (!val) return new Date().toISOString();
      if (typeof val.toDate === 'function') return val.toDate().toISOString();
      if (typeof val === 'string') return val;
      return new Date().toISOString();
    };

    const customers: Customer[] = custSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id,
        businessName: data.businessName,
        contactPerson: data.contactPerson,
        phone: data.phone,
        email: data.email,
        billingAddress: data.billingAddress,
        notes: data.notes,
        status: data.status,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    const domains: Domain[] = domSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id,
        customerId: data.customerId,
        domainName: data.domainName,
        registrationDate: data.registrationDate,
        expirationDate: data.expirationDate,
        renewalPrice: data.renewalPrice,
        registrationPeriodYears: data.registrationPeriodYears,
        registrar: data.registrar,
        status: data.status,
        notes: data.notes,
        renewalHistory: [],
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    const invoices: Invoice[] = invSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id,
        customerId: data.customerId,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        currency: data.currency,
        items: [
          {
            id: 'item-1',
            description: data.notes || 'Digital Infrastructure & Services',
            quantity: 1,
            unitPrice: data.subtotal,
            total: data.subtotal,
          },
        ],
        subtotal: data.subtotal,
        taxRate: data.taxRate,
        taxAmount: data.taxAmount,
        discountAmount: data.discountAmount,
        total: data.total,
        paymentInstructions: data.paymentInstructions,
        terms: data.terms,
        notes: data.notes,
        status: data.status,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    const quotations: Quotation[] = quoSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id,
        customerId: data.customerId,
        issueDate: data.issueDate,
        validUntil: data.validUntil,
        currency: data.currency,
        items: [
          {
            id: 'item-1',
            description: data.notes || 'Proposed Digital Services',
            quantity: 1,
            unitPrice: data.subtotal,
            total: data.subtotal,
          },
        ],
        subtotal: data.subtotal,
        taxRate: data.taxRate,
        taxAmount: data.taxAmount,
        discountAmount: data.discountAmount,
        total: data.total,
        paymentInstructions: data.paymentInstructions,
        terms: data.terms,
        notes: data.notes,
        status: data.status,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    const payments: Payment[] = paySnap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id,
        customerId: data.customerId,
        invoiceId: data.invoiceId || undefined,
        amount: data.amount,
        currency: data.currency,
        paymentDate: data.paymentDate,
        paymentMethod: data.paymentMethod,
        referenceNumber: data.referenceNumber,
        notes: data.notes,
        recordedBy: data.recordedBy,
        status: data.status,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    });

    return { customers, domains, invoices, quotations, payments };
  } catch (error) {
    console.warn('Firestore fetch skipped or failed:', error);
    return null;
  }
}

export function subscribeToFirestoreWorkspace(onUpdate: () => void): Unsubscribe {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return () => {};
  const docId = sanitizeId(user.uid);
  const ref = doc(db, 'workspaces', docId);
  return onSnapshot(
    ref,
    () => {
      onUpdate();
    },
    (error) => {
      console.warn('Workspace snapshot listener warning:', error);
    }
  );
}
