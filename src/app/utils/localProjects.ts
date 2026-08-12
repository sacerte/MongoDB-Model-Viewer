import type { ProjectData } from './projectBundle';

const LEGACY_STORAGE_KEY = 'mongodb-designer-projects';
const DB_NAME = 'mongodb-model-viewer-db';
const STORE = 'projects';

declare global {
  interface Window {
    desktopApp?: {
      storage?: {
        writeLocalProjects?: (projects: ProjectData[]) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
        readLocalProjects?: () => Promise<{ ok: boolean; projects: ProjectData[]; filePath?: string; error?: string }>;
      };
    };
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

function sortByRecent(projects: ProjectData[]): ProjectData[] {
  return [...projects].sort((a, b) => {
    const aTime = Date.parse(a.updated_at || a.created_at || '') || 0;
    const bTime = Date.parse(b.updated_at || b.created_at || '') || 0;
    return bTime - aTime;
  });
}

async function loadLocalProjectsFromDesktopFile(): Promise<ProjectData[] | null> {
  try {
    const reader = window.desktopApp?.storage?.readLocalProjects;
    if (!reader) {
      return null;
    }

    const result = await reader();
    if (!result?.ok) {
      return null;
    }

    return sortByRecent(Array.isArray(result.projects) ? result.projects : []);
  } catch (error) {
    console.error('Error loading desktop local projects:', error);
    return null;
  }
}

async function saveLocalProjectsToDesktopFile(projects: ProjectData[]): Promise<boolean> {
  try {
    const writer = window.desktopApp?.storage?.writeLocalProjects;
    if (!writer) {
      return false;
    }

    const result = await writer(projects);
    return Boolean(result?.ok);
  } catch (error) {
    console.error('Error saving desktop local projects:', error);
    return false;
  }
}

async function migrateLegacyIfNeeded() {
  try {
    const db = await openDb();
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
    if (count > 0) return;

    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const projects = parsed.filter((p): p is ProjectData => Boolean(p && typeof p === 'object' && p.id));
    if (!projects.length) return;
    await saveLocalProjects(projects);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (error) {
    console.error('Legacy migration failed:', error);
  }
}

export async function loadLocalProjects(): Promise<ProjectData[]> {
  try {
    await migrateLegacyIfNeeded();
    const db = await openDb();
    const projects = await new Promise<ProjectData[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result || []) as ProjectData[]);
      req.onerror = () => reject(req.error);
    });
    return sortByRecent(projects);
  } catch (error) {
    console.error('Error loading projects:', error);
    const desktopProjects = await loadLocalProjectsFromDesktopFile();
    return desktopProjects || [];
  }
}

export async function saveLocalProjects(projects: ProjectData[]): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const clearReq = store.clear();
      
      clearReq.onerror = () => reject(clearReq.error);
      clearReq.onsuccess = () => {
        try {
          let putCount = 0;
          const totalPuts = projects.length;
          
          if (totalPuts === 0) {
            // If no projects, just complete the transaction
            tx.oncomplete = () => resolve();
            return;
          }
          
          projects.forEach((project) => {
            const putReq = store.put(project);
            putReq.onerror = () => reject(putReq.error);
            putReq.onsuccess = () => {
              putCount++;
              if (putCount === totalPuts) {
                // All puts completed, now resolve when transaction completes
                tx.oncomplete = () => resolve();
              }
            };
          });
        } catch (err) {
          reject(err);
        }
      };
      
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
    return true;
  } catch (error) {
    console.error('Error saving projects:', error);
    return saveLocalProjectsToDesktopFile(projects);
  }
}

export async function upsertLocalProject(project: ProjectData): Promise<ProjectData[]> {
  const projects = await loadLocalProjects();
  const existingIndex = projects.findIndex((currentProject) => currentProject.id === project.id);
  if (existingIndex >= 0) {
    projects[existingIndex] = project;
  } else {
    projects.unshift(project);
  }
  const saved = await saveLocalProjects(projects);
  if (!saved) throw new Error('Could not persist project to IndexedDB.');
  return loadLocalProjects();
}
