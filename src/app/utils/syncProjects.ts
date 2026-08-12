import type { ProjectData } from './projectBundle';

const LEGACY_SYNC_STORAGE_KEY = 'mongodb-designer-sync-projects-v1';
const DB_NAME = 'mongodb-model-viewer-db';
const STORE = 'sync_envelopes';
const DEFAULT_SYNC_ID = 'default';

interface SyncEnvelope {
  id?: string;
  provider: string;
  location: string;
  updatedAt: string;
  projects: ProjectData[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

async function migrateLegacySyncIfNeeded() {
  try {
    const db = await openDb();
    const hasSync = await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(DEFAULT_SYNC_ID);
      req.onsuccess = () => resolve(Boolean(req.result));
      req.onerror = () => reject(req.error);
    });
    if (hasSync) return;

    const raw = localStorage.getItem(LEGACY_SYNC_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as SyncEnvelope;
    if (!parsed || !Array.isArray(parsed.projects)) return;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put({ ...parsed, id: DEFAULT_SYNC_ID });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      tx.onerror = () => reject(tx.error);
    });
    localStorage.removeItem(LEGACY_SYNC_STORAGE_KEY);
  } catch (error) {
    console.error('Legacy sync migration failed:', error);
  }
}

export async function saveProjectsToVirtualSync(provider: string, location: string, projects: ProjectData[]) {
  const payload: SyncEnvelope = {
    id: DEFAULT_SYNC_ID,
    provider,
    location,
    updatedAt: new Date().toISOString(),
    projects
  };

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(payload);
      
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        tx.oncomplete = () => resolve();
      };
      
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
    return true;
  } catch (error) {
    console.error('Virtual sync save failed:', error);
    return false;
  }
}

export async function loadProjectsFromVirtualSync(): Promise<SyncEnvelope | null> {
  try {
    await migrateLegacySyncIfNeeded();
    const db = await openDb();
    const value = await new Promise<SyncEnvelope | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(DEFAULT_SYNC_ID);
      req.onsuccess = () => resolve((req.result as SyncEnvelope | undefined) || null);
      req.onerror = () => reject(req.error);
    });
    if (!value) return null;
    const { id, ...rest } = value;
    return rest;
  } catch (error) {
    console.error('Virtual sync load failed:', error);
    return null;
  }
}

