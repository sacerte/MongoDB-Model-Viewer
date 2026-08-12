import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  FormGroup
} from '@mui/material';
import { Model } from './MongoModelBuilder';
import { Download } from 'lucide-react';
import { createProjectBundle, DiagramSheet, ProjectData, Relation } from '../utils/projectBundle';
import {
  generateIndexExportPayload,
  generateValidationSchema,
  sanitizeExportName
} from '../utils/mongoSchema';
import { buildMoomDmmExport } from '../utils/moomDmmExport';
import { useAppLanguage } from '../i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  models: Model[];
  projectName: string;
  currentProject: ProjectData | null;
  relations: Relation[];
  diagramSheets: DiagramSheet[];
}

export default function ExportDialog({ open, onClose, models, projectName, currentProject, relations, diagramSheets }: Props) {
  const { language } = useAppLanguage();
  const copy =
    language === 'es'
      ? {
          title: 'Exportar',
          format: 'Formato de exportación',
          collections: 'Seleccionar colecciones',
          json: 'Definiciones de colecciones (JSON, un archivo por colección)',
          schema: 'JSON Schema (un archivo por colección)',
          indexes: 'Definiciones de índices (JSON, un archivo por índice)',
          all: 'Exportación completa (ZIP con colecciones, schemas e índices)',
          project: 'Archivo de proyecto (volver a abrir en esta app)',
          moom: 'Archivo Moom Modeler (.dmm)',
          selectAtLeastOne: 'Selecciona al menos una colección para exportar.',
          noFiles: 'No se generaron archivos exportables. Revisa si las colecciones seleccionadas tienen índices.',
          cancel: 'Cancelar',
          exportAction: 'Exportar'
        }
      : {
          title: 'Export Schema',
          format: 'Export Format',
          collections: 'Select Collections',
          json: 'Collection Definitions (JSON, one file per collection)',
          schema: 'JSON Schemas (one file per collection)',
          indexes: 'Index Definitions (JSON, one file per index)',
          all: 'Complete Export (ZIP with collections, schemas, indexes)',
          project: 'Project File (reopen in this app)',
          moom: 'Moom Modeler File (.dmm)',
          selectAtLeastOne: 'Please select at least one collection to export',
          noFiles: 'No exportable files were generated. Check whether the selected collections have indexes.',
          cancel: 'Cancel',
          exportAction: 'Export'
        };

  const [exportFormat, setExportFormat] = useState<'json' | 'schema' | 'indexes' | 'all' | 'project' | 'moom'>('project');
  const [selectedModels, setSelectedModels] = useState<string[]>(models.map((m) => m.id));

  useEffect(() => {
    setSelectedModels(models.map((model) => model.id));
  }, [models, open]);

  const buildCollectionDefinitionPayload = (model: Model) => {
    return {
      collection: model.name,
      fields: model.fields,
      indexes: model.indexes
    };
  };

  const handleExport = async () => {
    const projectVersion = currentProject?.version || 1;
    const versionSuffix = `V${projectVersion}`;
    const filteredModels = models.filter((m) => selectedModels.includes(m.id));

    if (exportFormat === 'project') {
      const projectBundle = createProjectBundle(
        projectName,
        filteredModels.length ? filteredModels : models,
        relations,
        diagramSheets,
        currentProject
      );
      downloadFile(
        JSON.stringify(projectBundle, null, 2),
        `${sanitizeExportName(projectName)}_${versionSuffix}.mdm`,
        'application/json'
      );
      onClose();
      return;
    }

    if (exportFormat === 'moom') {
      const dmmPayload = buildMoomDmmExport(
        projectName,
        filteredModels.length ? filteredModels : models,
        relations,
        diagramSheets,
        currentProject
      );
      downloadFile(
        JSON.stringify(dmmPayload, null, 2),
        `${sanitizeExportName(projectName)}_${versionSuffix}.dmm`,
        'application/json'
      );
      onClose();
      return;
    }

    if (filteredModels.length === 0) {
      alert(copy.selectAtLeastOne);
      return;
    }

    const files: Array<{ path: string; content: string }> = [];

    if (exportFormat === 'json' || exportFormat === 'all') {
      filteredModels.forEach((model) => {
        files.push({
          path: `collections/${sanitizeExportName(model.name)}.json`,
          content: JSON.stringify(buildCollectionDefinitionPayload(model), null, 2)
        });
      });
    }

    if (exportFormat === 'schema' || exportFormat === 'all') {
      filteredModels.forEach((model) => {
        files.push({
          path: `schemas/${sanitizeExportName(model.name)}.json`,
          content: JSON.stringify(generateValidationSchema(model), null, 2)
        });
      });
    }

    if (exportFormat === 'indexes' || exportFormat === 'all') {
      filteredModels.forEach((model) => {
        model.indexes?.forEach((index) => {
          files.push({
            path: `indexes/${sanitizeExportName(model.name)}/${sanitizeExportName(index.name)}.json`,
            content: JSON.stringify(generateIndexExportPayload(model, index), null, 2)
          });
        });
      });
    }

    if (exportFormat === 'all') {
      files.push({
        path: 'manifest.json',
        content: JSON.stringify(
          {
            project: projectName,
            version: currentProject?.version || 1,
            exported_at: new Date().toISOString(),
            collections: filteredModels.map((model) => ({
              name: model.name,
              schema_file: `schemas/${sanitizeExportName(model.name)}.json`,
              collection_file: `collections/${sanitizeExportName(model.name)}.json`,
              indexes: (model.indexes || []).map((index) => ({
                name: index.name,
                file: `indexes/${sanitizeExportName(model.name)}/${sanitizeExportName(index.name)}.json`
              }))
            }))
          },
          null,
          2
        )
      });
    }

    if (files.length === 0) {
      alert(copy.noFiles);
      return;
    }

    if (files.length === 1) {
      const [file] = files;
      const base = file.path.split('/').pop() || 'export.json';
      const [name, ext] = base.split('.');
      downloadFile(file.content, `${name}_${versionSuffix}.${ext || 'json'}`, 'application/json');
    } else {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      files.forEach((file) => {
        zip.file(file.path, file.content);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, `${sanitizeExportName(projectName)}_${versionSuffix}-${exportFormat}-export.zip`);
    }

    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogContent>
        <div className="space-y-4 mt-2 text-slate-100">
          <FormControl component="fieldset">
            <FormLabel component="legend">{copy.format}</FormLabel>
            <RadioGroup value={exportFormat} onChange={(e) => setExportFormat(e.target.value as any)}>
              <FormControlLabel value="json" control={<Radio />} label={copy.json} />
              <FormControlLabel value="schema" control={<Radio />} label={copy.schema} />
              <FormControlLabel value="indexes" control={<Radio />} label={copy.indexes} />
              <FormControlLabel value="all" control={<Radio />} label={copy.all} />
              <FormControlLabel value="project" control={<Radio />} label="Archivo de proyecto (.mdm)" />
              <FormControlLabel value="moom" control={<Radio />} label={copy.moom} />
            </RadioGroup>
          </FormControl>

          {exportFormat !== 'project' && exportFormat !== 'moom' && (
            <FormControl component="fieldset">
              <FormLabel component="legend">{copy.collections}</FormLabel>
              <FormGroup>
                {models.map((model) => (
                  <FormControlLabel
                    key={model.id}
                    control={
                      <Checkbox
                        checked={selectedModels.includes(model.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedModels([...selectedModels, model.id]);
                          } else {
                            setSelectedModels(selectedModels.filter((id) => id !== model.id));
                          }
                        }}
                      />
                    }
                    label={model.name}
                  />
                ))}
              </FormGroup>
            </FormControl>
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{copy.cancel}</Button>
        <Button variant="contained" onClick={handleExport} startIcon={<Download className="w-4 h-4" />}>
          {copy.exportAction}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildCompassMdmExport(projectName: string, models: Model[], relations: Relation[]) {
  const now = new Date().toISOString();
  const database = sanitizeExportName(projectName) || 'database';
  const modelById = new Map(models.map((model) => [model.id, model]));
  const collections = models.map((model, index) => ({
    ns: `${database}.${model.name}`,
    fieldData: convertFieldsToBsonSchema(model.fields),
    indexes: Array.isArray(model.indexes) ? model.indexes : [],
    displayPosition: [15 + index * 120, 15 + index * 80]
  }));
  const relationshipPayloads = relations
    .map((relation) => {
      const fromModel = modelById.get(relation.fromModelId);
      const toModel = modelById.get(relation.toModelId);
      if (!fromModel || !toModel) return null;
      return {
        id: relation.id || crypto.randomUUID(),
        relationship: [
          {
            ns: `${database}.${fromModel.name}`,
            cardinality: mapRelationCardinality(relation.type),
            fields: relation.fromFieldPath ? relation.fromFieldPath.split('.') : null
          },
          {
            ns: `${database}.${toModel.name}`,
            cardinality: mapRelationCardinality(relation.type),
            fields: relation.toFieldPath ? relation.toFieldPath.split('.') : null
          }
        ],
        isInferred: false,
        note: relation.label || ''
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const edits: any[] = [
    {
      id: crypto.randomUUID(),
      timestamp: now,
      type: 'SetModel',
      model: { collections, relationships: relationshipPayloads }
    }
  ];

  relationshipPayloads.forEach((relationship) => {
    edits.push({
      id: crypto.randomUUID(),
      timestamp: now,
      type: 'AddRelationship',
      relationship
    });
  });

  return {
    type: 'Compass Data Modeling Diagram',
    version: 1,
    name: sanitizeExportName(projectName) || 'diagram',
    database,
    edits: encodeBase64Utf8(JSON.stringify(edits))
  };
}

function mapRelationCardinality(type: Relation['type']) {
  switch (type) {
    case 'one-to-many':
      return null;
    case 'many-to-many':
      return null;
    case 'one-to-one':
    default:
      return 1;
  }
}

function convertFieldsToBsonSchema(fields: any[]): any {
  const properties: Record<string, any> = {};
  const required: string[] = [];
  (fields || []).forEach((field) => {
    if (!field?.name) return;
    if (field.required) required.push(field.name);
    properties[field.name] = toBsonDefinition(field);
  });
  return { bsonType: 'object', properties, required };
}

function toBsonDefinition(field: any): any {
  if (field.type === 'Document') {
    const definition = { bsonType: 'object', ...convertFieldsToBsonSchema(field.nestedFields || []) } as Record<string, any>;
    if (field.enum && field.enum.length > 0) {
      definition.enum = field.enum;
    }
    return definition;
  }
  if (field.type === 'Array') {
    // If no explicit arrayType was selected, emit a plain array schema without `items`.
    if (!field.arrayType) {
      const definition = { bsonType: 'array' } as Record<string, any>;
      if (field.enum && field.enum.length > 0) {
        definition.enum = field.enum;
      }
      return definition;
    }

    const itemType = field.arrayType;
    if (itemType === 'Document') {
      const definition = {
        bsonType: 'array',
        items: { bsonType: 'object', ...convertFieldsToBsonSchema(field.nestedFields || []) }
      } as Record<string, any>;
      if (field.enum && field.enum.length > 0) {
        definition.enum = field.enum;
      }
      return definition;
    }

    if (itemType === 'Enum') {
      const definition = { bsonType: 'array', items: {} } as Record<string, any>;
      if (field.enum && field.enum.length > 0) {
        definition.items.enum = field.enum;
      }
      return definition;
    }

    if (itemType === 'Array') {
      const definition = { bsonType: 'array', items: { bsonType: 'array' } } as Record<string, any>;
      if (field.arrayType !== 'Enum' && field.enum && field.enum.length > 0) {
        definition.enum = field.enum;
      }
      return definition;
    }

    const definition = { bsonType: 'array', items: { bsonType: mongoTypeToBsonType(itemType) } } as Record<string, any>;
    if (field.arrayType !== 'Enum' && field.enum && field.enum.length > 0) {
      definition.enum = field.enum;
    }
    return definition;
  }
  if (field.type === 'Enum') {
    const definition = {} as Record<string, any>;
    if (field.enum && field.enum.length > 0) {
      definition.enum = field.enum;
    }
    return definition;
  }
  const definition = { bsonType: mongoTypeToBsonType(field.type) } as Record<string, any>;
  if (field.enum && field.enum.length > 0) {
    definition.enum = field.enum;
  }
  return definition;
}

function mongoTypeToBsonType(type: string): string {
  const map: Record<string, string> = {
    String: 'string',
    Int: 'int',
    Number: 'number',
    Double: 'double',
    Long: 'long',
    Boolean: 'bool',
    Date: 'date',
    Timestamp: 'timestamp',
    ObjectId: 'objectId',
    Array: 'array',
    Buffer: 'binData',
    Undefined: 'undefined',
    DbPointer: 'dbPointer',
    JavaScript: 'javascript',
    JavaScriptWithScope: 'javascriptWithScope',
    Regex: 'regex',
    Symbol: 'symbol',
    MinKey: 'minKey',
    MaxKey: 'maxKey',
    Decimal128: 'decimal',
    Mixed: 'string',
    Null: 'null'
  };
  return map[type] || 'string';
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}
