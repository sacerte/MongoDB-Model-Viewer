import type { Model, Field } from '../components/MongoModelBuilder';
import type { PhotoSheetConfig } from './projectBundle';
import { buildDefaultCollectionFields } from './defaultCollectionFields';

export const MAIN_DIAGRAM_SHEET_ID = 'main-diagram';
export const PHOTOS_DIAGRAM_SHEET_ID = 'photos-diagram';
export const PHOTOS_SHEET_NAME = 'Fotos';

export function buildDefaultPhotoSheetConfig(): PhotoSheetConfig {
  return {
    enabled: true,
    mainSheetId: MAIN_DIAGRAM_SHEET_ID,
    photosSheetId: PHOTOS_DIAGRAM_SHEET_ID,
    photosSheetName: PHOTOS_SHEET_NAME
  };
}

export function buildPhotoCollectionId(sourceModelId: string) {
  return `${sourceModelId}__photo`;
}

export function shouldCreatePhotoCollectionForSheet(sheetId: string, photoSheetConfig?: PhotoSheetConfig | null) {
  return Boolean(photoSheetConfig?.enabled && sheetId === photoSheetConfig.mainSheetId);
}

export function buildPhotoCollectionModel(
  sourceModel: Model,
  models: Model[],
  existingPhotoModel?: Model | null
): Model {
  const photoModelId = existingPhotoModel?.id || buildPhotoCollectionId(sourceModel.id);

  return {
    id: photoModelId,
    name: buildUniquePhotoCollectionName(sourceModel.name, models, photoModelId),
    fields: buildPhotoCollectionFields(sourceModel),
    indexes: existingPhotoModel?.indexes || [],
    photoSourceModelId: sourceModel.id
  };
}

function buildPhotoCollectionFields(sourceModel: Model): Field[] {
  const [, metadataField] = buildDefaultCollectionFields();

  return [
    {
      name: '_id',
      type: 'String',
      required: true,
      nullable: false,
      description: '',
      nestedFields: []
    },
    {
      name: 'date',
      type: 'Date',
      required: true,
      nullable: false,
      description: '',
      nestedFields: []
    },
    {
      name: 'date_to',
      type: 'Date',
      required: false,
      nullable: true,
      description: '',
      nestedFields: []
    },
    {
      name: 'original_doc',
      type: 'Document',
      required: true,
      nullable: false,
      description: '',
      nestedFields: sourceModel.fields.map(cloneFieldTree)
    },
    metadataField
  ];
}

function buildUniquePhotoCollectionName(sourceModelName: string, models: Model[], currentPhotoModelId: string) {
  const baseName = `${(sourceModelName || 'collection').trim() || 'collection'}_photo`;
  const usedNames = new Set(
    models
      .filter((model) => model.id !== currentPhotoModelId)
      .map((model) => model.name.trim())
      .filter(Boolean)
  );

  if (!usedNames.has(baseName)) {
    return baseName;
  }

  let counter = 2;
  let nextName = `${baseName}_${counter}`;
  while (usedNames.has(nextName)) {
    counter += 1;
    nextName = `${baseName}_${counter}`;
  }

  return nextName;
}

function cloneFieldTree(field: Field): Field {
  return {
    ...field,
    nestedFields: field.nestedFields ? field.nestedFields.map(cloneFieldTree) : []
  };
}
