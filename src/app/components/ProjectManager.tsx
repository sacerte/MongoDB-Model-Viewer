import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Tabs,
  Tab,
  Box,
  Alert,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import { Model } from './MongoModelBuilder';
import { Trash2, Download, Save, Plus, RotateCcw } from 'lucide-react';
import JSON5 from 'json5';
import {
  DiagramSheet,
  buildDefaultDiagramSheets,
  createProjectBundle,
  isLegacyProjectData,
  isProjectBundle,
  ProjectData,
  Relation
} from '../utils/projectBundle';
import { loadLocalProjects, saveLocalProjects, upsertLocalProject } from '../utils/localProjects';
import { loadProjectsFromVirtualSync, saveProjectsToVirtualSync } from '../utils/syncProjects';
import { useAppLanguage } from '../i18n';
import { AppSettings } from '../utils/appSettings';

declare global {
  interface Window {
    desktopApp?: {
      platform?: string;
      onOpenFile?: (handler: (filePath: string) => void) => (() => void) | void;
      getPendingOpenFile?: () => Promise<string | null>;
      clearPendingOpenFile?: (filePath?: string | null) => Promise<boolean>;
      readTextFile?: (filePath: string) => Promise<{ ok: boolean; content?: string; modifiedAt?: string; error?: string }>;
      writeTextFile?: (filePath: string, content: string) => Promise<{ ok: boolean; error?: string }>;
      sync?: {
        selectFolder: () => Promise<string | null>;
        writeProjects: (folderPath: string, projects: ProjectData[]) => Promise<{ ok: boolean; error?: string }>;
        readProjects: (folderPath: string) => Promise<{ ok: boolean; projects: ProjectData[]; error?: string }>;
      };
    };
  }
}

type ProjectDataWithSource = ProjectData & { sourceFilePath?: string };

interface Props {
  open: boolean;
  onClose: () => void;
  currentProject: ProjectDataWithSource | null;
  models: Model[];
  relations: Relation[];
  diagramSheets: DiagramSheet[];
  onLoadProject: (project: ProjectDataWithSource) => void;
  onUpdateProject: (project: ProjectDataWithSource | null) => void;
  onCreateProject: (projectName: string, aiContext: string, createPhotosSheet: boolean) => void;
  onEnablePhotosInCurrentProject: () => void;
  appSettings: AppSettings;
  onUpdateAppSettings: (settings: AppSettings) => void;
}

export default function ProjectManager({
  open,
  onClose,
  currentProject,
  models,
  relations,
  diagramSheets,
  onLoadProject,
  onUpdateProject,
  onCreateProject,
  onEnablePhotosInCurrentProject,
  appSettings,
  onUpdateAppSettings
}: Props) {
  const { language } = useAppLanguage();
  const copy =
    language === 'es'
      ? {
          noActiveProject: 'No hay ningún proyecto activo para guardar.',
          projectSaved: 'Proyecto guardado correctamente.',
          deleteConfirm: '¿Seguro que quieres eliminar este proyecto?',
          invalidProject: 'Archivo de proyecto no válido',
          title: 'Gestor de proyectos',
          localOnly: 'Los proyectos se guardan localmente en tu navegador. Conecta Supabase para activar almacenamiento en la nube y colaboración en tiempo real con otros usuarios.',
          myProjects: 'Mis proyectos',
          versionHistoryTab: 'Histórico de versiones',
          currentProject: 'Proyecto actual',
          save: 'Guardar',
          renameProject: 'Renombrar proyecto',
          saveName: 'Guardar nombre',
          enablePhotos: 'Activar Fotos',
          collections: (count: number) => `${count} colección${count === 1 ? '' : 'es'}`,
          relations: (count: number) => `${count} relación${count === 1 ? '' : 'es'}`,
          newProjectName: 'Nombre del nuevo proyecto',
          create: 'Crear',
          importProject: 'Importar proyecto',
          updated: 'Actualizado',
          noProjects: 'Todavía no hay proyectos. Crea arriba el primero.',
          noHistory: 'Este proyecto todavía no tiene histórico de versiones.',
          close: 'Cerrar'
          ,
          restoreVersionPrompt: 'Indica el número de versión a restaurar',
          versionNotFound: 'No se encontró esa versión o no tiene snapshot.',
          restored: 'Versión restaurada correctamente.'
        }
      : {
          noActiveProject: 'No active project to save',
          projectSaved: 'Project saved successfully!',
          deleteConfirm: 'Are you sure you want to delete this project?',
          invalidProject: 'Invalid project file',
          title: 'Project Manager',
          localOnly: 'Projects are saved locally in your browser. Connect to Supabase to enable cloud storage and real-time collaboration with other users.',
          myProjects: 'My Projects',
          versionHistoryTab: 'Version History',
          currentProject: 'Current Project',
          save: 'Save',
          renameProject: 'Rename project',
          saveName: 'Save name',
          enablePhotos: 'Enable Photos',
          collections: (count: number) => `${count} collection${count === 1 ? '' : 's'}`,
          relations: (count: number) => `${count} relation${count === 1 ? '' : 's'}`,
          newProjectName: 'New Project Name',
          create: 'Create',
          importProject: 'Import Project',
          updated: 'Updated',
          noProjects: 'No projects yet. Create your first project above.',
          noHistory: 'This project has no version history yet.',
          close: 'Close'
          ,
          restoreVersionPrompt: 'Enter the version number to restore',
          versionNotFound: 'Version not found or no snapshot available.',
          restored: 'Version restored successfully.'
        };

  const [projects, setProjects] = useState<ProjectDataWithSource[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [newProjectName, setNewProjectName] = useState('');
  const [currentProjectNameDraft, setCurrentProjectNameDraft] = useState('');
  const [newProjectContext, setNewProjectContext] = useState('');
  const [newProjectPhotosSheet, setNewProjectPhotosSheet] = useState(false);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);
  const [syncFolderPath, setSyncFolderPath] = useState('');
  const recentDesktopOpenFilesRef = useRef<Set<string>>(new Set());
  const isDesktopSyncAvailable = Boolean(window.desktopApp?.sync?.selectFolder);

  useEffect(() => {
    refreshLocalProjects();
    checkSupabaseConnection();
  }, []);

  useEffect(() => {
    if (open) {
      refreshLocalProjects();
    }
  }, [open]);

  useEffect(() => {
    setSyncFolderPath(appSettings.cloudPathOrBucket || '');
  }, [appSettings.cloudPathOrBucket]);

  useEffect(() => {
    const listener = window.desktopApp?.onOpenFile;
    const reader = window.desktopApp?.readTextFile;
    if (!listener || !reader) return;

    const openDesktopFile = async (filePath: string | null | undefined) => {
      if (!filePath) return;
      if (recentDesktopOpenFilesRef.current.has(filePath)) return;
      recentDesktopOpenFilesRef.current.add(filePath);
      window.setTimeout(() => {
        recentDesktopOpenFilesRef.current.delete(filePath);
      }, 1500);
      window.desktopApp?.clearPendingOpenFile?.(filePath).catch(() => undefined);

      try {
        const result = await reader(filePath);
        if (!result?.ok || !result.content) {
          alert((language === 'es' ? 'No se pudo abrir el archivo.' : 'Could not open file.') + (result?.error ? `\n${result.error}` : ''));
          return;
        }
        
        const sourceName = filePath.split(/[/\\]/).pop() || 'Imported Project';
        await importProjectFromContent(result.content, sourceName, filePath, result.modifiedAt);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        alert(`${copy.invalidProject}${detail ? `\n${detail}` : ''}`);
      }
    };

    const unsubscribe = listener(openDesktopFile);
    window.desktopApp?.getPendingOpenFile?.().then(openDesktopFile).catch(() => undefined);

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [language]);

  useEffect(() => {
    setCurrentProjectNameDraft(currentProject?.name || '');
  }, [currentProject?.id, currentProject?.name]);

  const checkSupabaseConnection = async () => {
    try {
      const response = await fetch('/supabase/functions/server/kv_store.tsx');
      setIsSupabaseConnected(response.ok);
    } catch {
      setIsSupabaseConnected(false);
    }
  };

  const refreshLocalProjects = async () => {
    setProjects(await loadLocalProjects());
  };

  const handleCreateProject = () => {
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName, newProjectContext, newProjectPhotosSheet);
    refreshLocalProjects();
    setNewProjectName('');
    setNewProjectContext('');
    setNewProjectPhotosSheet(false);
    onClose();
  };

  const handleSaveCurrentProject = async () => {
    if (!currentProject) {
      alert(copy.noActiveProject);
      return;
    }

    const updatedProject: ProjectDataWithSource = {
      ...currentProject,
      models,
      relations,
      diagramSheets,
      updated_at: new Date().toISOString()
    };

    const sourceFilePath = (currentProject as ProjectDataWithSource)?.sourceFilePath;
    if (sourceFilePath && window.desktopApp?.writeTextFile) {
      const bundle = createProjectBundle(
        updatedProject.name,
        updatedProject.models,
        updatedProject.relations || [],
        updatedProject.diagramSheets,
        updatedProject
      );
      const writeResult = await window.desktopApp.writeTextFile(sourceFilePath, JSON.stringify(bundle, null, 2));
      if (!writeResult?.ok) {
        alert((language === 'es' ? 'No se pudo guardar el archivo original.' : 'Could not save the original file.') + (writeResult?.error ? `\n${writeResult.error}` : ''));
      }
    }

    const updatedProjects = await upsertLocalProject(updatedProject);
    setProjects(updatedProjects);
    onUpdateProject(updatedProject);
    alert(copy.projectSaved);
  };

  const handleRenameCurrentProject = async () => {
    if (!currentProject) return;
    const trimmedName = currentProjectNameDraft.trim();
    if (!trimmedName || trimmedName === currentProject.name) return;

    const updatedProject: ProjectData = {
      ...currentProject,
      name: trimmedName,
      updated_at: new Date().toISOString()
    };
    const updatedProjects = await upsertLocalProject(updatedProject);
    setProjects(updatedProjects);
    onUpdateProject(updatedProject);
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm(copy.deleteConfirm)) return;

    const updatedProjects = projects.filter((project) => project.id !== projectId);
    await saveLocalProjects(updatedProjects);
    setProjects(updatedProjects);

    if (currentProject?.id === projectId) {
      onUpdateProject(null);
    }
  };

  const handleExportProject = (project: ProjectData) => {
    const bundle = createProjectBundle(
      project.name,
      project.models,
      project.relations || [],
      project.diagramSheets,
      project
    );
    const dataStr = JSON.stringify(bundle, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreProjectVersion = async (project: ProjectData) => {
    const history = project.versionHistory || [];
    if (!history.length) return;
    const versionInput = prompt(copy.restoreVersionPrompt, String(project.version || history[history.length - 1].version));
    if (!versionInput) return;
    const targetVersion = Number(versionInput);
    const target = history.find((entry) => entry.version === targetVersion && entry.snapshot);
    if (!target?.snapshot) {
      alert(copy.versionNotFound);
      return;
    }

    const restoredProject: ProjectData = {
      ...project,
      models: target.snapshot.models,
      relations: target.snapshot.relations,
      diagramSheets: target.snapshot.diagramSheets,
      photoSheetConfig: target.snapshot.photoSheetConfig,
      version: (project.version || target.version) + 1,
      versionHistory: [
        ...history,
        {
          version: (project.version || target.version) + 1,
          timestamp: new Date().toISOString(),
          note: `Restored from version ${target.version}`,
          snapshot: {
            models: target.snapshot.models,
            relations: target.snapshot.relations,
            diagramSheets: target.snapshot.diagramSheets,
            photoSheetConfig: target.snapshot.photoSheetConfig,
          }
        }
      ],
      updated_at: new Date().toISOString()
    };

    const updatedProjects = await upsertLocalProject(restoredProject);
    setProjects(updatedProjects);
    onLoadProject(restoredProject);
    alert(copy.restored);
  };

  const handleRestoreSpecificVersion = async (project: ProjectData, targetVersion: number) => {
    const history = project.versionHistory || [];
    const target = history.find((entry) => entry.version === targetVersion && entry.snapshot);
    if (!target?.snapshot) {
      alert(copy.versionNotFound);
      return;
    }

    const restoredProject: ProjectData = {
      ...project,
      models: target.snapshot.models,
      relations: target.snapshot.relations,
      diagramSheets: target.snapshot.diagramSheets,
      photoSheetConfig: target.snapshot.photoSheetConfig,
      version: (project.version || target.version) + 1,
      versionHistory: [
        ...history,
        {
          version: (project.version || target.version) + 1,
          timestamp: new Date().toISOString(),
          note: `Restored from version ${target.version}`,
          snapshot: {
            models: target.snapshot.models,
            relations: target.snapshot.relations,
            diagramSheets: target.snapshot.diagramSheets,
            photoSheetConfig: target.snapshot.photoSheetConfig,
          }
        }
      ],
      updated_at: new Date().toISOString()
    };

    const updatedProjects = await upsertLocalProject(restoredProject);
    setProjects(updatedProjects);
    onLoadProject(restoredProject);
    alert(copy.restored);
  };

  const handleImportProject = () => {
    const createId = () =>
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.mdm,.dmm,application/json,text/json';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const rawContent = event.target?.result as string;
          await importProjectFromContent(rawContent, file.name, undefined, new Date(file.lastModified).toISOString());
          onClose();
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          alert(`${copy.invalidProject}${detail ? `\n${detail}` : ''}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const importProjectFromContent = async (
    rawContent: string,
    sourceName: string,
    sourceFilePath?: string,
    sourceModifiedAt?: string
  ): Promise<ProjectDataWithSource | null> => {
    const createId = () =>
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const imported = parseJsonContent(rawContent);
    let newProject: ProjectDataWithSource | null = null;

    if (isProjectBundle(imported)) {
      newProject = normalizeImportedProject({
        ...imported.project,
        id: createId(),
        relations: imported.project.relations || [],
        created_at: imported.project.created_at || new Date().toISOString(),
        updated_at: sourceModifiedAt || imported.project.updated_at || new Date().toISOString(),
        sourceFilePath
      });
    } else if (isCompassMdmFile(imported)) {
      const mdmProject = parseCompassMdmToProject(imported);
      const inferredName = sourceName.replace(/\.[^.]+$/, '');
      newProject = normalizeImportedProject({
        ...mdmProject,
        name: mdmProject.name || inferredName,
        id: createId(),
        created_at: new Date().toISOString(),
        updated_at: sourceModifiedAt || new Date().toISOString(),
        sourceFilePath
      });
    } else if (isMoomDmmFile(imported)) {
      const dmmProject = parseMoomDmmToProject(imported);
      const inferredName = sourceName.replace(/\.[^.]+$/, '');
      newProject = normalizeImportedProject({
        ...dmmProject,
        name: dmmProject.name || inferredName,
        id: createId(),
        created_at: new Date().toISOString(),
        updated_at: sourceModifiedAt || new Date().toISOString(),
        sourceFilePath
      });
    } else if (isLegacyProjectData(imported)) {
      newProject = normalizeImportedProject({
        ...imported,
        id: createId(),
        relations: imported.relations || [],
        created_at: imported.created_at || new Date().toISOString(),
        updated_at: sourceModifiedAt || imported.updated_at || new Date().toISOString(),
        sourceFilePath
      });
    }

    if (!newProject) {
      alert(copy.invalidProject);
      return null;
    }

    const allProjects = await loadLocalProjects();
    // The file contents are authoritative. Reuse a local record only when it
    // represents this exact file path, never because the names happen to match.
    const existingBySourcePath = sourceFilePath
      ? allProjects.find((project) => project.sourceFilePath === sourceFilePath)
      : undefined;
    const projectToOpen: ProjectDataWithSource = existingBySourcePath
      ? {
          ...newProject,
          id: existingBySourcePath.id,
          created_at: newProject.created_at || existingBySourcePath.created_at,
          sourceFilePath
        }
      : newProject;

    try {
      const updatedProjects = await upsertLocalProject(projectToOpen);
      setProjects(updatedProjects);
      onLoadProject(projectToOpen);
      return projectToOpen;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      alert(
        (language === 'es'
          ? 'No se pudo guardar en almacenamiento local (IndexedDB). Se abrira el proyecto en memoria.'
          : 'Could not save to local storage (IndexedDB). The project will be opened in memory.') +
          (detail ? `\n${detail}` : '')
      );
      onLoadProject(projectToOpen);
      return projectToOpen;
    }
  };

  const handlePushVirtualSync = async () => {
    const syncLocation = syncFolderPath || appSettings.cloudPathOrBucket || 'virtual-sync';
    const syncProvider = appSettings.cloudProvider === 'none' ? 'local_folder' : appSettings.cloudProvider;
    const ok = await saveProjectsToVirtualSync(syncProvider, syncLocation, projects);
    if (!ok) {
      alert(
        language === 'es'
          ? 'No se pudo guardar la sincronizacion virtual: almacenamiento local lleno.'
          : 'Could not save virtual sync: local storage quota exceeded.'
      );
      return;
    }
    alert(language === 'es' ? 'Sincronizacion virtual completada.' : 'Virtual sync completed.');
  };

  const handlePullVirtualSync = async () => {
    const synced = await loadProjectsFromVirtualSync();
    if (!synced?.projects?.length) {
      alert(language === 'es' ? 'No hay datos en sync virtual.' : 'No data found in virtual sync.');
      return;
    }
    await saveLocalProjects(synced.projects);
    setProjects(synced.projects);
    alert(language === 'es' ? 'Sincronizacion virtual completada.' : 'Virtual sync completed.');
  };

  const handleChooseSyncFolder = async () => {
    if (!window.desktopApp?.sync?.selectFolder) {
      alert(language === 'es' ? 'Selector de carpeta no disponible (modo web).' : 'Folder picker unavailable (web mode).');
      return;
    }
    const folder = await window.desktopApp.sync.selectFolder();
    if (folder) {
      setSyncFolderPath(folder);
      onUpdateAppSettings({
        ...appSettings,
        cloudProvider: 'local_folder',
        cloudPathOrBucket: folder
      });
    }
  };

  const handlePushSync = async () => {
    const desktopSync = window.desktopApp?.sync;
    if (desktopSync && syncFolderPath) {
      const result = await desktopSync.writeProjects(syncFolderPath, projects);
      if (!result.ok) {
        alert(result.error || (language === 'es' ? 'Error al subir sync real.' : 'Error pushing real sync.'));
        return;
      }
      alert(language === 'es' ? 'Sincronizacion real completada.' : 'Real sync completed.');
      return;
    }
    await handlePushVirtualSync();
  };

  const handlePullSync = async () => {
    const desktopSync = window.desktopApp?.sync;
    if (desktopSync && syncFolderPath) {
      const result = await desktopSync.readProjects(syncFolderPath);
      if (!result.ok) {
        alert(result.error || (language === 'es' ? 'Error al bajar sync real.' : 'Error pulling real sync.'));
        return;
      }
      await saveLocalProjects(result.projects || []);
      setProjects(result.projects || []);
      alert(language === 'es' ? 'Sincronizacion real completada.' : 'Real sync completed.');
      return;
    }
    await handlePullVirtualSync();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogContent>
        <div className="space-y-4">
          {!isSupabaseConnected && (
            <Alert severity="info" sx={{ backgroundColor: 'rgba(30,64,175,0.2)', color: '#dbeafe', border: '1px solid rgba(96,165,250,0.35)' }}>{copy.localOnly}</Alert>
          )}

          <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
            <Tab label={copy.myProjects} />
            <Tab label={copy.versionHistoryTab} />
          </Tabs>

          <Box>
            {activeTab === 0 && (
              <div className="space-y-4">
                {currentProject && (
                  <div className="p-3 bg-slate-900/30 rounded-xl border border-slate-500/20">
                    <div className="mb-2">
                      <h4>{copy.currentProject}</h4>
                      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                        <TextField
                          size="small"
                          fullWidth
                          label={copy.renameProject}
                          value={currentProjectNameDraft}
                          onChange={(e) => setCurrentProjectNameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameCurrentProject();
                          }}
                        />
                        <Button variant="outlined" onClick={handleRenameCurrentProject} size="small" sx={{ borderRadius: 2 }}>
                          {copy.saveName}
                        </Button>
                        <Button
                          variant="contained"
                          startIcon={<Save className="w-4 h-4" />}
                          onClick={handleSaveCurrentProject}
                          size="small"
                          sx={{ borderRadius: 2 }}
                        >
                          {copy.save}
                        </Button>
                      </div>
                      {currentProject && !currentProject.photoSheetConfig?.enabled && (
                        <div className="mt-2 flex justify-end">
                          <Button variant="outlined" onClick={onEnablePhotosInCurrentProject} size="small" sx={{ borderRadius: 2 }}>
                            {copy.enablePhotos}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-slate-300">
                      {copy.collections(models.length)} | {copy.relations(relations.length)}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <TextField
                    label={copy.newProjectName}
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleCreateProject()}
                    size="small"
                    fullWidth
                  />
                  <Button variant="contained" onClick={handleCreateProject} startIcon={<Plus className="w-4 h-4" />}>
                    {copy.create}
                  </Button>
                </div>
                <TextField
                  label={language === 'es' ? 'Contexto para IA' : 'AI context'}
                  value={newProjectContext}
                  onChange={(e) => setNewProjectContext(e.target.value)}
                  size="small"
                  fullWidth
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={newProjectPhotosSheet}
                      onChange={(e) => setNewProjectPhotosSheet(e.target.checked)}
                    />
                  }
                  label={
                    language === 'es'
                      ? 'Crear hoja Fotos y colecciones automáticas _photo'
                      : 'Create Fotos sheet and automatic _photo collections'
                  }
                />

                <Button
                  variant="outlined"
                  onClick={handleImportProject}
                  fullWidth
                  startIcon={<Download className="w-4 h-4" />}
                  sx={{ borderRadius: 2 }}
                >
                  {copy.importProject}
                </Button>
                <div className="rounded-xl border border-slate-500/20 bg-slate-900/30 p-3">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                    {language === 'es' ? 'Sincronización' : 'Sync'}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                  <Button variant="outlined" onClick={handleChooseSyncFolder} disabled={!isDesktopSyncAvailable} size="small" sx={{ borderRadius: 2 }}>
                    {language === 'es' ? 'Elegir carpeta sync' : 'Choose sync folder'}
                  </Button>
                  <Button variant="contained" onClick={handlePushSync} size="small" sx={{ borderRadius: 2 }}>
                    {language === 'es' ? 'Subir sync' : 'Push sync'}
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <Button variant="outlined" onClick={handlePullSync} size="small" sx={{ borderRadius: 2 }}>
                    {language === 'es' ? 'Bajar sync' : 'Pull sync'}
                  </Button>
                </div>
                <TextField
                  className="mt-2"
                  size="small"
                  fullWidth
                  label={language === 'es' ? 'Carpeta sync actual' : 'Current sync folder'}
                  value={syncFolderPath}
                  onChange={(e) => setSyncFolderPath(e.target.value)}
                />
                </div>
                <Alert severity={isDesktopSyncAvailable ? 'success' : 'warning'}>
                  {isDesktopSyncAvailable
                    ? (language === 'es' ? 'Modo desktop detectado: sync real disponible.' : 'Desktop mode detected: real sync available.')
                    : (language === 'es'
                      ? 'Modo web detectado: selector de carpeta no disponible. Se usará sync virtual.'
                      : 'Web mode detected: folder picker unavailable. Virtual sync will be used.')}
                </Alert>

                <List>
                  {projects.map((project) => (
                    <ListItem key={project.id} disablePadding>
                      <ListItemButton
                        onClick={() => onLoadProject(project)}
                        selected={currentProject?.id === project.id}
                      >
                        <ListItemText
                          primary={project.name}
                          secondary={
                            <>
                              {`${copy.collections(project.models?.length || 0)} · ${copy.updated} ${new Date(
                                project.updated_at || project.created_at || Date.now()
                              ).toLocaleString()}`}
                              {project.sourceFilePath && (
                                <><br />{`${language === 'es' ? 'Ruta' : 'Path'}: ${project.sourceFilePath}`}</>
                              )}
                            </>
                          }
                        />
                      </ListItemButton>
                      <ListItemSecondaryAction>
                        <IconButton size="small" onClick={() => handleExportProject(project)}>
                          <Download className="w-4 h-4" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleRestoreProjectVersion(project)}>
                          <RotateCcw className="w-4 h-4" />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeleteProject(project.id)} color="error">
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                  {projects.length === 0 && (
                    <div className="text-center text-slate-400 py-8">
                      {copy.noProjects}
                    </div>
                  )}
                </List>
              </div>
            )}

            {activeTab === 1 && (
              <div className="space-y-3">
                {!currentProject?.versionHistory?.length && (
                  <div className="text-center text-slate-400 py-8">{copy.noHistory}</div>
                )}
                {!!currentProject?.versionHistory?.length && (
                  <List>
                    {[...currentProject.versionHistory].sort((a, b) => b.version - a.version).map((entry) => (
                      <ListItem key={`${currentProject.id}-${entry.version}`}>
                        <ListItemText
                          primary={`v${entry.version} - ${entry.note}`}
                          secondary={new Date(entry.timestamp).toLocaleString()}
                        />
                        <ListItemSecondaryAction>
                          <IconButton
                            size="small"
                            onClick={() => handleRestoreSpecificVersion(currentProject, entry.version)}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                )}
              </div>
            )}
          </Box>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{copy.close}</Button>
      </DialogActions>
    </Dialog>
  );
}

function parseJsonContent(content: string) {
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    // Remove hidden control characters that can break JSON/JSON5 parsing.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // Remove C1 control characters often introduced by mixed encodings.
    .replace(/[\u0080-\u009F]/g, '')
    .replace(/[\u2028\u2029]/g, '');

  try {
    return JSON.parse(normalized);
  } catch {
    return JSON5.parse(normalized);
  }
}

function normalizeImportedProject(project: ProjectData): ProjectData {
  const createId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const sanitizedDocumentation = project.documentation
    ? {
        enabled: Boolean(project.documentation.enabled),
        modelDescription: project.documentation.modelDescription,
        collections: project.documentation.collections,
        indexes: project.documentation.indexes
      }
    : project.documentation;

  return {
    ...project,
    name: typeof project.name === 'string' && project.name.trim() ? project.name : 'Imported Project',
    models: Array.isArray(project.models)
      ? project.models.map((model) => ({
          ...model,
          id: model?.id || createId(),
          name: model?.name || 'ImportedCollection',
          fields: Array.isArray(model?.fields) ? model.fields : [],
          indexes: Array.isArray((model as any)?.indexes) ? (model as any).indexes : []
        }))
      : [],
    relations: Array.isArray(project.relations) ? project.relations : [],
    documentation: sanitizedDocumentation
  };
}

function isCompassMdmFile(value: unknown): value is { type: string; edits: string; name?: string } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; edits?: unknown };
  return candidate.type === 'Compass Data Modeling Diagram' && typeof candidate.edits === 'string';
}

function isMoomDmmFile(value: unknown): value is {
  tables: Record<string, any>;
  diagrams?: Record<string, any>;
  diagramsOrder?: string[];
  model?: { name?: string };
} {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { tables?: unknown; model?: unknown };
  return Boolean(candidate.tables && typeof candidate.tables === 'object' && candidate.model && typeof candidate.model === 'object');
}

function parseCompassMdmToProject(mdm: { edits: string; name?: string }): ProjectData {
  const createId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const editsJson = decodeBase64Utf8(mdm.edits);
  const edits = JSON.parse(editsJson);
  if (!Array.isArray(edits)) {
    throw new Error('MDM edits format is invalid.');
  }

  const setModelEvents = edits.filter((entry) => entry?.type === 'SetModel' && entry?.model?.collections);
  if (!setModelEvents.length) {
    throw new Error('MDM does not contain a SetModel event.');
  }

  const latestSetModel = setModelEvents[setModelEvents.length - 1];
  const collections = latestSetModel.model.collections;
  if (!Array.isArray(collections) || !collections.length) {
    throw new Error('MDM does not contain collections.');
  }

  const models = collections
    .filter((collection: any) => typeof collection?.ns === 'string' && collection?.fieldData)
    .map((collection: any) => {
      const ns = collection.ns as string;
      const collectionName = ns.includes('.') ? ns.split('.').slice(1).join('.') : ns;
      return {
        id: createId(),
        name: collectionName || 'ImportedCollection',
        fields: bsonSchemaToFields(collection.fieldData),
        indexes: Array.isArray(collection.indexes) ? collection.indexes : []
      } as Model;
    });

  if (!models.length) {
    throw new Error('MDM collections could not be converted.');
  }

  const relations = parseCompassRelationships(edits, models);

  return {
    id: createId(),
    name: mdm.name || 'Imported MDM Project',
    models,
    relations,
    diagramSheets: buildDefaultDiagramSheets(models.map((model) => model.id))
  };
}

function parseCompassRelationships(edits: any[], models: Model[]): Relation[] {
  const modelByNs = new Map<string, Model>();
  models.forEach((model) => {
    modelByNs.set(model.name, model);
  });

  const latestById = new Map<string, any>();
  edits
    .filter((entry) => entry?.relationship?.id && Array.isArray(entry?.relationship?.relationship))
    .forEach((entry) => {
      latestById.set(entry.relationship.id, entry.relationship);
    });

  const relations: Relation[] = [];
  latestById.forEach((relationship) => {
    const endpoints = relationship.relationship;
    if (!Array.isArray(endpoints) || endpoints.length < 2) return;

    const left = endpoints[0];
    const right = endpoints[1];
    const leftNs = typeof left?.ns === 'string' ? left.ns.split('.').slice(1).join('.') : '';
    const rightNs = typeof right?.ns === 'string' ? right.ns.split('.').slice(1).join('.') : '';
    if (!leftNs || !rightNs) return;

    const fromModel = modelByNs.get(leftNs);
    const toModel = modelByNs.get(rightNs);
    if (!fromModel || !toModel) return;

    const fromFieldPath = Array.isArray(left?.fields) && left.fields.length ? left.fields.join('.') : '';
    const toFieldPath = Array.isArray(right?.fields) && right.fields.length ? right.fields.join('.') : '';

    relations.push({
      id: relationship.id,
      fromModelId: fromModel.id,
      fromFieldPath,
      toModelId: toModel.id,
      toFieldPath,
      type: 'one-to-one',
      label: relationship.note || ''
    });
  });

  return relations;
}

function parseMoomDmmToProject(dmm: {
  tables: Record<string, any>;
  diagrams?: Record<string, any>;
  diagramsOrder?: string[];
  model?: { name?: string };
  otherObjects?: Record<string, any>;
}): ProjectData {
  const createId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const tableEntries = Object.entries(dmm.tables || {});
  const rootTables = tableEntries.filter(([, table]) => !table?.embeddable);
  const embeddableTables = new Map(
    tableEntries
      .filter(([, table]) => Boolean(table?.embeddable))
      .map(([tableId, table]) => [tableId, table])
  );
  const datatypeAliases = new Map(
    Object.entries(dmm.otherObjects || {})
      .filter(([, value]) => value?.type === 'DatatypeAlias')
      .map(([objectId, value]) => [objectId, value])
  );

  const models = rootTables.map(([tableId, table]) => ({
    id: createId(),
    name: typeof table?.name === 'string' && table.name.trim() ? table.name : 'ImportedCollection',
    fields: parseMoomColumnsToFields(table?.cols, embeddableTables, datatypeAliases),
    indexes: parseMoomIndexes(table?.indexes, table?.cols),
    __sourceTableId: tableId
  })) as Array<Model & { __sourceTableId: string }>;

  const modelIdByTableId = new Map(models.map((model) => [model.__sourceTableId, model.id]));
  const diagramSheets = parseMoomDiagrams(dmm.diagrams, dmm.diagramsOrder, modelIdByTableId);

  return {
    id: createId(),
    name: dmm.model?.name || 'Imported DMM Project',
    models: models.map(({ __sourceTableId, ...model }) => model),
    relations: [],
    diagramSheets: diagramSheets.length ? diagramSheets : buildDefaultDiagramSheets(models.map((model) => model.id))
  };
}

function parseMoomColumnsToFields(
  cols: any[],
  embeddableTables: Map<string, any>,
  datatypeAliases: Map<string, any>
): Field[] {
  if (!Array.isArray(cols)) return [];

  return cols.map((col) => {
    const datatype = typeof col?.datatype === 'string' ? col.datatype : 'string';
    const nestedTable = embeddableTables.get(datatype);
    const datatypeAlias = datatypeAliases.get(datatype);
    const isArray = parseMoomBoolean(col?.list);
    const required = parseMoomBoolean(col?.nn);
    const nullable = resolveMoomNullable(required, datatypeAlias);

    if (nestedTable) {
      const nestedFields = parseMoomColumnsToFields(nestedTable.cols, embeddableTables, datatypeAliases);
      if (isArray) {
        return {
          name: col?.name || 'field',
          type: 'Document',
          isArray: true,
          arrayType: 'Document',
          required,
          nullable,
          description: col?.comment || '',
          nestedFields
        };
      }

      return {
        name: col?.name || 'field',
        type: 'Document',
        required,
        nullable,
        description: col?.comment || '',
        nestedFields
      };
    }

    const scalarType = mapMoomDatatypeToMongoType(datatype, datatypeAlias);
    const field: Field = {
      name: col?.name || 'field',
      type: scalarType,
      required,
      nullable,
      description: col?.comment || '',
      enum: typeof col?.enum === 'string' && col.enum.trim()
        ? col.enum.split(',').map((item: string) => item.trim()).filter(Boolean)
        : undefined,
      isId: Boolean(col?.pk),
      nestedFields: []
    };

    if (isArray) {
      return {
        ...field,
        isArray: true,
        arrayType: scalarType
      };
    }

    return field;
  });
}

function parseMoomIndexes(indexes: any[], cols: any[]) {
  if (!Array.isArray(indexes)) return [];

  const columnNameById = new Map(
    Array.isArray(cols) ? cols.map((col) => [col?.id, col?.name]).filter(([id, name]) => id && name) : []
  );

  return indexes
    .map((index) => ({
      id: typeof index?.id === 'string' ? index.id : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: index?.name || 'index',
      type: (index?.type === 'compound' || index?.type === 'wildcard' || index?.type === 'atlas_search') ? index.type : 'regular',
      unique: Boolean(index?.unique),
      sparse: Boolean(index?.sparse),
      fields: Array.isArray(index?.columns)
        ? index.columns
            .map((column: any) => {
              const fieldName = columnNameById.get(column?.colid);
              if (!fieldName) return null;
              return {
                field: fieldName,
                order: column?.order === 'Descending' ? 'desc' : 'asc'
              };
            })
            .filter(Boolean)
        : []
    }))
    .filter((index) => index.fields.length > 0);
}

function parseMoomDiagrams(
  diagrams: Record<string, any> | undefined,
  diagramsOrder: string[] | undefined,
  modelIdByTableId: Map<string, string>
) {
  const orderedIds = Array.isArray(diagramsOrder) && diagramsOrder.length
    ? diagramsOrder
    : Object.keys(diagrams || {});

  return orderedIds
    .map((diagramId) => {
      const diagram = diagrams?.[diagramId];
      if (!diagram) return null;

      const modelIds: string[] = [];
      const modelPositions: Record<string, { x: number; y: number }> = {};

      Object.values(diagram.diagramItems || {}).forEach((item: any) => {
        const tableId = item?.referencedItemId;
        const modelId = modelIdByTableId.get(tableId);
        if (!modelId) return;
        modelIds.push(modelId);
        modelPositions[modelId] = {
          x: typeof item?.x === 'number' ? item.x : 0,
          y: typeof item?.y === 'number' ? item.y : 0
        };
      });

      return {
        id: diagramId,
        name: typeof diagram?.name === 'string' && diagram.name.trim() ? diagram.name : 'Imported Diagram',
        modelIds,
        modelPositions
      };
    })
    .filter((diagram): diagram is NonNullable<typeof diagram> => Boolean(diagram));
}

function mapMoomDatatypeToMongoType(datatype: string, datatypeAlias?: any): Field['type'] {
  const aliasBsonTypes = extractBsonTypesFromAlias(datatypeAlias);
  const normalizedDatatype = aliasBsonTypes.find((entry) => entry !== 'null') || String(datatype).toLowerCase();

  switch (normalizedDatatype) {
    case 'string':
      return 'String';
    case 'objectid':
      return 'ObjectId';
    case 'int':
      return 'Int';
    case 'long':
      return 'Long';
    case 'double':
      return 'Double';
    case 'number':
      return 'Number';
    case 'decimal':
      return 'Decimal128';
    case 'bool':
    case 'boolean':
      return 'Boolean';
    case 'date':
      return 'Date';
    case 'timestamp':
      return 'Timestamp';
    case 'bindata':
      return 'Buffer';
    case 'undefined':
      return 'Undefined';
    case 'dbpointer':
      return 'DbPointer';
    case 'javascript':
      return 'JavaScript';
    case 'javascriptwithscope':
      return 'JavaScriptWithScope';
    case 'regex':
      return 'Regex';
    case 'symbol':
      return 'Symbol';
    case 'minkey':
      return 'MinKey';
    case 'maxkey':
      return 'MaxKey';
    case 'null':
      return 'Null';
    default:
      return 'Mixed';
  }
}

function resolveMoomNullable(required: boolean, datatypeAlias?: any) {
  if (required) {
    return false;
  }

  const bsonTypes = extractBsonTypesFromAlias(datatypeAlias);
  return bsonTypes.includes('null');
}

function extractBsonTypesFromAlias(datatypeAlias?: any) {
  const expression = typeof datatypeAlias?.typeExpression === 'string' ? datatypeAlias.typeExpression : '';
  const matches = expression.match(/"([^"]+)"/g) || [];
  return matches
    .map((entry) => entry.replace(/"/g, '').trim().toLowerCase())
    .filter((entry) => entry !== 'bsontype');
}

function parseMoomBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  return false;
}

function bsonSchemaToFields(schema: any): any[] {
  const properties = schema?.properties;
  const required = Array.isArray(schema?.required) ? schema.required : [];
  if (!properties || typeof properties !== 'object') return [];

  return Object.entries(properties).map(([name, value]: [string, any]) => {
    const bsonType = value?.bsonType;
    const normalizedType = Array.isArray(bsonType) ? bsonType.find((entry) => entry !== 'null') || bsonType[0] : bsonType;
    const nullable = Array.isArray(bsonType) && bsonType.includes('null');

    if (normalizedType === 'object') {
      return {
        name,
        type: 'Document',
        required: required.includes(name),
        nullable,
        description: typeof value?.description === 'string' ? value.description : '',
        enum: Array.isArray(value?.enum) ? value.enum.filter((item: unknown): item is string => typeof item === 'string') : undefined,
        nestedFields: bsonSchemaToFields(value)
      };
    }

    if (normalizedType === 'array') {
      const itemType = value?.items?.bsonType;
      const isDocArray = itemType === 'object' || Boolean(value?.items?.properties);
      const inferredEnumType = inferMongoTypeFromEnumValues(value?.items?.enum);
      const mappedArrayType = bsonTypeToMongoType(itemType);
      return {
        name,
        type: 'Array',
        arrayType: Array.isArray(value?.items?.enum) && value.items.enum.length > 0
          ? 'Enum'
          : isDocArray
            ? 'Document'
            : (mappedArrayType === 'Mixed' ? inferredEnumType : mappedArrayType),
        required: required.includes(name),
        nullable,
        description: typeof value?.description === 'string' ? value.description : '',
        enum: Array.isArray(value?.items?.enum)
          ? value.items.enum.filter((item: unknown): item is string => typeof item === 'string')
          : Array.isArray(value?.enum)
            ? value.enum.filter((item: unknown): item is string => typeof item === 'string')
            : undefined,
        nestedFields: isDocArray ? bsonSchemaToFields(value.items) : []
      };
    }

    if (Array.isArray(value?.enum) && value.enum.length > 0) {
      return {
        name,
        type: 'Enum',
        required: required.includes(name),
        nullable,
        description: typeof value?.description === 'string' ? value.description : '',
        enum: value.enum.filter((item: unknown): item is string => typeof item === 'string'),
        nestedFields: []
      };
    }

    return {
      name,
      type: bsonTypeToMongoType(normalizedType),
      required: required.includes(name),
      nullable,
      description: typeof value?.description === 'string' ? value.description : '',
      enum: Array.isArray(value?.enum) ? value.enum.filter((item: unknown): item is string => typeof item === 'string') : undefined,
      nestedFields: []
    };
  });
}

function bsonTypeToMongoType(type: string): string {
  const map: Record<string, string> = {
    string: 'String',
    number: 'Number',
    double: 'Double',
    int: 'Int',
    long: 'Long',
    decimal: 'Decimal128',
    bool: 'Boolean',
    date: 'Date',
    timestamp: 'Timestamp',
    objectId: 'ObjectId',
    binData: 'Buffer',
    undefined: 'Undefined',
    dbPointer: 'DbPointer',
    javascript: 'JavaScript',
    javascriptWithScope: 'JavaScriptWithScope',
    regex: 'Regex',
    symbol: 'Symbol',
    minKey: 'MinKey',
    maxKey: 'MaxKey',
    null: 'Null'
  };
  return map[type] || 'Mixed';
}

function inferMongoTypeFromEnumValues(enumValues: unknown): string {
  if (!Array.isArray(enumValues) || enumValues.length === 0) {
    return 'Mixed';
  }

  if (enumValues.every((value) => typeof value === 'string')) {
    return 'String';
  }

  if (enumValues.every((value) => typeof value === 'boolean')) {
    return 'Boolean';
  }

  if (enumValues.every((value) => Number.isInteger(value))) {
    return 'Int';
  }

  if (enumValues.every((value) => typeof value === 'number')) {
    return 'Number';
  }

  return 'Mixed';
}

function decodeBase64Utf8(value: string): string {
  const normalized = value
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}
