import type { Model } from '../components/MongoModelBuilder';

export interface DiagramModelPosition {
  x: number;
  y: number;
}

export interface Relation {
  id: string;
  fromModelId: string;
  toModelId: string;
  fromFieldPath?: string;
  toFieldPath?: string;
  label: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
}

export interface DiagramSheet {
  id: string;
  name: string;
  modelIds: string[];
  modelPositions?: Record<string, DiagramModelPosition>;
}

export interface PhotoSheetConfig {
  enabled: boolean;
  mainSheetId: string;
  photosSheetId: string;
  photosSheetName: string;
}

export interface ProjectData {
  id: string;
  name: string;
  sourceFilePath?: string;
  aiContext?: string;
  aiModel?: string;
  models: Model[];
  relations?: Relation[];
  diagramSheets?: DiagramSheet[];
  photoSheetConfig?: PhotoSheetConfig;
  created_at?: string;
  updated_at?: string;
  owner_id?: string;
  sharedProjectId?: string;
  collaborationRole?: 'owner' | 'editor' | 'viewer';
  version?: number;
  versionHistory?: Array<{
    version: number;
    timestamp: string;
    note: string;
    snapshot?: {
      models: Model[];
      relations: Relation[];
      diagramSheets: DiagramSheet[];
      photoSheetConfig?: PhotoSheetConfig;
    };
  }>;
  documentation?: {
    enabled: boolean;
    modelDescription?: string;
    collections?: Record<string, { description?: string }>;
    indexes?: Record<string, { description?: string; objective?: string; createCommand?: string }>;
  };
}

export interface ProjectBundle {
  format: 'mongodb-model-viewer-project';
  version: 4;
  exported_at: string;
  project: ProjectData;
}

interface ProjectBundleOptions {
  includeVersionHistory?: boolean;
}

export function createProjectBundle(
  projectName: string,
  models: Model[],
  relations: Relation[] = [],
  diagramSheets?: DiagramSheet[],
  currentProject?: ProjectData | null,
  options: ProjectBundleOptions = {}
): ProjectBundle {
  const now = new Date().toISOString();
  const includeVersionHistory = options.includeVersionHistory ?? false;
  const sanitizedDocumentation = sanitizeProjectDocumentation(currentProject?.documentation);
  const sanitizedVersionHistory = includeVersionHistory ? currentProject?.versionHistory || [] : [];

  return {
    format: 'mongodb-model-viewer-project',
    version: 4,
    exported_at: now,
    project: {
      id: currentProject?.id || Date.now().toString(),
      name: currentProject?.name || projectName || 'Untitled',
      models,
      relations,
      diagramSheets: normalizeDiagramSheets(
        diagramSheets || currentProject?.diagramSheets,
        models.map((model) => model.id),
        currentProject?.photoSheetConfig
      ),
      photoSheetConfig: currentProject?.photoSheetConfig,
      version: currentProject?.version || 1,
      versionHistory: sanitizedVersionHistory,
      documentation: sanitizedDocumentation,
      created_at: currentProject?.created_at || now,
      updated_at: now,
      owner_id: currentProject?.owner_id
    }
  };
}

export function isProjectBundle(value: unknown): value is ProjectBundle {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ProjectBundle>;
  return candidate.format === 'mongodb-model-viewer-project' && Boolean(candidate.project);
}

export function isLegacyProjectData(value: unknown): value is ProjectData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ProjectData>;
  return typeof candidate.name === 'string' && Array.isArray(candidate.models);
}

export function buildDefaultDiagramSheets(
  modelIds: string[] = [],
  photoSheetConfig?: PhotoSheetConfig | null
): DiagramSheet[] {
  const sheets: DiagramSheet[] = [
    {
      id: photoSheetConfig?.mainSheetId || 'main-diagram',
      name: 'Main Diagram',
      modelIds: Array.from(new Set(modelIds)),
      modelPositions: {}
    }
  ];

  if (photoSheetConfig?.enabled) {
    sheets.push({
      id: photoSheetConfig.photosSheetId,
      name: photoSheetConfig.photosSheetName || 'Fotos',
      modelIds: [],
      modelPositions: {}
    });
  }

  return sheets;
}

export function normalizeDiagramSheets(
  diagramSheets: DiagramSheet[] | undefined,
  validModelIds: string[],
  photoSheetConfig?: PhotoSheetConfig | null
): DiagramSheet[] {
  const validModelIdSet = new Set(validModelIds);
  const normalizedSheets = (diagramSheets || [])
    .map((sheet, index) => ({
      id: sheet.id || `diagram-sheet-${index + 1}`,
      name: sheet.name?.trim() || `Diagram ${index + 1}`,
      modelIds: Array.from(new Set((sheet.modelIds || []).filter((modelId) => validModelIdSet.has(modelId)))),
      modelPositions: normalizeDiagramSheetPositions(sheet.modelPositions, validModelIdSet)
    }))
    .filter((sheet) => sheet.id);

  if (normalizedSheets.length === 0) {
    return buildDefaultDiagramSheets(validModelIds, photoSheetConfig);
  }

  if (photoSheetConfig?.enabled) {
    if (!normalizedSheets.some((sheet) => sheet.id === photoSheetConfig.mainSheetId)) {
      normalizedSheets.unshift({
        id: photoSheetConfig.mainSheetId,
        name: 'Main Diagram',
        modelIds: [],
        modelPositions: {}
      });
    }

    if (!normalizedSheets.some((sheet) => sheet.id === photoSheetConfig.photosSheetId)) {
      normalizedSheets.push({
        id: photoSheetConfig.photosSheetId,
        name: photoSheetConfig.photosSheetName || 'Fotos',
        modelIds: [],
        modelPositions: {}
      });
    }
  }

  return normalizedSheets;
}

function normalizeDiagramSheetPositions(
  positions: Record<string, DiagramModelPosition> | undefined,
  validModelIdSet: Set<string>
) {
  if (!positions) {
    return {};
  }

  return Object.entries(positions).reduce<Record<string, DiagramModelPosition>>((accumulator, [modelId, position]) => {
    if (
      !validModelIdSet.has(modelId) ||
      !position ||
      typeof position.x !== 'number' ||
      typeof position.y !== 'number'
    ) {
      return accumulator;
    }

    accumulator[modelId] = {
      x: position.x,
      y: position.y
    };
    return accumulator;
  }, {});
}

function sanitizeProjectDocumentation(
  documentation: ProjectData['documentation']
): ProjectData['documentation'] {
  if (!documentation) {
    return documentation;
  }

  return {
    ...documentation
  };
}
