import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert
} from '@mui/material';
import JSON5 from 'json5';
import { Model, Field } from './MongoModelBuilder';
import { Upload } from 'lucide-react';
import {
  buildDefaultDiagramSheets,
  isLegacyProjectData,
  isProjectBundle,
  ProjectData,
  Relation
} from '../utils/projectBundle';
import { useAppLanguage } from '../i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (models: Model[]) => void;
  onImportProject: (project: ProjectData) => void;
}

export default function ImportDialog({ open, onClose, onImport, onImportProject }: Props) {
  const { language } = useAppLanguage();
  const copy =
    language === 'es'
      ? {
          invalidFormat: 'Formato de JSON Schema o proyecto no válido',
          noCollections: 'No se encontraron colecciones válidas en el JSON',
          invalidJson: (message: string) => `JSON no válido: ${message}`,
          title: 'Importar JSON/MDM/DMM o proyecto',
          upload: 'Subir archivo .json, .mdm o .dmm',
          pasteLabel: 'O pega un JSON Schema / archivo de proyecto',
          placeholder: `Pega aquí tu contenido JSON. Formatos soportados:

Esquema único:
{
  $jsonSchema: {
    bsonType: "object",
    title: "medical_references",
    properties: { ... }
  }
}

Varias colecciones:
{
  medical_references: { $jsonSchema: { ... } },
  patients: { $jsonSchema: { ... } }
}

Archivo de proyecto:
{
  "format": "mongodb-model-viewer-project",
  "project": {
    "name": "Proyecto sanitario",
    "models": [ ... ]
  }
}`,
          cancel: 'Cancelar',
          importAction: 'Importar',
          unknownError: 'Error desconocido'
        }
      : {
          invalidFormat: 'Invalid JSON Schema or project format',
          noCollections: 'No valid collections found in the JSON',
          invalidJson: (message: string) => `Invalid JSON: ${message}`,
          title: 'Import JSON/MDM/DMM or Project',
          upload: 'Upload .json, .mdm or .dmm file',
          pasteLabel: 'Or paste JSON Schema / Project file',
          placeholder: `Paste your JSON content here. Supported formats:

Single schema:
{
  $jsonSchema: {
    bsonType: "object",
    title: "medical_references",
    properties: { ... }
  }
}

Multiple collections:
{
  medical_references: { $jsonSchema: { ... } },
  patients: { $jsonSchema: { ... } }
}

Project file:
{
  "format": "mongodb-model-viewer-project",
  "project": {
    "name": "Healthcare Project",
    "models": [ ... ]
  }
}`,
          cancel: 'Cancel',
          importAction: 'Import',
          unknownError: 'Unknown error'
        };

  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState('');

  const convertJSONSchemaToFields = (schema: any): Field[] => {
    const fields: Field[] = [];

    if (!schema.properties && !schema.$jsonSchema?.properties) {
      return fields;
    }

    const properties = schema.properties || schema.$jsonSchema?.properties;
    const required = schema.required || schema.$jsonSchema?.required || [];

    Object.entries(properties).forEach(([key, value]: [string, any]) => {
      const field: Field = {
        name: key,
        type: 'String',
        required: required.includes(key),
        nullable: false,
        description: typeof value?.description === 'string' ? value.description : '',
        enum: Array.isArray(value?.enum) ? value.enum.filter((item: unknown): item is string => typeof item === 'string') : undefined,
        nestedFields: []
      };

      const bsonType = value.bsonType || value.type;
      const bsonTypeValues = Array.isArray(bsonType)
        ? bsonType.filter((entry): entry is string => typeof entry === 'string')
        : typeof bsonType === 'string'
          ? [bsonType]
          : [];
      const concreteBsonTypes = bsonTypeValues.filter((entry) => entry !== 'null');
      const normalizedBsonType = concreteBsonTypes[0] || bsonTypeValues[0] || bsonType;
      field.nullable = bsonTypeValues.includes('null');
      const hasObjectProperties = Boolean(value?.properties);
      const hasArrayObjectItems = Boolean(value?.items?.properties) || value?.items?.title === 'object';
      const hasScalarEnum = Array.isArray(value?.enum) && value.enum.length > 0;
      const hasArrayEnum = Array.isArray(value?.items?.enum) && value.items.enum.length > 0;

      if (Array.isArray(bsonType) && concreteBsonTypes.length > 1) {
        const hasObject = concreteBsonTypes.includes('object');
        const hasArray = concreteBsonTypes.includes('array');
        if (hasObject && !hasArray) {
          field.type = 'Document';
          field.nestedFields = convertJSONSchemaToFields(value);
        } else if (hasArray && !hasObject) {
          if (value.items) {
            field.isArray = true;
            const itemType = value.items.bsonType || value.items.type;
            if (itemType === 'object' || hasArrayObjectItems) {
              field.type = 'Document';
              field.arrayType = 'Document';
              field.nestedFields = convertJSONSchemaToFields(value.items);
            } else if (hasArrayEnum) {
              field.type = 'Array';
              field.arrayType = 'Enum';
              field.enum = value.items.enum.filter((item: unknown): item is string => typeof item === 'string');
            } else {
              const inferredEnumType = inferMongoTypeFromEnumValues(value.items?.enum);
              const mappedItemType = typeof itemType === 'string' ? convertBsonTypeToMongoType(itemType) : 'Mixed';
              const resolvedType = mappedItemType !== 'Mixed' ? mappedItemType : inferredEnumType;
              field.type = resolvedType;
              field.arrayType = resolvedType;
            }
          } else {
            field.type = 'Array';
            field.isArray = false;
            field.arrayType = undefined;
          }
        } else {
          const mappedTypes = concreteBsonTypes
            .map(convertBsonTypeToMongoType)
            .filter((type) => type !== 'Mixed');
          if (mappedTypes.length === concreteBsonTypes.length) {
            field.type = 'Mixed';
            field.bsonTypes = Array.from(new Set(mappedTypes));
          } else {
            field.type = 'Mixed';
          }
        }
      } else {
        if (hasObjectProperties && normalizedBsonType !== 'array') {
          field.type = 'Document';
          field.nestedFields = convertJSONSchemaToFields(value);
          fields.push(field);
          return;
        }

        if (hasScalarEnum && normalizedBsonType !== 'array') {
          field.type = 'Enum';
          fields.push(field);
          return;
        }

        switch (normalizedBsonType) {
          case 'string':
            field.type = 'String';
            break;
          case 'number':
            field.type = 'Number';
            break;
          case 'int':
            field.type = 'Int';
            break;
          case 'double':
            field.type = 'Double';
            break;
          case 'long':
            field.type = 'Long';
            break;
          case 'bool':
          case 'boolean':
            field.type = 'Boolean';
            break;
          case 'date':
            field.type = 'Date';
            break;
          case 'timestamp':
            field.type = 'Timestamp';
            break;
          case 'objectId':
            field.type = 'ObjectId';
            break;
          case 'array':
            if (hasObjectProperties) {
              field.type = 'Document';
              field.nestedFields = convertJSONSchemaToFields(value);
              break;
            }
            if (Array.isArray(value?.items?.enum)) {
              field.enum = value.items.enum.filter((item: unknown): item is string => typeof item === 'string');
            }
            if (value.items) {
              field.isArray = true;
              const itemType = value.items.bsonType || value.items.type;
              if (itemType === 'object' || hasArrayObjectItems) {
                field.type = 'Document';
                field.arrayType = 'Document';
                field.nestedFields = convertJSONSchemaToFields(value.items);
              } else if (hasArrayEnum) {
                field.type = 'Array';
                field.arrayType = 'Enum';
              } else {
                const inferredEnumType = inferMongoTypeFromEnumValues(value.items?.enum);
                const mappedItemType = typeof itemType === 'string' ? convertBsonTypeToMongoType(itemType) : 'Mixed';
                const resolvedType = mappedItemType !== 'Mixed' ? mappedItemType : inferredEnumType;
                field.type = resolvedType;
                field.arrayType = resolvedType;
              }
            } else {
              field.type = 'Array';
              field.isArray = false;
              field.arrayType = undefined;
            }
            break;
          case 'object':
            field.type = 'Document';
            field.nestedFields = convertJSONSchemaToFields(value);
            break;
          case 'binData':
            field.type = 'Buffer';
            break;
          case 'undefined':
            field.type = 'Undefined';
            break;
          case 'dbPointer':
            field.type = 'DbPointer';
            break;
          case 'javascript':
            field.type = 'JavaScript';
            break;
          case 'javascriptWithScope':
            field.type = 'JavaScriptWithScope';
            break;
          case 'regex':
            field.type = 'Regex';
            break;
          case 'symbol':
            field.type = 'Symbol';
            break;
          case 'minKey':
            field.type = 'MinKey';
            break;
          case 'maxKey':
            field.type = 'MaxKey';
            break;
          case 'decimal':
            field.type = 'Decimal128';
            break;
          case 'null':
            field.type = 'Null';
            field.nullable = false;
            break;
          default:
            if (hasObjectProperties) {
              field.type = 'Document';
              field.nestedFields = convertJSONSchemaToFields(value);
            } else {
              field.type = 'Mixed';
            }
        }
      }

      fields.push(field);
    });

    return fields;
  };

  const convertBsonTypeToMongoType = (bsonType: string): string => {
    const typeMap: Record<string, string> = {
      string: 'String',
      number: 'Number',
      int: 'Int',
      long: 'Long',
      double: 'Double',
      bool: 'Boolean',
      boolean: 'Boolean',
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
      decimal: 'Decimal128',
      null: 'Null'
    };

    return typeMap[bsonType] || 'Mixed';
  };

  const inferMongoTypeFromEnumValues = (enumValues: unknown): string => {
    if (!Array.isArray(enumValues) || enumValues.length === 0) {
      return 'Mixed';
    }

    if (enumValues.every((value) => typeof value === 'string')) {
      return 'String';
    }

    if (enumValues.every((value) => Number.isInteger(value))) {
      return 'Int';
    }

    if (enumValues.every((value) => typeof value === 'number')) {
      return 'Number';
    }

    if (enumValues.every((value) => typeof value === 'boolean')) {
      return 'Boolean';
    }

    return 'Mixed';
  };

  const normalizeImportedModel = (name: string, schema: any, indexes: any[] = []): Model => {
    const model: Model = {
      id: Date.now().toString() + Math.random(),
      name,
      fields: normalizeImportedFields(convertJSONSchemaToFields(schema)),
      indexes: Array.isArray(indexes) ? indexes : []
    };

    if (!model.fields.find((field) => field.name === '_id')) {
      model.fields.unshift({
        name: '_id',
        type: 'ObjectId',
        required: true,
        nullable: false,
        description: '',
        nestedFields: []
      });
    }

    return model;
  };

  const normalizeRawCollectionModel = (name: string, fields: Field[], indexes: any[] = []): Model => {
    return {
      id: Date.now().toString() + Math.random(),
      name,
      fields: normalizeImportedFields(Array.isArray(fields) ? fields : []),
      indexes: Array.isArray(indexes) ? indexes : []
    };
  };

  const normalizeImportedFields = (fields: Field[]): Field[] => {
    return fields.map((field) => {
      const nestedFields = Array.isArray(field.nestedFields) ? normalizeImportedFields(field.nestedFields) : [];
      const isArray = Boolean((field as any).isArray);
      const normalizedType = field.type;

      return {
        ...field,
        type: !isArray && field.type === 'Array' ? 'Array' : normalizedType,
        isArray,
        arrayType: isArray ? field.arrayType || normalizedType || 'String' : undefined,
        arrayRef: isArray ? field.arrayRef : undefined,
        nestedFields
      };
    });
  };

  const handleImport = () => {
    setError('');

    try {
      const parsed = parseJsonContent(jsonInput);
      const models: Model[] = [];

      if (isProjectBundle(parsed)) {
        const normalizedModels = parsed.project.models.map((model) => ({
          ...model,
          fields: normalizeImportedFields(Array.isArray(model.fields) ? model.fields : [])
        }));
        onImportProject({
          ...parsed.project,
          models: normalizedModels,
          updated_at: new Date().toISOString()
        });
        setJsonInput('');
        onClose();
        return;
      }

      if (isCompassMdmFile(parsed)) {
        const mdmProject = parseCompassMdmToProject(parsed, normalizeImportedModel);
        if (mdmProject.models.length === 0) {
          setError(copy.noCollections);
          return;
        }
        onImportProject({
          ...mdmProject,
          id: Date.now().toString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        setJsonInput('');
        onClose();
        return;
      }

      if (isMoomDmmFile(parsed)) {
        const dmmProject = parseMoomDmmToProject(parsed);
        if (dmmProject.models.length === 0) {
          setError(copy.noCollections);
          return;
        }
        onImportProject({
          ...dmmProject,
          id: Date.now().toString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        setJsonInput('');
        onClose();
        return;
      }

      if (isLegacyProjectData(parsed)) {
        const normalizedModels = parsed.models.map((model) => ({
          ...model,
          fields: normalizeImportedFields(Array.isArray(model.fields) ? model.fields : [])
        }));
        onImportProject({
          ...parsed,
          models: normalizedModels,
          id: parsed.id || Date.now().toString(),
          created_at: parsed.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        setJsonInput('');
        onClose();
        return;
      }

      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (item.collection || item.name) {
            const collectionName = item.collection || item.name;
            const schema = item.validator || item.schema || item;
            models.push(normalizeImportedModel(collectionName, schema, item.indexes));
          }
        });
      } else if (parsed.collections && Array.isArray(parsed.collections)) {
        parsed.collections.forEach((item: any) => {
          const collectionName = item.collection || item.name;
          if (!collectionName) {
            return;
          }
          const schema = item.validator || item.schema || item;
          models.push(normalizeImportedModel(collectionName, schema, item.indexes));
        });
      } else if (
        (parsed.collection || parsed.name) &&
        Array.isArray(parsed.fields)
      ) {
        const collectionName = parsed.collection || parsed.name;
        models.push(normalizeRawCollectionModel(collectionName, parsed.fields, parsed.indexes));
      } else if (parsed.$jsonSchema || parsed.properties) {
        const collectionName = parsed.collection || parsed.name || parsed.$jsonSchema?.title || 'ImportedCollection';
        models.push(normalizeImportedModel(collectionName, parsed));
      } else if (typeof parsed === 'object' && parsed !== null) {
        Object.entries(parsed).forEach(([collectionName, schema]) => {
          if (schema && typeof schema === 'object' && ('$jsonSchema' in schema || 'properties' in schema)) {
            models.push(normalizeImportedModel(collectionName, schema));
          }
        });

        if (models.length === 0) {
          setError(copy.invalidFormat);
          return;
        }
      } else {
        setError(copy.invalidFormat);
        return;
      }

      if (models.length === 0) {
        setError(copy.noCollections);
        return;
      }

      onImport(models);
      setJsonInput('');
      onClose();
    } catch (err) {
      setError(copy.invalidJson(err instanceof Error ? err.message : copy.unknownError));
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setJsonInput(content);
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogContent>
        <div className="space-y-4 mt-2 text-slate-100">
          {error && <Alert severity="error" sx={{ backgroundColor: 'rgba(127,29,29,0.28)', color: '#fecaca', border: '1px solid rgba(248,113,113,0.35)' }}>{error}</Alert>}

          <div>
            <Button variant="outlined" component="label" fullWidth>
              {copy.upload}
              <input
                type="file"
                hidden
                accept=".json,.mdm,.dmm,application/json,text/json"
                onChange={handleFileUpload}
              />
            </Button>
          </div>

          <TextField
            label={copy.pasteLabel}
            multiline
            rows={15}
            fullWidth
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={copy.placeholder}
          />
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{copy.cancel}</Button>
        <Button variant="contained" onClick={handleImport} startIcon={<Upload className="w-4 h-4" />}>
          {copy.importAction}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function parseJsonContent(content: string) {
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    // Remove hidden control characters and JSON-breaking separators.
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

function isCompassMdmFile(value: unknown): value is { type: string; edits: string } {
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

function parseCompassMdmToModels(
  mdm: { edits: string },
  normalizeImportedModel: (name: string, schema: any, indexes?: any[]) => Model
): Model[] {
  const editsJson = decodeBase64Utf8(mdm.edits);
  const edits = JSON.parse(editsJson);
  if (!Array.isArray(edits)) return [];

  const setModelEvents = edits.filter((entry) => entry?.type === 'SetModel' && entry?.model?.collections);
  if (setModelEvents.length === 0) return [];

  const latestSetModel = setModelEvents[setModelEvents.length - 1];
  const collections = latestSetModel.model.collections;
  if (!Array.isArray(collections)) return [];

  return collections
    .filter((collection: any) => typeof collection?.ns === 'string' && collection?.fieldData)
    .map((collection: any) => {
      const ns = collection.ns as string;
      const collectionName = ns.includes('.') ? ns.split('.').slice(1).join('.') : ns;
      const schema = { $jsonSchema: collection.fieldData };
      return normalizeImportedModel(collectionName, schema, collection.indexes || []);
    });
}

function parseCompassMdmToProject(
  mdm: { edits: string; name?: string },
  normalizeImportedModel: (name: string, schema: any, indexes?: any[]) => Model
): ProjectData {
  const editsJson = decodeBase64Utf8(mdm.edits);
  const edits = JSON.parse(editsJson);
  if (!Array.isArray(edits)) {
    return { id: '', name: mdm.name || 'Imported MDM Project', models: [], relations: [], diagramSheets: [] };
  }

  const models = parseCompassMdmToModels(mdm, normalizeImportedModel);
  const relations = parseCompassRelationships(edits, models);
  return {
    id: '',
    name: mdm.name || 'Imported MDM Project',
    models,
    relations,
    diagramSheets: buildDefaultDiagramSheets(models.map((model) => model.id))
  };
}

function parseCompassRelationships(edits: any[], models: Model[]): Relation[] {
  const modelByNs = new Map<string, Model>();
  models.forEach((model) => modelByNs.set(model.name, model));

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

    relations.push({
      id: relationship.id,
      fromModelId: fromModel.id,
      fromFieldPath: Array.isArray(left?.fields) && left.fields.length ? left.fields.join('.') : '',
      toModelId: toModel.id,
      toFieldPath: Array.isArray(right?.fields) && right.fields.length ? right.fields.join('.') : '',
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
    id: createStableImportId(`table:${tableId}`),
    name: typeof table?.name === 'string' && table.name.trim() ? table.name : 'ImportedCollection',
    fields: parseMoomColumnsToFields(table?.cols, embeddableTables, datatypeAliases),
    indexes: parseMoomIndexes(table?.indexes, table?.cols)
  }));

  const modelIdByTableId = new Map(rootTables.map(([tableId], index) => [tableId, models[index].id]));
  const diagramSheets = parseMoomDiagrams(dmm.diagrams, dmm.diagramsOrder, modelIdByTableId);

  return {
    id: '',
    name: dmm.model?.name || 'Imported DMM Project',
    models,
    relations: [],
    diagramSheets: diagramSheets.length ? diagramSheets : buildDefaultDiagramSheets(models.map((model) => model.id))
  };
}

function parseMoomColumnsToFields(
  cols: any[],
  embeddableTables: Map<string, any>,
  datatypeAliases: Map<string, any>
): Field[] {
  if (!Array.isArray(cols)) {
    return [];
  }

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
        } satisfies Field;
      }

      return {
        name: col?.name || 'field',
        type: 'Document',
        required,
        nullable,
        description: col?.comment || '',
        nestedFields
      } satisfies Field;
    }

    const scalarType = mapMoomDatatypeToMongoType(datatype, datatypeAlias);
    const baseField: Field = {
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
        ...baseField,
        isArray: true,
        arrayType: scalarType
      };
    }

    return baseField;
  });
}

function parseMoomIndexes(indexes: any[], cols: any[]) {
  if (!Array.isArray(indexes)) {
    return [];
  }

  const columnNameById = new Map(
    Array.isArray(cols) ? cols.map((col) => [col?.id, col?.name]).filter(([id, name]) => id && name) : []
  );

  return indexes.map((index) => ({
    id: typeof index?.id === 'string' ? index.id : createStableImportId(`index:${index?.name || Math.random()}`),
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
  }));
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
      if (!diagram) {
        return null;
      }

      const modelIds: string[] = [];
      const modelPositions: Record<string, { x: number; y: number }> = {};

      Object.values(diagram.diagramItems || {}).forEach((item: any) => {
        const tableId = item?.referencedItemId;
        const modelId = modelIdByTableId.get(tableId);
        if (!modelId) {
          return;
        }
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

function createStableImportId(seed: string) {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 10)}`;
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
