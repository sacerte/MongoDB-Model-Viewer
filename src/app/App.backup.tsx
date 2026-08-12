import { useEffect, useMemo, useState } from 'react';
import { Tabs, Tab, Box, IconButton, Tooltip, Button, CssBaseline } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Database, FileJson, Network, BookOpen, Upload, Download, FolderOpen, Save, CircleHelp, History } from 'lucide-react';
import MongoModelBuilder, { Model } from './components/MongoModelBuilder';
import JSONSchemaViewer from './components/JSONSchemaViewer';
import DiagramStudio from './components/DiagramStudio';
import DataDictionary from './components/DataDictionary';
import ProjectManager from './components/ProjectManager';
import ExportDialog from './components/ExportDialog';
import ImportDialog from './components/ImportDialog';
import TutorialDialog from './components/TutorialDialog';
import { buildDefaultDiagramSheets, DiagramSheet, normalizeDiagramSheets, ProjectData, Relation } from './utils/projectBundle';
import { upsertLocalProject } from './utils/localProjects';
import {
  buildDefaultPhotoSheetConfig,
  buildPhotoCollectionId,
  buildPhotoCollectionModel,
  shouldCreatePhotoCollectionForSheet
} from './utils/photoCollections';
import { AppLanguage, AppLanguageContext } from './i18n';

const APP_LANGUAGE_STORAGE_KEY = 'mongodb-model-viewer-language';

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
  const [activeDiagramSheetId, setActiveDiagramSheetId] = useState(buildDefaultDiagramSheets()[0].id);
  const [activeTab, setActiveTab] = useState(0);
  const [currentProject, setCurrentProject] = useState<ProjectData | null>(null);
  const [showProjectManager, setShowProjectManager] = useState(true);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showTutorialDialog, setShowTutorialDialog] = useState(false);
  const [aiContext, setAiContext] = useState('');
  const [aiModel, setAiModel] = useState('openai/gpt-oss-120b:free');
  const [appLanguage, setAppLanguage] = useState<AppLanguage>(() => {
    const savedLanguage = localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    return savedLanguage === 'en' ? 'en' : 'es';
  });

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
    localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, appLanguage);
  }, [appLanguage]);

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
            untitled: 'Sin título',
            savedProject: 'Proyecto guardado correctamente.',
            createProjectTitle: 'Crear proyecto nuevo',
            saveProjectTitle: 'Guardar proyecto',
            projectName: 'Nombre del proyecto',
            projectPlaceholder: 'Modelo Sanitario',
            createPhotosSheet: 'Crear hoja Fotos y colecciones automáticas _photos',
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
            untitled: 'Untitled',
            savedProject: 'Project saved successfully!',
            createProjectTitle: 'Create New Project',
            saveProjectTitle: 'Save Project',
            projectName: 'Project Name',
            projectPlaceholder: 'Healthcare Model',
            createPhotosSheet: 'Create Fotos sheet and automatic _photos collections',
            cancel: 'Cancel',
            create: 'Create',
            save: 'Save'
          },
    [appLanguage]
  );

  const handleAddModel = (model: Model) => {
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
    const nextModels = project.models || [];
    const nextSheets = normalizeDiagramSheets(
      project.diagramSheets,
      nextModels.map((model) => model.id),
      project.photoSheetConfig
    );
    setCurrentProject({
      ...project,
      aiContext: project.aiContext || '',
      aiModel: project.aiModel || 'openai/gpt-oss-120b:free',
      models: nextModels,
      relations: project.relations || [],
      diagramSheets: nextSheets,
      photoSheetConfig: project.photoSheetConfig
    });
    setAiContext(project.aiContext || '');
    setAiModel(project.aiModel || 'openai/gpt-oss-120b:free');
    setModels(nextModels);
    setRelations(project.relations || []);
    setDiagramSheets(nextSheets);
    setActiveDiagramSheetId(nextSheets[0]?.id || buildDefaultDiagramSheets([], project.photoSheetConfig)[0].id);
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

    upsertLocalProject(newProject);
    setModels([]);
    setRelations([]);
    setDiagramSheets(nextSheets);
    setActiveDiagramSheetId(nextSheets[0].id);
    setCurrentProject(newProject);
    setActiveTab(0);
    setAiContext(projectAiContext.trim());
  };

  const handleImportModels = (importedModels: Model[]) => {
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
    const nextModels = project.models || [];
    const nextSheets = normalizeDiagramSheets(
      project.diagramSheets,
      nextModels.map((model) => model.id),
      project.photoSheetConfig
    );
    setCurrentProject({
      ...project,
      aiContext: project.aiContext || '',
      aiModel: project.aiModel || 'openai/gpt-oss-120b:free',
      models: nextModels,
      relations: project.relations || [],
      diagramSheets: nextSheets,
      photoSheetConfig: project.photoSheetConfig
    });
    setAiContext(project.aiContext || '');
    setAiModel(project.aiModel || 'openai/gpt-oss-120b:free');
    setModels(nextModels);
    setRelations(project.relations || []);
    setDiagramSheets(nextSheets);
    setActiveDiagramSheetId(nextSheets[0]?.id || buildDefaultDiagramSheets([], project.photoSheetConfig)[0].id);
  };

  const handleSaveProject = () => {
    if (!currentProject) {
      setProjectDialogMode('save');
      setPendingProjectName('');
      setAiContext(currentProject?.aiContext || '');
      setAiModel(currentProject?.aiModel || 'openai/gpt-oss-120b:free');
      setShowProjectNameDialog(true);
      return;
    }

    const now = new Date().toISOString();
    const updatedProject: ProjectData = {
      ...currentProject,
      aiContext: aiContext.trim(),
      aiModel,
      models,
      relations,
      diagramSheets,
      updated_at: now
    };

    upsertLocalProject(updatedProject);
    setCurrentProject(updatedProject);
    alert(copy.savedProject);
  };

  const handleSaveNewVersion = () => {
    if (!currentProject) {
      handleSaveProject();
      return;
    }

    const now = new Date().toISOString();
    const nextVersion = (currentProject.version || 1) + 1;
    const updatedProject: ProjectData = {
      ...currentProject,
      aiContext: aiContext.trim(),
      aiModel,
      models,
      relations,
      diagramSheets,
      version: nextVersion,
      versionHistory: [
        ...(currentProject.versionHistory || []),
        {
          version: nextVersion,
          timestamp: now,
          note: 'Project version saved',
          snapshot: {
            models,
            relations,
            diagramSheets,
            photoSheetConfig: currentProject.photoSheetConfig,
          }
        }
      ],
      updated_at: now
    };

    upsertLocalProject(updatedProject);
    setCurrentProject(updatedProject);
    alert(copy.savedProject);
  };


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
              <Tooltip title={copy.helpTooltip}>
                <IconButton onClick={() => setShowTutorialDialog(true)} size="small" sx={{ color: '#f8fafc' }}>
                  <CircleHelp className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copy.languageTooltip}>
                <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1">
                  <Button size="small" variant={appLanguage === 'es' ? 'contained' : 'text'} onClick={() => setAppLanguage('es')}>
                    ES
                  </Button>
                  <Button size="small" variant={appLanguage === 'en' ? 'contained' : 'text'} onClick={() => setAppLanguage('en')}>
                    EN
                  </Button>
                </div>
              </Tooltip>
              <Tooltip title={copy.newProject}>
                <IconButton onClick={() => setShowProjectManager(true)} size="small" sx={{ color: '#f8fafc' }}>
                  <FolderOpen className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copy.saveProject}>
                <IconButton onClick={handleSaveProject} size="small" sx={{ color: '#f8fafc' }}>
                  <Save className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copy.saveNewVersion}>
                <IconButton onClick={handleSaveNewVersion} size="small" sx={{ color: '#f8fafc' }}>
                  <History className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copy.importJson}>
                <IconButton onClick={() => setShowImportDialog(true)} size="small" sx={{ color: '#f8fafc' }}>
                  <Upload className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copy.exportLabel}>
                <IconButton onClick={() => setShowExportDialog(true)} size="small" sx={{ color: '#f8fafc' }}>
                  <Download className="w-5 h-5" />
                </IconButton>
              </Tooltip>
            </div>
          </div>

          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
            <Tab
              icon={<Network className="w-4 h-4" />}
              label={copy.tabDiagram}
              iconPosition="start"
            />
            <Tab
              icon={<Database className="w-4 h-4" />}
              label={copy.tabIndexes}
              iconPosition="start"
            />
            <Tab
              icon={<BookOpen className="w-4 h-4" />}
              label={copy.tabDictionary}
              iconPosition="start"
            />
            <Tab
              icon={<FileJson className="w-4 h-4" />}
              label={copy.tabSchema}
              iconPosition="start"
            />
          </Tabs>
        </div>

        <Box className="flex-1 overflow-hidden">
          {activeTab === 0 && (
            <DiagramStudio
              models={models}
              relations={relations}
              diagramSheets={diagramSheets}
              activeDiagramSheetId={activeDiagramSheetId}
              projectName={currentProject?.name || copy.untitled}
              photoSheetConfig={currentProject?.photoSheetConfig}
              onAddModel={handleAddModel}
              onUpdateModel={handleUpdateModel}
              onDeleteModel={handleDeleteModel}
              onAddPhotoCollection={handleAddPhotoCollectionForModel}
              onRemovePhotoCollection={handleRemovePhotoCollectionForModel}
              onUpdateRelations={setRelations}
              onUpdateDiagramSheets={setDiagramSheets}
              onChangeActiveDiagramSheetId={setActiveDiagramSheetId}
            />
          )}
          {activeTab === 1 && (
            <MongoModelBuilder
              models={models}
              onAddModel={handleAddModel}
              onUpdateModel={handleUpdateModel}
              onDeleteModel={handleDeleteModel}
            />
          )}
          {activeTab === 2 && (
            <DataDictionary
              models={models}
              projectName={currentProject?.name || copy.untitled}
              aiContext={aiContext}
              aiModel={aiModel}
              onUpdateAiContext={setAiContext}
              onUpdateAiModel={setAiModel}
              onUpdateModel={handleUpdateModel}
            />
          )}
          {activeTab === 3 && <JSONSchemaViewer models={models} />}
        </Box>

        <ProjectManager
          open={showProjectManager}
          onClose={() => setShowProjectManager(false)}
          currentProject={currentProject}
          models={models}
          relations={relations}
          diagramSheets={diagramSheets}
          onLoadProject={handleLoadProject}
          onUpdateProject={setCurrentProject}
        />

        <TutorialDialog
          open={showTutorialDialog}
          onClose={() => setShowTutorialDialog(false)}
          projectName={currentProject?.name || copy.untitled}
          language={appLanguage}
          onChangeLanguage={setAppLanguage}
        />

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

        <Dialog
          open={showProjectNameDialog}
          onClose={() => {
            setShowProjectNameDialog(false);
            setPendingProjectName('');
            setAiContext(currentProject?.aiContext || '');
            setPendingCreatePhotosSheet(false);
          }}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>{projectDialogMode === 'new' ? copy.createProjectTitle : copy.saveProjectTitle}</DialogTitle>
          <DialogContent>
            <div className="pt-2">
              <TextField
                autoFocus
                fullWidth
                label={copy.projectName}
                value={pendingProjectName}
                onChange={(e) => setPendingProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmitProjectDialog();
                  }
                }}
                placeholder={copy.projectPlaceholder}
              />
              {projectDialogMode === 'new' && (
                <TextField
                  fullWidth
                  sx={{ mt: 2 }}
                  label={appLanguage === 'es' ? 'Contexto para IA' : 'AI context'}
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  placeholder={appLanguage === 'es' ? 'Ej: contexto clínico, facturación, autorizaciones' : 'e.g. clinical, billing, authorizations'}
                />
              )}
              {projectDialogMode === 'new' && (
                <div className="pt-4">
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={pendingCreatePhotosSheet}
                        onChange={(e) => setPendingCreatePhotosSheet(e.target.checked)}
                      />
                    }
                    label={copy.createPhotosSheet}
                  />
                </div>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setShowProjectNameDialog(false);
                setPendingProjectName('');
                setPendingCreatePhotosSheet(false);
              }}
            >
              {copy.cancel}
            </Button>
            <Button variant="contained" onClick={handleSubmitProjectDialog}>
              {projectDialogMode === 'new' ? copy.create : copy.save}
            </Button>
          </DialogActions>
        </Dialog>
        </div>
      </ThemeProvider>
    </AppLanguageContext.Provider>
  );
}




