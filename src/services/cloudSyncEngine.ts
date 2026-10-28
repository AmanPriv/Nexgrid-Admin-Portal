import {
  auth,
  upsertCustomerInFirestore,
  upsertDomainInFirestore,
  upsertInvoiceInFirestore,
  upsertQuotationInFirestore,
  upsertPaymentInFirestore,
  updateWorkspaceHeartbeatInFirestore,
  fetchAllFromFirestore,
  subscribeToFirestoreWorkspace,
  onFirebaseAuthChange,
} from '../firebase.ts';
import { recalculateDocumentTotals } from '../utils/pdfGenerator.ts';

const STATIC_DB_KEY = 'nexgrid_cms_production_db_v2';
const CLOUD_SYNC_META_KEY = 'nexgrid_cloud_sync_meta_v2';
const NTFY_SYNC_TOPIC = 'nexgrid_cloud_db_sync_32da0e27_v2';

const CLOUD_STATE_ENDPOINTS = [
  '/api/public/cloud-state',
  'https://ais-dev-5pchhs56eemvp7uthhrevk-197503816635.europe-west2.run.app/api/public/cloud-state',
  'https://ais-pre-5pchhs56eemvp7uthhrevk-197503816635.europe-west2.run.app/api/public/cloud-state',
];

export interface CloudSyncStatus {
  connected: boolean;
  firebaseAuthenticated: boolean;
  firebaseEmail: string | null;
  projectId: string;
  databaseId: string;
  lastSyncedAt: string | null;
  syncing: boolean;
}

type SyncListener = (status: CloudSyncStatus) => void;
type DataUpdateListener = () => void;

const statusListeners = new Set<SyncListener>();
const dataUpdateListeners = new Set<DataUpdateListener>();

let currentStatus: CloudSyncStatus = {
  connected: true,
  firebaseAuthenticated: Boolean(auth.currentUser),
  firebaseEmail: auth.currentUser?.email || null,
  projectId: 'gen-lang-client-0990643313',
  databaseId: 'ai-studio-nexgridadminport-32da0e27-0409-4761-87f4-8341988c275a',
  lastSyncedAt: localStorage.getItem(CLOUD_SYNC_META_KEY) || null,
  syncing: false,
};

const clientInstanceId = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function emitStatus(partial: Partial<CloudSyncStatus>) {
  currentStatus = { ...currentStatus, ...partial };
  if (currentStatus.lastSyncedAt) {
    try {
      localStorage.setItem(CLOUD_SYNC_META_KEY, currentStatus.lastSyncedAt);
    } catch {
      // ignore
    }
  }
  for (const listener of statusListeners) {
    try {
      listener(currentStatus);
    } catch {
      // ignore
    }
  }
}

export function notifyDataUpdated() {
  for (const listener of dataUpdateListeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

export function subscribeSyncStatus(listener: SyncListener): () => void {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => statusListeners.delete(listener);
}

export function subscribeDataUpdates(listener: DataUpdateListener): () => void {
  dataUpdateListeners.add(listener);
  return () => dataUpdateListeners.delete(listener);
}

export function getCloudSyncStatus(): CloudSyncStatus {
  return currentStatus;
}

function mergeById<T extends { id: string; updatedAt?: string; createdAt?: string; timestamp?: string }>(
  localArr: T[] = [],
  remoteArr: T[] = [],
  deletedSet = new Set<string>()
): T[] {
  const map = new Map<string, T>();
  for (const item of localArr) {
    if (item && item.id && !deletedSet.has(item.id)) map.set(item.id, item);
  }
  for (const rItem of remoteArr) {
    if (!rItem || !rItem.id || deletedSet.has(rItem.id)) continue;
    const existing = map.get(rItem.id);
    if (!existing) {
      map.set(rItem.id, rItem);
    } else {
      const tLocal = existing.updatedAt || existing.createdAt || existing.timestamp || '';
      const tRemote = rItem.updatedAt || rItem.createdAt || rItem.timestamp || '';
      if (tRemote >= tLocal) {
        map.set(rItem.id, { ...existing, ...rItem });
      }
    }
  }
  return Array.from(map.values());
}

function mergeDocumentsById<T extends { id: string; items?: any[]; subtotal?: number; total?: number; updatedAt?: string; createdAt?: string }>(
  localArr: T[] = [],
  remoteArr: T[] = [],
  deletedSet = new Set<string>()
): T[] {
  const map = new Map<string, T>();
  for (const item of localArr) {
    if (item && item.id && !deletedSet.has(item.id)) {
      map.set(item.id, recalculateDocumentTotals(item as any) as unknown as T);
    }
  }
  for (const rawRemote of remoteArr) {
    if (!rawRemote || !rawRemote.id || deletedSet.has(rawRemote.id)) continue;
    const rItem = recalculateDocumentTotals(rawRemote as any) as unknown as T;
    const existing = map.get(rItem.id);
    if (!existing) {
      map.set(rItem.id, rItem);
    } else {
      const tLocal = existing.updatedAt || existing.createdAt || '';
      const tRemote = rItem.updatedAt || rItem.createdAt || '';
      const existingItemsCount = Array.isArray(existing.items) ? existing.items.length : 0;
      const remoteItemsCount = Array.isArray(rItem.items) ? rItem.items.length : 0;
      const bestItems =
        existingItemsCount > remoteItemsCount || ((existing.total || 0) > 0 && (rItem.total || 0) === 0)
          ? existing.items
          : rItem.items && rItem.items.length > 0
          ? rItem.items
          : existing.items;
      const base = tRemote >= tLocal ? { ...existing, ...rItem, items: bestItems } : { ...rItem, ...existing, items: bestItems };
      map.set(rItem.id, recalculateDocumentTotals(base as any) as unknown as T);
    }
  }
  return Array.from(map.values());
}

export function mergeDatabaseSnapshots(localDb: any, remoteDb: any): any {
  if (!remoteDb || typeof remoteDb !== 'object') return localDb;
  if (!localDb || typeof localDb !== 'object') return remoteDb;

  // Handle factory reset epoch if present
  const localReset = Number(localDb.resetEpoch) || 0;
  const remoteReset = Number(remoteDb.resetEpoch) || 0;
  if (remoteReset > localReset && remoteDb.admins?.length === 0 && remoteDb.customers?.length === 0) {
    return remoteDb;
  }

  const combinedDeleted = Array.from(
    new Set([
      ...(Array.isArray(localDb.deletedIds) ? localDb.deletedIds : []),
      ...(Array.isArray(remoteDb.deletedIds) ? remoteDb.deletedIds : []),
    ])
  );
  const deletedSet = new Set<string>(combinedDeleted);

  return {
    ...localDb,
    resetEpoch: Math.max(localReset, remoteReset),
    deletedIds: combinedDeleted,
    admins: mergeById(localDb.admins, remoteDb.admins, deletedSet),
    customers: mergeById(localDb.customers, remoteDb.customers, deletedSet),
    domains: mergeById(localDb.domains, remoteDb.domains, deletedSet),
    projects: mergeById(localDb.projects, remoteDb.projects, deletedSet),
    invoices: mergeDocumentsById(localDb.invoices, remoteDb.invoices, deletedSet),
    quotations: mergeDocumentsById(localDb.quotations, remoteDb.quotations, deletedSet),
    payments: mergeById(localDb.payments, remoteDb.payments, deletedSet),
    templates: mergeById(localDb.templates, remoteDb.templates, deletedSet),
    messageLogs: mergeById(localDb.messageLogs, remoteDb.messageLogs, deletedSet).slice(0, 300),
    auditLogs: mergeById(localDb.auditLogs, remoteDb.auditLogs, deletedSet).slice(0, 300),
    settings: {
      general: {
        ...(localDb.settings?.general || {}),
        ...(remoteDb.settings?.general || {}),
      },
      sms: {
        ...(localDb.settings?.sms || {}),
        ...(remoteDb.settings?.sms || {}),
        apiKey:
          remoteDb.settings?.sms?.apiKey ||
          localDb.settings?.sms?.apiKey ||
          'T2J1L49IRJHGGHN0Z6H71D332799EMHVF4P8A4KJ',
      },
      email: {
        ...(localDb.settings?.email || {}),
        ...(remoteDb.settings?.email || {}),
      },
      reminders: {
        ...(localDb.settings?.reminders || {}),
        ...(remoteDb.settings?.reminders || {}),
      },
    },
  };
}

export async function syncSnapshotToFirestoreEntities(dbState: any): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified || !dbState) return;
  try {
    for (const c of dbState.customers || []) {
      await upsertCustomerInFirestore(c);
    }
    for (const d of dbState.domains || []) {
      await upsertDomainInFirestore(d);
    }
    for (const i of dbState.invoices || []) {
      await upsertInvoiceInFirestore(i);
    }
    for (const q of dbState.quotations || []) {
      await upsertQuotationInFirestore(q);
    }
    for (const p of dbState.payments || []) {
      await upsertPaymentInFirestore(p);
    }
    await updateWorkspaceHeartbeatInFirestore({
      customersCount: (dbState.customers || []).length,
      domainsCount: (dbState.domains || []).length,
      invoicesCount: (dbState.invoices || []).length,
      quotationsCount: (dbState.quotations || []).length,
      paymentsCount: (dbState.payments || []).length,
    });
  } catch (err) {
    console.warn('Firestore entity sync warning:', err);
  }
}

export async function pushCloudDatabaseState(dbState: any): Promise<void> {
  if (!dbState) return;
  emitStatus({ syncing: true });

  // 1. Save to localStorage cache
  try {
    localStorage.setItem(STATIC_DB_KEY, JSON.stringify(dbState));
  } catch {
    // ignore
  }

  // 2. Sync to Firebase Firestore if authenticated with Firebase Auth
  if (auth.currentUser && auth.currentUser.emailVerified) {
    syncSnapshotToFirestoreEntities(dbState).catch(() => {});
  }

  // 3. Push to Cloud Relay endpoints (/api/public/cloud-state)
  const isStaticPages =
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('.github.io') ||
      window.location.hostname.endsWith('.nexgrid.lol') ||
      window.location.hostname === 'nexgrid.lol');

  for (const endpoint of CLOUD_STATE_ENDPOINTS) {
    if (endpoint.startsWith('/') && isStaticPages) continue;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': endpoint.startsWith('/') ? 'application/json' : 'text/plain;charset=UTF-8',
        },
        body: JSON.stringify({
          senderId: clientInstanceId,
          updatedAt: new Date().toISOString(),
          db: dbState,
        }),
      });
      if (res.ok) {
        break;
      }
    } catch {
      // try next relay
    }
  }

  // 4. Broadcast real-time multi-device sync notification via ntfy.sh (CORS-free)
  try {
    const compactDb = {
      resetEpoch: dbState.resetEpoch || 0,
      deletedIds: dbState.deletedIds || [],
      admins: dbState.admins || [],
      customers: dbState.customers || [],
      domains: dbState.domains || [],
      projects: dbState.projects || [],
      invoices: dbState.invoices || [],
      quotations: dbState.quotations || [],
      payments: dbState.payments || [],
      templates: dbState.templates || [],
      messageLogs: (dbState.messageLogs || []).slice(0, 100),
      auditLogs: (dbState.auditLogs || []).slice(0, 100),
      settings: dbState.settings,
    };
    fetch(`https://ntfy.sh/${NTFY_SYNC_TOPIC}`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'CLOUD_DB_SYNC',
        senderId: clientInstanceId,
        timestamp: new Date().toISOString(),
        compactDb,
      }),
    }).catch(() => {});
  } catch {
    // ignore
  }

  emitStatus({
    syncing: false,
    connected: true,
    lastSyncedAt: new Date().toISOString(),
  });
}

export async function pullCloudDatabaseState(): Promise<any | null> {
  emitStatus({ syncing: true });
  let localDb: any = null;
  try {
    const raw = localStorage.getItem(STATIC_DB_KEY);
    if (raw) localDb = JSON.parse(raw);
  } catch {
    // ignore
  }

  let mergedDb = localDb;

  // 1. Pull from Cloud Relay endpoints
  const isStaticPages =
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('.github.io') ||
      window.location.hostname.endsWith('.nexgrid.lol') ||
      window.location.hostname === 'nexgrid.lol');

  for (const endpoint of CLOUD_STATE_ENDPOINTS) {
    if (endpoint.startsWith('/') && isStaticPages) continue;
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.db) {
          mergedDb = mergeDatabaseSnapshots(mergedDb, data.db);
          break;
        }
      }
    } catch {
      // try next endpoint
    }
  }

  // 2. Also pull cached recent message from ntfy.sh topic (works 24/7 even on static GitHub Pages)
  try {
    const res = await fetch(`https://ntfy.sh/${NTFY_SYNC_TOPIC}/json?poll=1&since=48h`);
    if (res.ok) {
      const text = await res.text();
      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const outer = JSON.parse(line);
          if (outer.event === 'message' && typeof outer.message === 'string') {
            const payload = JSON.parse(outer.message);
            if (payload?.compactDb) {
              mergedDb = mergeDatabaseSnapshots(mergedDb, payload.compactDb);
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

  // 3. Pull directly from Firebase Firestore if authenticated
  if (auth.currentUser && auth.currentUser.emailVerified) {
    const firestoreData = await fetchAllFromFirestore();
    if (firestoreData) {
      mergedDb = mergeDatabaseSnapshots(mergedDb, firestoreData);
    }
  }

  if (mergedDb) {
    try {
      localStorage.setItem(STATIC_DB_KEY, JSON.stringify(mergedDb));
    } catch {
      // ignore
    }
  }

  emitStatus({
    syncing: false,
    connected: true,
    lastSyncedAt: new Date().toISOString(),
  });

  return mergedDb;
}

let realtimeInitialized = false;

export function initRealtimeMultiDeviceSync() {
  if (realtimeInitialized || typeof window === 'undefined') return;
  realtimeInitialized = true;

  // Listen to Firebase Auth state changes
  let unsubWorkspace: (() => void) | null = null;
  onFirebaseAuthChange(async (user) => {
    emitStatus({
      firebaseAuthenticated: Boolean(user),
      firebaseEmail: user?.email || null,
    });
    if (unsubWorkspace) {
      unsubWorkspace();
      unsubWorkspace = null;
    }
    if (user && user.emailVerified) {
      const currentRaw = localStorage.getItem(STATIC_DB_KEY);
      if (currentRaw) {
        try {
          await syncSnapshotToFirestoreEntities(JSON.parse(currentRaw));
        } catch {
          // ignore
        }
      }
      await pullCloudDatabaseState();
      notifyDataUpdated();
      unsubWorkspace = subscribeToFirestoreWorkspace(async () => {
        await pullCloudDatabaseState();
        notifyDataUpdated();
      });
    }
  });

  // Initial pull on startup
  pullCloudDatabaseState().then((merged) => {
    if (merged) notifyDataUpdated();
  });

  // Sync automatically whenever the browser tab/window regains focus or periodically
  window.addEventListener('focus', () => {
    pullCloudDatabaseState().then((merged) => {
      if (merged) notifyDataUpdated();
    });
  });

  setInterval(() => {
    pullCloudDatabaseState().then((merged) => {
      if (merged) notifyDataUpdated();
    });
  }, 20000);

  // Subscribe to real-time cross-device pub/sub stream
  const connectStream = () => {
    const abortCtrl = new AbortController();
    fetch(`https://ntfy.sh/${NTFY_SYNC_TOPIC}/json`, {
      method: 'GET',
      signal: abortCtrl.signal,
    })
      .then(async (res) => {
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const outer = JSON.parse(line.trim());
              if (outer.event === 'message' && typeof outer.message === 'string') {
                const payload = JSON.parse(outer.message);
                if (payload && payload.senderId !== clientInstanceId && payload.compactDb) {
                  const raw = localStorage.getItem(STATIC_DB_KEY);
                  const current = raw ? JSON.parse(raw) : {};
                  const merged = mergeDatabaseSnapshots(current, payload.compactDb);
                  localStorage.setItem(STATIC_DB_KEY, JSON.stringify(merged));
                  emitStatus({
                    connected: true,
                    lastSyncedAt: new Date().toISOString(),
                  });
                  notifyDataUpdated();
                }
              }
            } catch {
              // ignore non-json
            }
          }
        }
      })
      .catch(() => {
        setTimeout(connectStream, 5000);
      });
  };

  connectStream();
}
