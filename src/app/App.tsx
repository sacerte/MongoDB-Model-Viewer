import { SyntheticEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Tabs, Tab, Box, IconButton, Tooltip, Button, CssBaseline } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Database, FileJson, Network, BookOpen, Upload, Download, FolderOpen, Save, CircleHelp, History, Settings, X, LogOut, Users, ShieldCheck } from 'lucide-react';
import MongoModelBuilder, { Model } from './components/MongoModelBuilder';
import JSONSchemaViewer from './components/JSONSchemaViewer';
import DiagramStudio, { CopiedAttributesDraft, CopiedCollectionDraft } from './components/DiagramStudio';
import DataDictionary from './components/DataDictionary';
import ProjectManager from './components/ProjectManager';
import ExportDialog from './components/ExportDialog';
import ImportDialog from './components/ImportDialog';
import TutorialDialog from './components/TutorialDialog';
import LoginScreen from './components/LoginScreen';
import CollaborationDialog from './components/CollaborationDialog';
import UserPermissionsDialog from './components/UserPermissionsDialog';
import AdminSettings from './components/AdminSettings';
import ProjectDocumentation from './components/ProjectDocumentation';
import { buildDefaultDiagramSheets, createProjectBundle, DiagramSheet, normalizeDiagramSheets, ProjectData, Relation } from './utils/projectBundle';
import { upsertLocalProject } from './utils/localProjects';
import { APP_VERSION } from './utils/appVersion';
import {
  buildDefaultPhotoSheetConfig,
  buildPhotoCollectionId,
  buildPhotoCollectionModel,
  shouldCreatePhotoCollectionForSheet
} from './utils/photoCollections';
import { AppLanguage, AppLanguageContext } from './i18n';
import { loadAppSettings, saveAppSettings } from './utils/appSettings';
import { isDesktopApp, isSupabaseConfigured, supabase } from './utils/supabase';
import { publishProject } from './utils/collaboration';
import { defaultPermissions, getMyPermissions } from './utils/appPermissions';

const APP_LANGUAGE_STORAGE_KEY = 'mongodb-model-viewer-language';
const COPIED_ATTRIBUTES_STORAGE_KEY = 'mongodb-model-viewer-copied-attributes';
const COPIED_COLLECTION_STORAGE_KEY = 'mongodb-model-viewer-copied-collection';
type ProjectDataWithSource = ProjectData & { sourceFilePath?: string };
interface UndoSnapshot {
  models: Model[];
  relations: Relation[];
  diagramSheets: DiagramSheet[];
  activeDiagramSheetId: string;
}

interface OpenProjectSession {
  sessionId: string;
  project: ProjectData;
  models: Model[];
  relations: Relation[];
  diagramSheets: DiagramSheet[];
  activeDiagramSheetId: string;
  aiContext: string;
  aiModel: string;
  undoStack: UndoSnapshot[];
  savedFingerprint: string;
}

function getProjectFingerprint(project: Pick<OpenProjectSession, 'models' | 'relations' | 'diagramSheets' | 'aiContext' | 'aiModel'>) {
  return JSON.stringify({
    models: project.models,
    relations: project.relations,
    diagramSheets: project.diagramSheets,
    aiContext: project.aiContext,
    aiModel: project.aiModel
  });
}

function MongoDBMark({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M32.1 5.2C25.4 13 21.4 23.8 21.4 34.8c0 10.7 3.7 18.6 10.7 24.1 7-5.5 10.7-13.4 10.7-24.1 0-11-4-21.8-10.7-29.6Z"
        fill="#10AA50"
      />
      <path
        d="M32.1 11.4c-1.8 4.7-2.8 10.2-2.8 16v24.8c.9 1.4 1.8 2.5 2.8 3.5 1-1 1.9-2.1 2.8-3.5V27.4c0-5.8-1-11.3-2.8-16Z"
        fill="#B8E986"
      />
    </svg>
  );
}

export default function App() {
  const [models, setModels] = useState<Model[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [diagramSheets, setDiagramSheets] = useState<DiagramSheet[]>(() => buildDefaultDiagramSheets());
  const diagramSheetsRef = useRef<DiagramSheet[]>(buildDefaultDiagramSheets());
  const modelsRef = useRef<Model[]>([]);
  const relationsRef = useRef<Relation[]>([]);
  const [activeDiagramSheetId, setActiveDiagramSheetId] = useState(buildDefaultDiagramSheets()[0].id);
  const activeDiagramSheetIdRef = useRef(activeDiagramSheetId);
  const currentProjectRef = useRef<ProjectData | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [currentProject, setCurrentProject] = useState<ProjectData | null>(null);
  const [showProjectManager, setShowProjectManager] = useState(true);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showTutorialDialog, setShowTutorialDialog] = useState(false);
  const [showCollaborationDialog, setShowCollaborationDialog] = useState(false);
  const [showUserPermissions, setShowUserPermissions] = useState(false);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [globalPermissions, setGlobalPermissions] = useState(() =>
    isDesktopApp ? { ...defaultPermissions, collaboration: true, editContent: true, settings: true } : defaultPermissions
  );
  const [showAdminSettings, setShowAdminSettings] = useState(false);
  const [appSettings, setAppSettings] = useState(loadAppSettings());
  const [aiContext, setAiContext] = useState('');
  const [aiModel, setAiModel] = useState(() => loadAppSettings().aiDefaultModel || 'openai/gpt-oss-120b:free');
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [openProjectSessions, setOpenProjectSessions] = useState<OpenProjectSession[]>([]);
  const [activeProjectSessionId, setActiveProjectSessionId] = useState<string | null>(null);
  const [copiedAttributes, setCopiedAttributes] = useState<CopiedAttributesDraft | null>(() =>
    readJsonFromStorage<CopiedAttributesDraft>(COPIED_ATTRIBUTES_STORAGE_KEY)
  );
  const [copiedCollection, setCopiedCollection] = useState<CopiedCollectionDraft | null>(() =>
    readJsonFromStorage<CopiedCollectionDraft>(COPIED_COLLECTION_STORAGE_KEY)
  );
  const diagramPdfExporterRef = useRef<(() => Promise<{ base64: string; fileName: string }> | null) | null>(null);
  const setDiagramPdfExporterRef = (exporter: (() => Promise<{ base64: string; fileName: string }> | null) | null) => {
    diagramPdfExporterRef.current = exporter;
  };
  const [appLanguage, setAppLanguage] = useState<AppLanguage>(() => {
    const savedLanguage = localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    return savedLanguage === 'en' ? 'en' : 'es';
  });
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [authenticated, setAuthenticated] = useState(!isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(Boolean(data.session));
      if (data.session) void getMyPermissions().then((p) => { setIsGlobalAdmin(p.is_admin); setGlobalPermissions(p.permissions); });
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session));
      if (session) void getMyPermissions().then((p) => { setIsGlobalAdmin(p.is_admin); setGlobalPermissions(p.permissions); });
      setAuthReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const sharedProjectId = currentProject?.sharedProjectId;
    if (!supabase || !sharedProjectId) return;
    const channel = supabase
      .channel(`shared-project-${sharedProjectId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shared_projects', filter: `id=eq.${sharedProjectId}` }, (payload) => {
        const remoteProject = (payload.new as { data?: ProjectData }).data;
        if (!remoteProject) return;
        const nextProject = { ...remoteProject, sharedProjectId, collaborationRole: currentProject.collaborationRole };
        modelsRef.current = nextProject.models || [];
        relationsRef.current = nextProject.relations || [];
        diagramSheetsRef.current = normalizeDiagramSheets(nextProject.diagramSheets, (nextProject.models || []).map((model) => model.id), nextProject.photoSheetConfig);
        currentProjectRef.current = nextProject;
        setCurrentProject(nextProject);
        setModels(nextProject.models || []);
        setRelations(nextProject.relations || []);
        setDiagramSheets(diagramSheetsRef.current);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentProject?.sharedProjectId]);

  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: 'dark',
          background: {
            default: '#2e2e2e',
            paper: '#3a3a3a'
          },
          text: {
            primary: '#f8fafc',
            secondary: 'rgba(226,232,240,0.78)'
          },
          divider: 'rgba(148,163,184,0.18)',
          primary: {
            main: '#2563eb'
          }
        },
        shape: {
          borderRadius: 12
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: {
                background: 'linear-gradient(135deg, #3f0071 0%, #111827 45%, #f97316 100%)',
                color: '#f8fafc'
              }
            }
          },
          MuiPaper: {
            styleOverrides: {
              root: {
                backgroundImage: 'none',
                border: '1px solid rgba(148,163,184,0.18)'
              }
            }
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                color: '#f8fafc',
                backgroundColor: 'rgba(15,23,42,0.28)',
                borderRadius: 10,
                '& fieldset': {
                  borderColor: 'rgba(148,163,184,0.24)'
                },
                '&:hover fieldset': {
                  borderColor: 'rgba(148,163,184,0.4)'
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#22d3ee'
                }
              },
              input: {
                color: '#f8fafc'
              }
            }
          },
          MuiInputLabel: {
            styleOverrides: {
              root: {
                color: 'rgba(226,232,240,0.82)',
                '&.Mui-focused': {
                  color: '#f8fafc'
                }
              }
            }
          },
          MuiButton: {
            styleOverrides: {
              root: {
                textTransform: 'none',
                borderRadius: 10,
                fontSize: '0.82rem',
                fontWeight: 600,
                minHeight: 32
              }
            }
          },
          MuiTab: {
            styleOverrides: {
              root: {
                color: 'rgba(226,232,240,0.72)',
                textTransform: 'none',
                '&.Mui-selected': {
                  color: '#ffffff'
                }
              }
            }
          },
          MuiDialog: {
            styleOverrides: {
              paper: {
                backgroundColor: '#2b2b2b',
                border: '1px solid rgba(148,163,184,0.22)',
                borderRadius: 14,
                color: '#f8fafc'
              }
            }
          },
          MuiDialogTitle: {
            styleOverrides: {
              root: {
                color: '#f8fafc',
                fontWeight: 700,
                borderBottom: '1px solid rgba(148,163,184,0.16)',
                paddingBottom: 10
              }
            }
          },
          MuiDialogContent: {
            styleOverrides: {
              root: {
                color: 'rgba(226,232,240,0.88)',
                paddingTop: 14
              }
            }
          },
          MuiDialogActions: {
            styleOverrides: {
              root: {
                borderTop: '1px solid rgba(148,163,184,0.16)',
                padding: '12px 16px'
              }
            }
          }
        }
      }),
    []
  );

  useEffect(() => {
    diagramSheetsRef.current = diagramSheets;
  }, [diagramSheets]);
  useEffect(() => {
    modelsRef.current = models;
  }, [models]);
  useEffect(() => {
    relationsRef.current = relations;
  }, [relations]);
  useEffect(() => {
    currentProjectRef.current = currentProject;
  }, [currentProject]);

  useEffect(() => {
    activeDiagramSheetIdRef.current = activeDiagramSheetId;
  }, [activeDiagramSheetId]);

  useEffect(() => {
    writeJsonToStorage(COPIED_ATTRIBUTES_STORAGE_KEY, copiedAttributes);
  }, [copiedAttributes]);

  useEffect(() => {
    writeJsonToStorage(COPIED_COLLECTION_STORAGE_KEY, copiedCollection);
  }, [copiedCollection]);

  useEffect(() => {
    const mcp = (window as unknown as { desktopApp?: { mcp?: { onRequest?: (channel: string, handler: (payload: Record<string, unknown>) => Promise<unknown>) => (() => void) | void } } }).desktopApp?.mcp;
    if (!mcp?.onRequest) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(
      mcp.onRequest('mcp:export-diagram-pdf-request', async (payload) => {
        const requestedSheet = typeof payload?.sheetName === 'string' ? payload.sheetName.trim() : '';
        const format = payload?.format === 'png' ? 'png' : 'pdf';
        const runExport = async (): Promise<{ base64: string; fileName: string }> => {
          if (!diagramPdfExporterRef.current) {
            throw new Error('El diagrama no está disponible (pestaña Diagram Studio no activa o sin colecciones)');
          }
          const result = await diagramPdfExporterRef.current(format);
          if (!result) {
            throw new Error('No hay colecciones para exportar en el diagrama');
          }
          return result;
        };

        if (requestedSheet) {
          const sheet = diagramSheetsRef.current.find(
            (candidate) => candidate.name.toLowerCase() === requestedSheet.toLowerCase()
          );
          if (!sheet) {
            const available = diagramSheetsRef.current.map((candidate) => candidate.name).join(', ');
            throw new Error(`No existe la hoja de diagrama "${requestedSheet}". Hojas disponibles: ${available}`);
          }
          const previousSheetId = activeDiagramSheetIdRef.current;
          if (sheet.id !== previousSheetId) {
            setActiveDiagramSheetId(sheet.id);
            // Esperar a que DiagramViewer remonte con la hoja pedida y registre su exportador.
            await new Promise((resolve) => setTimeout(resolve, 600));
          }
          try {
            const result = await runExport();
            return { ok: true, base64: result.base64, fileName: result.fileName };
          } finally {
            if (sheet.id !== previousSheetId) {
              setActiveDiagramSheetId(previousSheetId);
            }
          }
        }

        const result = await runExport();
        return { ok: true, base64: result.base64, fileName: result.fileName };
      })
    );

    unsubs.push(
      mcp.onRequest('mcp:export-dictionary-xlsx-request', async () => {
        const { buildDataDictionaryWorkbookBuffer } = await import('./utils/dataDictionary');
        const buffer = await buildDataDictionaryWorkbookBuffer(models);
        const uint8 = new Uint8Array(buffer as ArrayBuffer);
        let binary = '';
        for (let i = 0; i < uint8.length; i += 0x8000) {
          binary += String.fromCharCode(...uint8.subarray(i, i + 0x8000));
        }
        const safeName = (currentProject?.name || 'project').replace(/[^\w.-]+/g, '_');
        return {
          ok: true,
          base64: btoa(binary),
          fileName: `${safeName}_data_dictionary.xlsx`
        };
      })
    );

    unsubs.push(
      mcp.onRequest('mcp:export-collection-schemas-request', async (payload) => {
        const { generateValidationSchema, generateIndexExportPayload } = await import('./utils/mongoSchema');
        const filter = Array.isArray(payload?.collections) ? (payload.collections as string[]) : null;
        const requested = filter ? new Set(filter) : null;
        const results = (requested ? models.filter((model) => requested.has(model.name)) : models).map((model) => ({
          collection: model.name,
          validation: generateValidationSchema(model),
          indexes: (model.indexes || []).map((index) => ({
            name: index.name,
            type: index.type,
            definition: generateIndexExportPayload(model, index)
          }))
        }));
        const missing = requested ? Array.from(requested).filter((name) => !models.some((model) => model.name === name)) : [];
        if (missing.length > 0) {
          throw new Error(`Colecciones no encontradas en el modelo: ${missing.join(', ')}`);
        }
        return { ok: true, collections: results };
      })
    );

    return () => unsubs.forEach((unsub) => typeof unsub === 'function' && unsub());
  }, [models, currentProject]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === COPIED_ATTRIBUTES_STORAGE_KEY) {
        setCopiedAttributes(readJsonStorageValue<CopiedAttributesDraft>(event.newValue));
      }
      if (event.key === COPIED_COLLECTION_STORAGE_KEY) {
        setCopiedCollection(readJsonStorageValue<CopiedCollectionDraft>(event.newValue));
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const buildProjectSession = (project: ProjectData): OpenProjectSession => {
    const nextModels = deepClone(project.models || []);
    const nextRelations = deepClone(project.relations || []);
    const nextSheets = normalizeDiagramSheets(
      deepClone(project.diagramSheets),
      nextModels.map((model) => model.id),
      project.photoSheetConfig
    );

    return {
      sessionId: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      project: {
        ...project,
        aiContext: project.aiContext || '',
        aiModel: project.aiModel || 'openai/gpt-oss-120b:free',
        models: nextModels,
        relations: nextRelations,
        diagramSheets: nextSheets,
        photoSheetConfig: project.photoSheetConfig
      },
      models: nextModels,
      relations: nextRelations,
      diagramSheets: nextSheets,
      activeDiagramSheetId: nextSheets[0]?.id || buildDefaultDiagramSheets([], project.photoSheetConfig)[0].id,
      aiContext: project.aiContext || '',
      aiModel: project.aiModel || 'openai/gpt-oss-120b:free',
      undoStack: [],
      savedFingerprint: getProjectFingerprint({
        models: nextModels,
        relations: nextRelations,
        diagramSheets: nextSheets,
        aiContext: project.aiContext || '',
        aiModel: project.aiModel || 'openai/gpt-oss-120b:free'
      })
    };
  };

  const hydrateProjectSession = (session: OpenProjectSession) => {
    isSwitchingSessionRef.current = true;
    const nextModels = deepClone(session.models);
    const nextRelations = deepClone(session.relations);
    const nextSheets = deepClone(session.diagramSheets);
    const nextProject = {
      ...session.project,
      models: nextModels,
      relations: nextRelations,
      diagramSheets: nextSheets,
      aiContext: session.aiContext,
      aiModel: session.aiModel
    };

    modelsRef.current = nextModels;
    relationsRef.current = nextRelations;
    diagramSheetsRef.current = nextSheets;
    currentProjectRef.current = nextProject;
    setCurrentProject(nextProject);
    setModels(nextModels);
    setRelations(nextRelations);
    setDiagramSheets(nextSheets);
    setActiveDiagramSheetId(session.activeDiagramSheetId);
    setAiContext(session.aiContext);
    setAiModel(session.aiModel);
    setUndoStack(deepClone(session.undoStack));
    window.setTimeout(() => {
      isSwitchingSessionRef.current = false;
    }, 0);
  };

  useEffect(() => {
    if (isSwitchingSessionRef.current || !activeProjectSessionId || !currentProject) {
      return;
    }

    setOpenProjectSessions((currentSessions) =>
      currentSessions.map((session) =>
        session.sessionId === activeProjectSessionId
          ? {
              ...session,
              project: {
                ...currentProject,
                aiContext: aiContext.trim(),
                aiModel,
                models: deepClone(models),
                relations: deepClone(relations),
                diagramSheets: deepClone(diagramSheets)
              },
              models: deepClone(models),
              relations: deepClone(relations),
              diagramSheets: deepClone(diagramSheets),
              activeDiagramSheetId,
              aiContext: aiContext.trim(),
              aiModel,
              undoStack: deepClone(undoStack)
            }
          : session
      )
    );
  }, [activeDiagramSheetId, activeProjectSessionId, aiContext, aiModel, currentProject, diagramSheets, models, relations, undoStack]);

  const buildUndoSnapshot = (): UndoSnapshot => ({
    models: deepClone(modelsRef.current),
    relations: deepClone(relationsRef.current),
    diagramSheets: deepClone(diagramSheetsRef.current),
    activeDiagramSheetId
  });
  const isSwitchingSessionRef = useRef(false);

  const pushUndoSnapshot = () => {
    setUndoStack((currentStack) => [...currentStack.slice(-49), buildUndoSnapshot()]);
  };

  const resetUndoStack = () => {
    setUndoStack([]);
  };

  const handleUndo = () => {
    setUndoStack((currentStack) => {
      const previousSnapshot = currentStack[currentStack.length - 1];
      if (!previousSnapshot) {
        return currentStack;
      }

      const nextModels = deepClone(previousSnapshot.models);
      const nextRelations = deepClone(previousSnapshot.relations);
      const nextSheets = deepClone(previousSnapshot.diagramSheets);
      modelsRef.current = nextModels;
      relationsRef.current = nextRelations;
      diagramSheetsRef.current = nextSheets;
      setModels(nextModels);
      setRelations(nextRelations);
      setDiagramSheets(nextSheets);
      setActiveDiagramSheetId(previousSnapshot.activeDiagramSheetId);
      return currentStack.slice(0, -1);
    });
  };

  useEffect(() => {
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, appLanguage);
  }, [appLanguage]);
  useEffect(() => {
    saveAppSettings(appSettings);
  }, [appSettings]);
  useEffect(() => {
    if (!appSettings.enableDocumentation && activeTab === 4) {
      setActiveTab(0);
    }
  }, [appSettings.enableDocumentation, activeTab]);
  useEffect(() => {
    if (!appSettings.autosaveEnabled || !currentProjectRef.current) {
      return;
    }

    const intervalMs = Math.max(5, appSettings.autosaveIntervalSec || 60) * 1000;
    const timer = window.setInterval(() => {
      if (!currentProjectRef.current) {
        return;
      }
      persistCurrentProject(false);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [appSettings.autosaveEnabled, appSettings.autosaveIntervalSec, activeProjectSessionId, aiModel, aiContext]);

  const copy = useMemo(
    () =>
      appLanguage === 'es'
        ? {
            appTitle: 'MongoDB Schema Designer',
            appSubtitle: 'Diseña colecciones, índices y diagramas en un espacio de trabajo pensado para MongoDB.',
            projectLabel: 'Proyecto',
            helpTooltip: 'Guía de usuario',
            languageTooltip: 'Idioma',
            newProject: 'Nuevo proyecto',
            saveProject: 'Guardar proyecto',
            saveNewVersion: 'Guardar nueva versión',
            projects: 'Proyectos y colaboración',
            importJson: 'Importar esquema JSON',
            exportLabel: 'Exportar',
            tabDiagram: 'Diagram Studio',
            tabIndexes: 'Indexes',
            tabDictionary: 'Data Dictionary',
            tabSchema: 'JSON Schema',
            tabDocumentation: 'Documentacion',
            untitled: 'Sin título',
            savedProject: 'Proyecto guardado correctamente.',
            createProjectTitle: 'Crear proyecto nuevo',
            saveProjectTitle: 'Guardar proyecto',
            projectName: 'Nombre del proyecto',
            projectPlaceholder: 'Modelo Sanitario',
            createPhotosSheet: 'Crear hoja Fotos y colecciones automáticas _photo',
            cancel: 'Cancelar',
            create: 'Crear',
            save: 'Guardar'
          }
        : {
            appTitle: 'MongoDB Schema Designer',
            appSubtitle: 'Design collections, indexes and diagrams with a MongoDB-first workspace.',
            projectLabel: 'Project',
            helpTooltip: 'User Guide',
            languageTooltip: 'Language',
            newProject: 'New Project',
            saveProject: 'Save Project',
            saveNewVersion: 'Save New Version',
            projects: 'Projects & Collaboration',
            importJson: 'Import JSON Schema',
            exportLabel: 'Export',
            tabDiagram: 'Diagram Studio',
            tabIndexes: 'Indexes',
            tabDictionary: 'Data Dictionary',
            tabSchema: 'JSON Schema',
            tabDocumentation: 'Documentation',
            untitled: 'Untitled',
            savedProject: 'Project saved successfully!',
            createProjectTitle: 'Create New Project',
            saveProjectTitle: 'Save Project',
            projectName: 'Project Name',
            projectPlaceholder: 'Healthcare Model',
            createPhotosSheet: 'Create Fotos sheet and automatic _photo collections',
            cancel: 'Cancel',
            create: 'Create',
            save: 'Save'
          },
    [appLanguage]
  );

  const handleAddModel = (model: Model) => {
    pushUndoSnapshot();
    const photoSheetConfig = currentProject?.photoSheetConfig;
    const modelWithIndexes = {
      ...model,
      indexes: model.indexes || []
    };
    const shouldCreatePhotoModel =
      shouldCreatePhotoCollectionForSheet(activeDiagramSheetId, photoSheetConfig) && !modelWithIndexes.photoSourceModelId;
    const photoModelId = shouldCreatePhotoModel ? buildPhotoCollectionId(modelWithIndexes.id) : null;

    setModels((currentModels) => {
      const nextModels = [...currentModels, modelWithIndexes];
      if (!shouldCreatePhotoModel || !photoSheetConfig) {
        return nextModels;
      }

      const photoModel = buildPhotoCollectionModel(modelWithIndexes, nextModels);
      return [...nextModels, photoModel];
    });

    setDiagramSheets((currentSheets) => {
      const nextValidModelIds = [
        ...models.map((currentModel) => currentModel.id),
        modelWithIndexes.id,
        ...(photoModelId ? [photoModelId] : [])
      ];
      const normalizedSheets = normalizeDiagramSheets(currentSheets, nextValidModelIds, photoSheetConfig);

      return normalizedSheets.map((sheet) => {
        if (sheet.id === activeDiagramSheetId && !sheet.modelIds.includes(modelWithIndexes.id)) {
          return {
            ...sheet,
            modelIds: [...sheet.modelIds, modelWithIndexes.id]
          };
        }

        if (photoModelId && photoSheetConfig && sheet.id === photoSheetConfig.photosSheetId && !sheet.modelIds.includes(photoModelId)) {
          return {
            ...sheet,
            modelIds: [...sheet.modelIds, photoModelId]
          };
        }

        return sheet;
      });
    });
  };

  const handleUpdateModel = (updatedModel: Model) => {
    pushUndoSnapshot();
    const photoSheetConfig = currentProject?.photoSheetConfig;
    const shouldSyncPhotoModel = Boolean(photoSheetConfig?.enabled && !updatedModel.photoSourceModelId);
    const photoModelId = shouldSyncPhotoModel ? buildPhotoCollectionId(updatedModel.id) : null;
    const existingPhotoModel = photoModelId
      ? models.find((model) => model.photoSourceModelId === updatedModel.id || model.id === photoModelId) || null
      : null;

    setModels((currentModels) => {
      const nextModels = currentModels.map((model) => (model.id === updatedModel.id ? updatedModel : model));

      if (!shouldSyncPhotoModel || !photoSheetConfig || !photoModelId || !existingPhotoModel) {
        return nextModels;
      }

      const syncedPhotoModel = buildPhotoCollectionModel(updatedModel, nextModels, existingPhotoModel);

      return nextModels.map((model) => (model.id === existingPhotoModel.id ? syncedPhotoModel : model));
    });

    if (shouldSyncPhotoModel && photoSheetConfig && photoModelId && existingPhotoModel) {
      setDiagramSheets((currentSheets) => {
        const nextValidModelIds = Array.from(
          new Set([...models.filter((model) => model.id !== updatedModel.id).map((model) => model.id), updatedModel.id, photoModelId])
        );
        const normalizedSheets = normalizeDiagramSheets(currentSheets, nextValidModelIds, photoSheetConfig);

        return normalizedSheets.map((sheet) =>
          sheet.id === photoSheetConfig.photosSheetId && !sheet.modelIds.includes(photoModelId)
            ? {
                ...sheet,
                modelIds: [...sheet.modelIds, photoModelId]
              }
            : sheet
        );
      });
    }
  };

  const handleAddPhotoCollectionForModel = (sourceModelId: string) => {
    pushUndoSnapshot();
    const photoSheetConfig = currentProject?.photoSheetConfig;
    if (!photoSheetConfig?.enabled) {
      return;
    }

    const sourceModel = models.find((model) => model.id === sourceModelId);
    if (!sourceModel || sourceModel.photoSourceModelId) {
      return;
    }

    const existingPhotoModel =
      models.find(
        (model) => model.photoSourceModelId === sourceModelId || model.id === buildPhotoCollectionId(sourceModelId)
      ) || null;
    const photoModel = buildPhotoCollectionModel(sourceModel, models, existingPhotoModel);

    if (!existingPhotoModel) {
      setModels((currentModels) => [...currentModels, photoModel]);
    }

    setDiagramSheets((currentSheets) => {
      const nextValidModelIds = Array.from(new Set([...models.map((model) => model.id), photoModel.id]));
      const normalizedSheets = normalizeDiagramSheets(currentSheets, nextValidModelIds, photoSheetConfig);

      return normalizedSheets.map((sheet) =>
        sheet.id === photoSheetConfig.photosSheetId && !sheet.modelIds.includes(photoModel.id)
          ? {
              ...sheet,
              modelIds: [...sheet.modelIds, photoModel.id]
            }
          : sheet
      );
    });
  };

  const handleRemovePhotoCollectionForModel = (sourceModelId: string) => {
    pushUndoSnapshot();
    const photoSheetConfig = currentProject?.photoSheetConfig;
    if (!photoSheetConfig?.enabled) {
      return;
    }

    const photoModel =
      models.find(
        (model) => model.photoSourceModelId === sourceModelId || model.id === buildPhotoCollectionId(sourceModelId)
      ) || null;
    if (!photoModel) {
      return;
    }

    const nextModels = models.filter((model) => model.id !== photoModel.id);
    setModels(nextModels);
    setRelations((currentRelations) =>
      currentRelations.filter(
        (relation) => relation.fromModelId !== photoModel.id && relation.toModelId !== photoModel.id
      )
    );
    setDiagramSheets((currentSheets) =>
      normalizeDiagramSheets(
        currentSheets.map((sheet) => ({
          ...sheet,
          modelIds: sheet.modelIds.filter((modelId) => modelId !== photoModel.id)
        })),
        nextModels.map((model) => model.id),
        photoSheetConfig
      )
    );
  };

  const handleDeleteModel = (id: string) => {
    pushUndoSnapshot();
    const idsToDelete = new Set([id]);
    models.forEach((model) => {
      if (model.photoSourceModelId === id) {
        idsToDelete.add(model.id);
      }
    });

    const nextModels = models.filter((model) => !idsToDelete.has(model.id));
    setModels(nextModels);
    setRelations((currentRelations) =>
      currentRelations.filter((relation) => !idsToDelete.has(relation.fromModelId) && !idsToDelete.has(relation.toModelId))
    );
    setDiagramSheets((currentSheets) =>
      normalizeDiagramSheets(
        currentSheets.map((sheet) => ({
          ...sheet,
          modelIds: sheet.modelIds.filter((modelId) => !idsToDelete.has(modelId))
        })),
        nextModels.map((model) => model.id),
        currentProject?.photoSheetConfig
      )
    );
  };

  const handleLoadProject = (project: ProjectData) => {
    const existingSession = openProjectSessions.find((session) => session.project.id === project.id);
    if (existingSession) {
      setActiveProjectSessionId(existingSession.sessionId);
      hydrateProjectSession(existingSession);
      setShowProjectManager(false);
      return;
    }

    const nextSession = buildProjectSession(project);
    setOpenProjectSessions((currentSessions) => [...currentSessions, nextSession]);
    setActiveProjectSessionId(nextSession.sessionId);
    hydrateProjectSession(nextSession);
    setShowProjectManager(false);
  };

  const handleCreateNewProject = (projectName: string, projectAiContext: string, createPhotosSheet: boolean) => {
    const trimmedName = projectName.trim();
    if (!trimmedName) {
      return;
    }

    const now = new Date().toISOString();
    const photoSheetConfig = createPhotosSheet ? buildDefaultPhotoSheetConfig() : undefined;
    const nextSheets = buildDefaultDiagramSheets([], photoSheetConfig);
    const newProject: ProjectData = {
      id: Date.now().toString(),
      name: trimmedName,
      aiContext: projectAiContext.trim(),
      aiModel,
      models: [],
      relations: [],
      diagramSheets: nextSheets,
      photoSheetConfig,
      version: 1,
      versionHistory: [
        {
          version: 1,
          timestamp: now,
          note: 'Project created',
          snapshot: {
            models: [],
            relations: [],
            diagramSheets: nextSheets,
            photoSheetConfig,
          }
        }
      ],
      created_at: now,
      updated_at: now
    };

    void upsertLocalProject(newProject);
    const nextSession = buildProjectSession(newProject);
    setOpenProjectSessions((currentSessions) => [...currentSessions, nextSession]);
    setActiveProjectSessionId(nextSession.sessionId);
    hydrateProjectSession(nextSession);
    setActiveTab(0);
  };

  const handleImportModels = (importedModels: Model[]) => {
    pushUndoSnapshot();
    const nextModels = [...models, ...importedModels];
    setModels(nextModels);
    setDiagramSheets((currentSheets) =>
      currentSheets.map((sheet) =>
        sheet.id === activeDiagramSheetId
          ? {
              ...sheet,
              modelIds: Array.from(new Set([...sheet.modelIds, ...importedModels.map((model) => model.id)]))
            }
          : sheet
      )
    );
  };

  const handleImportProject = (project: ProjectData) => {
    const nextSession = buildProjectSession(project);
    setOpenProjectSessions((currentSessions) => [...currentSessions, nextSession]);
    setActiveProjectSessionId(nextSession.sessionId);
    hydrateProjectSession(nextSession);
  };

  const persistCurrentProject = (showAlert = false) => {
    if (!currentProjectRef.current) {
      if (showAlert) {
        setShowProjectManager(true);
      }
      return false;
    }

    const now = new Date().toISOString();
    const updatedProject: ProjectData = {
      ...currentProjectRef.current,
      aiContext: aiContext.trim(),
      aiModel,
      models: modelsRef.current,
      relations: relationsRef.current,
      diagramSheets: diagramSheetsRef.current,
      updated_at: now
    };

    const sourceFilePath = (currentProjectRef.current as ProjectDataWithSource)?.sourceFilePath;
    const desktopApp = (window as any)?.desktopApp;
    if (sourceFilePath && desktopApp?.writeTextFile) {
      const bundle = createProjectBundle(
        updatedProject.name,
        updatedProject.models,
        updatedProject.relations || [],
        updatedProject.diagramSheets,
        updatedProject
      );
      void desktopApp.writeTextFile(sourceFilePath, JSON.stringify(bundle, null, 2));
    }

    void upsertLocalProject(updatedProject);
    if (updatedProject.sharedProjectId) {
      void publishProject(updatedProject).catch((error) => console.warn('No se pudo sincronizar el proyecto compartido:', error));
    }
    currentProjectRef.current = updatedProject;
    setCurrentProject(updatedProject);
    setOpenProjectSessions((sessions) =>
      sessions.map((session) =>
        session.sessionId === activeProjectSessionId
          ? {
              ...session,
              project: updatedProject,
              models: deepClone(modelsRef.current),
              relations: deepClone(relationsRef.current),
              diagramSheets: deepClone(diagramSheetsRef.current),
              aiContext: aiContext.trim(),
              aiModel,
              savedFingerprint: getProjectFingerprint({
                models: modelsRef.current,
                relations: relationsRef.current,
                diagramSheets: diagramSheetsRef.current,
                aiContext: aiContext.trim(),
                aiModel
              })
            }
          : session
      )
    );
    if (showAlert) {
      alert(copy.savedProject);
    }
    return true;
  };

  const handleSaveProject = () => {
    persistCurrentProject(true);
  };

  const handleSaveNewVersion = () => {
    if (!currentProjectRef.current) {
      setShowProjectManager(true);
      return;
    }

    const now = new Date().toISOString();
    const nextVersion = (currentProjectRef.current.version || 1) + 1;
    const updatedProject: ProjectData = {
      ...currentProjectRef.current,
      aiContext: aiContext.trim(),
      aiModel,
      models: modelsRef.current,
      relations: relationsRef.current,
      diagramSheets: diagramSheetsRef.current,
      version: nextVersion,
      versionHistory: [
        ...(currentProjectRef.current.versionHistory || []),
        {
          version: nextVersion,
          timestamp: now,
          note: 'Project version saved',
          snapshot: {
            models: modelsRef.current,
            relations: relationsRef.current,
            diagramSheets: diagramSheetsRef.current,
            photoSheetConfig: currentProjectRef.current.photoSheetConfig,
          }
        }
      ],
      updated_at: now
    };

    const sourceFilePath = (currentProjectRef.current as ProjectDataWithSource)?.sourceFilePath;
    const desktopApp = (window as any)?.desktopApp;
    if (sourceFilePath && desktopApp?.writeTextFile) {
      const bundle = createProjectBundle(
        updatedProject.name,
        updatedProject.models,
        updatedProject.relations || [],
        updatedProject.diagramSheets,
        updatedProject
      );
      void desktopApp.writeTextFile(sourceFilePath, JSON.stringify(bundle, null, 2));
    }

    void upsertLocalProject(updatedProject);
    setCurrentProject(updatedProject);
    alert(copy.savedProject);
  };

  const handleEnablePhotosInCurrentProject = () => {
    pushUndoSnapshot();
    if (!currentProject || currentProject.photoSheetConfig?.enabled) {
      return;
    }

    const photoSheetConfig = buildDefaultPhotoSheetConfig();
    const nextModels = [...models];

    models
      .filter((model) => !model.photoSourceModelId)
      .forEach((sourceModel) => {
        const expectedPhotoId = buildPhotoCollectionId(sourceModel.id);
        const alreadyExists = nextModels.some(
          (model) => model.id === expectedPhotoId || model.photoSourceModelId === sourceModel.id
        );
        if (!alreadyExists) {
          nextModels.push(buildPhotoCollectionModel(sourceModel, nextModels));
        }
      });

    const nextSheetsBase = normalizeDiagramSheets(
      diagramSheetsRef.current,
      nextModels.map((model) => model.id),
      photoSheetConfig
    );
    const photoModelIds = nextModels.filter((model) => Boolean(model.photoSourceModelId)).map((model) => model.id);
    const nextSheets = nextSheetsBase.map((sheet) =>
      sheet.id === photoSheetConfig.photosSheetId
        ? {
            ...sheet,
            modelIds: Array.from(new Set([...(sheet.modelIds || []), ...photoModelIds]))
          }
        : sheet
    );

    const now = new Date().toISOString();
    const updatedProject: ProjectData = {
      ...currentProject,
      models: nextModels,
      relations,
      diagramSheets: nextSheets,
      photoSheetConfig,
      updated_at: now
    };

    void upsertLocalProject(updatedProject);
    setModels(nextModels);
    setDiagramSheets(nextSheets);
    setActiveDiagramSheetId(photoSheetConfig.photosSheetId);
    setCurrentProject(updatedProject);
  };

  const handleUpdateDiagramSheets = (nextSheets: DiagramSheet[]) => {
    pushUndoSnapshot();
    diagramSheetsRef.current = nextSheets;
    setDiagramSheets(nextSheets);
  };

  const handleUpdateRelations = (nextRelations: Relation[]) => {
    pushUndoSnapshot();
    relationsRef.current = nextRelations;
    setRelations(nextRelations);
  };

  const handleChangeProjectSession = (_: SyntheticEvent, nextSessionId: string) => {
    const targetSession = openProjectSessions.find((session) => session.sessionId === nextSessionId);
    if (!targetSession) {
      return;
    }

    isSwitchingSessionRef.current = true;
    setActiveProjectSessionId(targetSession.sessionId);
    hydrateProjectSession(targetSession);
  };

  const isSessionDirty = (session: OpenProjectSession) =>
    getProjectFingerprint(session) !== session.savedFingerprint;

  const persistProjectSession = (session: OpenProjectSession) => {
    const project: ProjectDataWithSource = {
      ...session.project,
      models: session.models,
      relations: session.relations,
      diagramSheets: session.diagramSheets,
      aiContext: session.aiContext.trim(),
      aiModel: session.aiModel,
      updated_at: new Date().toISOString()
    };
    const desktopApp = (window as any)?.desktopApp;
    if (project.sourceFilePath && desktopApp?.writeTextFile) {
      const bundle = createProjectBundle(project.name, project.models, project.relations || [], project.diagramSheets, project);
      void desktopApp.writeTextFile(project.sourceFilePath, JSON.stringify(bundle, null, 2));
    }
    void upsertLocalProject(project);
  };

  const handleCloseProjectSession = (sessionId: string) => {
    const session = openProjectSessions.find((item) => item.sessionId === sessionId);
    if (!session) return;
    if (isSessionDirty(session)) {
      const shouldSave = window.confirm(
        appLanguage === 'es'
          ? `Hay cambios sin guardar en “${session.project.name}”. Pulsa Aceptar para guardarlos antes de cerrar la pestaña, o Cancelar para descartarlos.`
          : `There are unsaved changes in “${session.project.name}”. Press OK to save before closing this tab, or Cancel to discard them.`
      );
      if (shouldSave) persistProjectSession(session);
    }
    const remaining = openProjectSessions.filter((item) => item.sessionId !== sessionId);
    setOpenProjectSessions(remaining);
    if (sessionId === activeProjectSessionId) {
      const nextSession = remaining[remaining.length - 1] || null;
      setActiveProjectSessionId(nextSession?.sessionId || null);
      if (nextSession) hydrateProjectSession(nextSession);
      else {
        setCurrentProject(null);
        setModels([]);
        setRelations([]);
        setDiagramSheets(buildDefaultDiagramSheets());
        setShowProjectManager(true);
      }
    }
  };

  useEffect(() => {
    const desktopApp = (window as any)?.desktopApp;
    if (!desktopApp?.onBeforeClose) return;
    return desktopApp.onBeforeClose(() => {
      const unsaved = openProjectSessions.filter(isSessionDirty);
      if (unsaved.length === 0) return true;
      const shouldSave = window.confirm(
        appLanguage === 'es'
          ? `Hay ${unsaved.length} proyecto(s) con cambios sin guardar. Pulsa Aceptar para guardarlos y cerrar; Cancelar para descartar los cambios y cerrar.`
          : `There are ${unsaved.length} project(s) with unsaved changes. Press OK to save and close; Cancel to discard changes and close.`
      );
      if (shouldSave) unsaved.forEach(persistProjectSession);
      return true;
    });
  }, [appLanguage, openProjectSessions]);


  if (!authReady) {
    return <div className="grid h-full place-items-center bg-slate-900 text-slate-100">Cargando acceso seguro…</div>;
  }

  if (isSupabaseConfigured && !authenticated) {
    return <LoginScreen onAuthenticated={() => setAuthenticated(true)} />;
  }

  const collaborationRole = currentProject?.collaborationRole;
  const canEditProject = collaborationRole !== 'viewer';
  const isProjectAdmin = !collaborationRole || collaborationRole === 'owner';

  return (
    <AppLanguageContext.Provider value={{ language: appLanguage, setLanguage: setAppLanguage }}>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        <div className="app-shell size-full flex flex-col bg-[#2e2e2e] text-slate-100">
        <div className="border-b border-border px-6 pt-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 shadow-[0_8px_24px_rgba(16,170,80,0.16)]">
                <MongoDBMark className="h-7 w-7" />
              </div>

              <div>
                <h1 className="leading-tight text-slate-100">{copy.appTitle}</h1>
                <div className="mt-1 text-sm text-slate-300">{copy.appSubtitle}</div>
              {currentProject && (
                <p className="mt-2 text-sm text-slate-300">
                  {copy.projectLabel}: {currentProject.name}
                </p>
              )}
              {!!aiContext.trim() && (
                <p className="mt-1 text-xs text-slate-400">
                  {appLanguage === 'es' ? 'Contexto IA activo:' : 'Active AI context:'} {aiContext.trim()}
                </p>
              )}
              </div>
            </div>

            <div className="flex gap-2 text-slate-100">
              <span className="self-center text-xs font-medium text-slate-300">v{APP_VERSION} · {isDesktopApp ? 'Desktop' : 'Web'}</span>
              <Tooltip title={copy.helpTooltip}>
                <IconButton onClick={() => setShowTutorialDialog(true)} size="small" sx={{ color: '#f8fafc' }}>
                  <CircleHelp className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copy.languageTooltip}>
                <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1">
                  <Button
                    size="small"
                    variant={appLanguage === 'es' ? 'contained' : 'text'}
                    onClick={() => setAppLanguage('es')}
                    sx={{
                      minWidth: 36,
                      color: appLanguage === 'es' ? '#f8fafc' : '#cbd5e1',
                      backgroundColor: appLanguage === 'es' ? 'rgba(30,41,59,0.95)' : 'transparent',
                      borderRadius: '9999px',
                      '&:hover': {
                        backgroundColor: appLanguage === 'es' ? 'rgba(51,65,85,0.95)' : 'rgba(51,65,85,0.45)'
                      }
                    }}
                  >
                    ES
                  </Button>
                  <Button
                    size="small"
                    variant={appLanguage === 'en' ? 'contained' : 'text'}
                    onClick={() => setAppLanguage('en')}
                    sx={{
                      minWidth: 36,
                      color: appLanguage === 'en' ? '#f8fafc' : '#cbd5e1',
                      backgroundColor: appLanguage === 'en' ? 'rgba(30,41,59,0.95)' : 'transparent',
                      borderRadius: '9999px',
                      '&:hover': {
                        backgroundColor: appLanguage === 'en' ? 'rgba(51,65,85,0.95)' : 'rgba(51,65,85,0.45)'
                      }
                    }}
                  >
                    EN
                  </Button>
                </div>
              </Tooltip>
              {isSupabaseConfigured && globalPermissions.collaboration && (
                <Tooltip title={appLanguage === 'es' ? 'Colaborar' : 'Collaborate'}>
                  <IconButton onClick={() => setShowCollaborationDialog(true)} size="small" sx={{ color: '#f8fafc' }}>
                    <Users className="w-5 h-5" />
                  </IconButton>
                </Tooltip>
              )}
              {isProjectAdmin && globalPermissions.projects && <Tooltip title={copy.newProject}>
                <IconButton onClick={() => setShowProjectManager(true)} size="small" sx={{ color: '#f8fafc' }}>
                  <FolderOpen className="w-5 h-5" />
                </IconButton>
              </Tooltip>}
              {canEditProject && globalPermissions.editContent && <Tooltip title={copy.saveProject}>
                <IconButton onClick={handleSaveProject} size="small" sx={{ color: '#f8fafc' }}>
                  <Save className="w-5 h-5" />
                </IconButton>
              </Tooltip>}
              {canEditProject && globalPermissions.editContent && <Tooltip title={copy.saveNewVersion}>
                <IconButton onClick={handleSaveNewVersion} size="small" sx={{ color: '#f8fafc' }}>
                  <History className="w-5 h-5" />
                </IconButton>
              </Tooltip>}
              {canEditProject && globalPermissions.importExport && <Tooltip title={copy.importJson}>
                <IconButton onClick={() => setShowImportDialog(true)} size="small" sx={{ color: '#f8fafc' }}>
                  <Upload className="w-5 h-5" />
                </IconButton>
              </Tooltip>}
              {globalPermissions.importExport && <Tooltip title={copy.exportLabel}>
                <IconButton onClick={() => setShowExportDialog(true)} size="small" sx={{ color: '#f8fafc' }}>
                  <Download className="w-5 h-5" />
                </IconButton>
              </Tooltip>}
              {isGlobalAdmin && <Tooltip title="Usuarios y permisos"><IconButton onClick={() => setShowUserPermissions(true)} size="small" sx={{ color: '#facc15' }}><ShieldCheck className="w-5 h-5" /></IconButton></Tooltip>}
              {isProjectAdmin && globalPermissions.settings && <Tooltip title={copy.importJson}>
                <IconButton onClick={() => setShowAdminSettings(true)} size="small" sx={{ color: '#f8fafc' }}>
                  <Settings className="w-5 h-5" />
                </IconButton>
              </Tooltip>}
              {isSupabaseConfigured && (
                <Tooltip title={appLanguage === 'es' ? 'Cerrar sesión' : 'Sign out'}>
                  <IconButton onClick={() => void supabase?.auth.signOut()} size="small" sx={{ color: '#f8fafc' }} aria-label={appLanguage === 'es' ? 'Cerrar sesión' : 'Sign out'}>
                    <LogOut className="w-5 h-5" />
                  </IconButton>
                </Tooltip>
              )}
            </div>
          </div>

          {openProjectSessions.length > 0 && (
            <Tabs
              value={activeProjectSessionId}
              onChange={handleChangeProjectSession}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                minHeight: 40,
                '& .MuiTab-root': {
                  minHeight: 40,
                  alignItems: 'flex-start'
                }
              }}
            >
              {openProjectSessions.map((session) => (
                <Tab
                  key={session.sessionId}
                  value={session.sessionId}
                  label={
                    <span className="flex items-center gap-1">
                      <span>{session.project.name}{isSessionDirty(session) ? ' *' : ''}</span>
                      <span
                        role="button"
                        aria-label={appLanguage === 'es' ? `Cerrar ${session.project.name}` : `Close ${session.project.name}`}
                        className="ml-1 inline-flex rounded p-0.5 hover:bg-white/15"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCloseProjectSession(session.sessionId);
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </span>
                    </span>
                  }
                />
              ))}
            </Tabs>
          )}

          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
            <Tab
              sx={{ display: globalPermissions.diagram ? undefined : 'none' }}
              icon={<Network className="w-4 h-4" />}
              label={copy.tabDiagram}
              iconPosition="start"
            />
            <Tab
              sx={{ display: globalPermissions.indexes ? undefined : 'none' }}
              icon={<Database className="w-4 h-4" />}
              label={copy.tabIndexes}
              iconPosition="start"
            />
            <Tab
              sx={{ display: globalPermissions.dictionary ? undefined : 'none' }}
              icon={<BookOpen className="w-4 h-4" />}
              label={copy.tabDictionary}
              iconPosition="start"
            />
            <Tab
              sx={{ display: globalPermissions.schema ? undefined : 'none' }}
              icon={<FileJson className="w-4 h-4" />}
              label={copy.tabSchema}
              iconPosition="start"
            />
            {appSettings.enableDocumentation && globalPermissions.documentation && (
              <Tab
                icon={<BookOpen className="w-4 h-4" />}
                label={copy.tabDocumentation}
                iconPosition="start"
              />
            )}
          </Tabs>
        </div>

        <Box className="flex-1 overflow-hidden">
          {activeTab === 0 && globalPermissions.diagram && (
            <DiagramStudio
              models={models}
              relations={relations}
              diagramSheets={diagramSheets}
              activeDiagramSheetId={activeDiagramSheetId}
              projectName={currentProject?.name || copy.untitled}
              photoSheetConfig={currentProject?.photoSheetConfig}
              onAddModel={canEditProject ? handleAddModel : () => {}}
              onUpdateModel={canEditProject ? handleUpdateModel : () => {}}
              onDeleteModel={canEditProject ? handleDeleteModel : () => {}}
              onAddPhotoCollection={canEditProject ? handleAddPhotoCollectionForModel : () => {}}
              onRemovePhotoCollection={canEditProject ? handleRemovePhotoCollectionForModel : () => {}}
              onUpdateRelations={canEditProject ? handleUpdateRelations : () => {}}
              onUpdateDiagramSheets={canEditProject ? handleUpdateDiagramSheets : () => {}}
              onChangeActiveDiagramSheetId={setActiveDiagramSheetId}
              canUndo={undoStack.length > 0}
              onUndo={handleUndo}
              onExportPdfReady={setDiagramPdfExporterRef}
              copiedAttributes={copiedAttributes}
              onCopiedAttributesChange={setCopiedAttributes}
              copiedCollection={copiedCollection}
              onCopiedCollectionChange={setCopiedCollection}
            />
          )}
          {activeTab === 1 && globalPermissions.indexes && (
            <MongoModelBuilder
              models={models}
              onUpdateModel={canEditProject ? handleUpdateModel : () => {}}
            />
          )}
          {activeTab === 2 && globalPermissions.dictionary && (
            <DataDictionary
              models={models}
              projectName={currentProject?.name || copy.untitled}
              aiContext={aiContext}
              aiModel={aiModel}
              onUpdateAiContext={canEditProject ? setAiContext : () => {}}
              onUpdateAiModel={canEditProject ? setAiModel : () => {}}
              onUpdateModel={canEditProject ? handleUpdateModel : () => {}}
              aiApiKey={appSettings.aiApiKey}
              aiBaseUrl={appSettings.aiBaseUrl}
              aiCustomModels={appSettings.aiCustomModels}
            />
          )}
          {activeTab === 3 && globalPermissions.schema && <JSONSchemaViewer models={models} />}
          {activeTab === 4 && globalPermissions.documentation && appSettings.enableDocumentation && (
            <ProjectDocumentation
              projectName={currentProject?.name || copy.untitled}
              models={models}
              documentation={currentProject?.documentation || { enabled: true, collections: {}, indexes: {} }}
              aiContext={aiContext}
              aiModel={aiModel}
              aiApiKey={appSettings.aiApiKey}
              aiBaseUrl={appSettings.aiBaseUrl}
              onUpdateDocumentation={canEditProject ? (nextDocumentation) => {
                setCurrentProject((previousProject) =>
                  previousProject
                    ? { ...previousProject, documentation: nextDocumentation }
                    : previousProject
                );
              } : () => {}}
            />
          )}
        </Box>

        <Suspense fallback={null}>
          <ProjectManager
            open={showProjectManager}
            onClose={() => setShowProjectManager(false)}
            currentProject={currentProject}
            models={models}
            relations={relations}
            diagramSheets={diagramSheets}
            onLoadProject={handleLoadProject}
            onUpdateProject={setCurrentProject}
            onCreateProject={handleCreateNewProject}
            onEnablePhotosInCurrentProject={handleEnablePhotosInCurrentProject}
            appSettings={appSettings}
            onUpdateAppSettings={setAppSettings}
          />

          <TutorialDialog
            open={showTutorialDialog}
            onClose={() => setShowTutorialDialog(false)}
            projectName={currentProject?.name || copy.untitled}
            language={appLanguage}
            onChangeLanguage={setAppLanguage}
            appVersion={APP_VERSION}
          />

          <CollaborationDialog
            open={showCollaborationDialog}
            onClose={() => setShowCollaborationDialog(false)}
            project={currentProject ? { ...currentProject, models, relations, diagramSheets } : null}
            onProjectShared={(sharedProjectId) => {
              if (currentProject) setCurrentProject({ ...currentProject, sharedProjectId, collaborationRole: 'owner' });
            }}
            onProjectJoined={(project) => {
              setShowProjectManager(false);
              handleImportProject(project);
            }}
          />

          <UserPermissionsDialog open={showUserPermissions} onClose={() => setShowUserPermissions(false)} />

          <ExportDialog
            open={showExportDialog}
            onClose={() => setShowExportDialog(false)}
            models={models}
            projectName={currentProject?.name || copy.untitled}
            currentProject={currentProject}
            relations={relations}
            diagramSheets={diagramSheets}
          />

          <ImportDialog
            open={showImportDialog}
            onClose={() => setShowImportDialog(false)}
            onImport={handleImportModels}
            onImportProject={handleImportProject}
          />
          {isProjectAdmin && <AdminSettings
            open={showAdminSettings}
            settings={appSettings}
            onClose={() => setShowAdminSettings(false)}
            onSave={(nextSettings) => {
              setAppSettings(nextSettings);
              setAiModel(nextSettings.aiDefaultModel || aiModel);
              if (nextSettings.enableDocumentation) {
                setCurrentProject((previousProject) =>
                  previousProject
                    ? {
                        ...previousProject,
                        documentation: {
                          enabled: true,
                          collections: previousProject.documentation?.collections || {},
                          indexes: previousProject.documentation?.indexes || {},
                          modelDescription: previousProject.documentation?.modelDescription || ''
                        }
                      }
                    : previousProject
                );
              }
              setShowAdminSettings(false);
            }}
          />}
        </Suspense>

        
        </div>
      </ThemeProvider>
    </AppLanguageContext.Provider>
  );
}

function deepClone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function readJsonStorageValue<T>(rawValue: string | null): T | null {
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return null;
  }
}

function readJsonFromStorage<T>(storageKey: string): T | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return readJsonStorageValue<T>(window.localStorage.getItem(storageKey));
}

function writeJsonToStorage(storageKey: string, value: unknown) {
  if (typeof window === 'undefined') {
    return;
  }

  if (value === null) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(value));
}
