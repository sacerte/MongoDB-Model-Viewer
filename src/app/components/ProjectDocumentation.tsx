import { useEffect, useMemo, useState } from 'react';
import { Button, Card, CardContent, CircularProgress, IconButton, InputAdornment, TextField, Tooltip } from '@mui/material';
import { Sparkles } from 'lucide-react';
import type { Model } from './MongoModelBuilder';
import type { ProjectData } from '../utils/projectBundle';
import { useAppLanguage } from '../i18n';
import { generateAIDescription, generateAIDocumentationText } from '../utils/aiDescription';

interface Props {
  projectName: string;
  models: Model[];
  documentation: NonNullable<ProjectData['documentation']>;
  onUpdateDocumentation: (next: NonNullable<ProjectData['documentation']>) => void;
  aiContext?: string;
  aiModel?: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
}

export default function ProjectDocumentation({ projectName, models, documentation, onUpdateDocumentation, aiContext, aiModel, aiApiKey, aiBaseUrl }: Props) {
  const { language } = useAppLanguage();
  const [loadingKey, setLoadingKey] = useState('');
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const copy = useMemo(() => language === 'es' ? {
    title: 'Documentacion del modelo',
    modelDescription: 'Descripcion del modelo',
    generateAI: 'Generar con IA',
    collections: 'Colecciones',
    indexes: 'Indices',
    indexDescription: 'Descripcion del indice',
    objective: 'Objetivo',
    command: 'Comando de creacion',
    exportMd: 'Exportar Markdown',
    regenerate: 'Regenerar documentacion'
  } : {
    title: 'Model documentation',
    modelDescription: 'Model description',
    generateAI: 'Generate with AI',
    collections: 'Collections',
    indexes: 'Indexes',
    indexDescription: 'Index description',
    objective: 'Objective',
    command: 'Create command',
    exportMd: 'Export Markdown',
    regenerate: 'Regenerate documentation'
  }, [language]);

  const updateDoc = (next: Partial<NonNullable<ProjectData['documentation']>>) => onUpdateDocumentation({ ...documentation, ...next });

  useEffect(() => {
    const nextIndexes = { ...(documentation.indexes || {}) };
    let changed = false;

    models.forEach((model) => {
      (model.indexes || []).forEach((idx) => {
        const key = `${model.id}:${idx.id}`;
        const current = nextIndexes[key] || {};
        const nextCommand = current.createCommand || buildIndexCreateCommand(model.name, idx);
        if (!nextIndexes[key] || nextIndexes[key].createCommand !== nextCommand) {
          nextIndexes[key] = {
            description: current.description || '',
            objective: current.objective || '',
            createCommand: nextCommand
          };
          changed = true;
        }
      });
    });

    if (changed) {
      onUpdateDocumentation({
        ...documentation,
        indexes: nextIndexes
      });
    }
  }, [models, documentation, onUpdateDocumentation]);

  const generate = async (key: string, fieldName: string, type: string, modelName: string, target: (text: string) => void) => {
    setLoadingKey(key);
    const text = await generateAIDescription(fieldName, type, modelName, aiContext, aiModel, aiApiKey, aiBaseUrl);
    target(text);
    setLoadingKey('');
  };

  const generateDocText = async (key: string, builder: () => Promise<string>, target: (text: string) => void) => {
    setLoadingKey(key);
    const text = await builder();
    target(text);
    setLoadingKey('');
  };

  const generateAllWithAI = async () => {
    setIsBulkGenerating(true);
    try {
      const modelDescription = await generateAIDocumentationText(
        'model_description',
        { projectName },
        aiContext,
        aiModel,
        aiApiKey,
        aiBaseUrl
      );
      const nextCollections = { ...(documentation.collections || {}) };
      const nextIndexes = { ...(documentation.indexes || {}) };

      for (const model of models) {
        const collectionDescription = await generateAIDocumentationText(
          'collection_description',
          { projectName, collectionName: model.name },
          aiContext,
          aiModel,
          aiApiKey,
          aiBaseUrl
        );
        nextCollections[model.id] = {
          ...(nextCollections[model.id] || {}),
          description: collectionDescription
        };

        for (const idx of model.indexes || []) {
          const key = `${model.id}:${idx.id}`;
          const indexDescription = await generateAIDocumentationText(
            'index_description',
            {
              projectName,
              collectionName: model.name,
              indexName: idx.name,
              indexType: idx.type,
              indexFields: (idx.fields || []).map((field) => field.field),
              isUnique: Boolean(idx.unique),
              isSparse: Boolean(idx.sparse)
            },
            aiContext,
            aiModel,
            aiApiKey,
            aiBaseUrl
          );
          const indexObjective = await generateAIDocumentationText(
            'index_objective',
            {
              projectName,
              collectionName: model.name,
              indexName: idx.name,
              indexType: idx.type,
              indexFields: (idx.fields || []).map((field) => field.field),
              isUnique: Boolean(idx.unique),
              isSparse: Boolean(idx.sparse)
            },
            aiContext,
            aiModel,
            aiApiKey,
            aiBaseUrl
          );
          nextIndexes[key] = {
            ...(nextIndexes[key] || {}),
            description: indexDescription,
            objective: indexObjective,
            createCommand: nextIndexes[key]?.createCommand || buildIndexCreateCommand(model.name, idx)
          };
        }
      }

      onUpdateDocumentation({
        ...documentation,
        modelDescription,
        collections: nextCollections,
        indexes: nextIndexes
      });
    } finally {
      setIsBulkGenerating(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportMarkdown = () => {
    const lines: string[] = [];
    lines.push(`# Modelo ${projectName}`);
    lines.push('');
    lines.push('## Descripcion del Modelo');
    lines.push(documentation.modelDescription || '');
    lines.push('');
    lines.push('## Colecciones');
    models.forEach((model) => {
      lines.push(`### ${model.name}`);
      lines.push(documentation.collections?.[model.id]?.description || '');
      lines.push('');
      if ((model.indexes || []).length > 0) {
        lines.push(`#### ${copy.indexes}`);
        (model.indexes || []).forEach((idx) => {
          const key = `${model.id}:${idx.id}`;
          const current = documentation.indexes?.[key] || {};
          lines.push(`- ${idx.name}`);
          lines.push(`  - Descripcion: ${current.description || ''}`);
          lines.push(`  - Objetivo: ${current.objective || ''}`);
          lines.push('  - Comando:');
          lines.push('```javascript');
          lines.push(current.createCommand || '');
          lines.push('```');
        });
      }
      lines.push('');
    });
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' }), `${projectName.replace(/\s+/g, '_')}_documentation.md`);
  };

  return <div className="h-full overflow-auto p-6 text-slate-100 space-y-4">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-2xl font-bold">Modelo {projectName}</h2>
      <div className="flex gap-2">
        <Button variant="outlined" color="warning" onClick={generateAllWithAI} disabled={isBulkGenerating} startIcon={isBulkGenerating ? <CircularProgress size={16} /> : undefined}>
          {isBulkGenerating ? 'Generando...' : copy.regenerate}
        </Button>
        <Button variant="contained" onClick={exportMarkdown}>{copy.exportMd}</Button>
      </div>
    </div>
    <Card><CardContent className="space-y-3">
      <TextField
        fullWidth
        label={copy.modelDescription}
        multiline
        minRows={3}
        value={documentation.modelDescription || ''}
        onChange={(e) => updateDoc({ modelDescription: e.target.value })}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title={copy.generateAI}>
                <IconButton
                  size="small"
                  onClick={() =>
                    generateDocText('model', () =>
                      generateAIDocumentationText('model_description', { projectName }, aiContext, aiModel, aiApiKey, aiBaseUrl)
                    , (text) =>
                      updateDoc({ modelDescription: text })
                    )
                  }
                >
                  {loadingKey === 'model' ? <CircularProgress size={16} /> : <Sparkles size={16} />}
                </IconButton>
              </Tooltip>
            </InputAdornment>
          )
        }}
      />
    </CardContent></Card>

    <Card><CardContent className="space-y-4"><h3>{copy.collections}</h3>
      {models.map((m) => {
        return <div key={m.id} className="space-y-2 rounded-lg border border-slate-600/20 p-3">
          <div className="font-semibold">{m.name}</div>
          <TextField
            fullWidth
            label={copy.modelDescription}
            multiline
            minRows={2}
            value={documentation.collections?.[m.id]?.description || ''}
            onChange={(e) => updateDoc({ collections: { ...(documentation.collections || {}), [m.id]: { description: e.target.value } } })}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={copy.generateAI}>
                    <IconButton
                      size="small"
                      onClick={() =>
                        generateDocText(
                          `col-${m.id}`,
                          () => generateAIDocumentationText('collection_description', { projectName, collectionName: m.name }, aiContext, aiModel, aiApiKey, aiBaseUrl),
                          (text) => updateDoc({ collections: { ...(documentation.collections || {}), [m.id]: { description: text } } })
                        )
                      }
                    >
                      {loadingKey === `col-${m.id}` ? <CircularProgress size={16} /> : <Sparkles size={16} />}
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              )
            }}
          />
          {(m.indexes || []).length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="text-sm font-semibold">{copy.indexes}</div>
              {(m.indexes || []).map((idx) => {
                const key = `${m.id}:${idx.id}`;
                const current = documentation.indexes?.[key] || {};
                return <div key={key} className="space-y-2 rounded-lg border border-slate-600/20 p-3">
                  <div className="font-semibold">{idx.name}</div>
                  <TextField
                    fullWidth
                    label={copy.indexDescription}
                    multiline
                    minRows={2}
                    value={current.description || ''}
                    onChange={(e) => updateDoc({ indexes: { ...(documentation.indexes || {}), [key]: { ...current, description: e.target.value } } })}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title={copy.generateAI}>
                            <IconButton
                              size="small"
                              onClick={() =>
                                generateDocText(
                                  `idxd-${key}`,
                                  () =>
                                    generateAIDocumentationText(
                                      'index_description',
                                      {
                                        projectName,
                                        collectionName: m.name,
                                        indexName: idx.name,
                                        indexType: idx.type,
                                        indexFields: (idx.fields || []).map((field) => field.field),
                                        isUnique: Boolean(idx.unique),
                                        isSparse: Boolean(idx.sparse)
                                      },
                                      aiContext,
                                      aiModel,
                                      aiApiKey,
                                      aiBaseUrl
                                    ),
                                  (text) => updateDoc({ indexes: { ...(documentation.indexes || {}), [key]: { ...current, description: text } } })
                                )
                              }
                            >
                              {loadingKey === `idxd-${key}` ? <CircularProgress size={16} /> : <Sparkles size={16} />}
                            </IconButton>
                          </Tooltip>
                        </InputAdornment>
                      )
                    }}
                  />
                  <TextField
                    fullWidth
                    label={copy.objective}
                    multiline
                    minRows={2}
                    value={current.objective || ''}
                    onChange={(e) => updateDoc({ indexes: { ...(documentation.indexes || {}), [key]: { ...current, objective: e.target.value } } })}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title={copy.generateAI}>
                            <IconButton
                              size="small"
                              onClick={() =>
                                generateDocText(
                                  `idxo-${key}`,
                                  () =>
                                    generateAIDocumentationText(
                                      'index_objective',
                                      {
                                        projectName,
                                        collectionName: m.name,
                                        indexName: idx.name,
                                        indexType: idx.type,
                                        indexFields: (idx.fields || []).map((field) => field.field),
                                        isUnique: Boolean(idx.unique),
                                        isSparse: Boolean(idx.sparse)
                                      },
                                      aiContext,
                                      aiModel,
                                      aiApiKey,
                                      aiBaseUrl
                                    ),
                                  (text) => updateDoc({ indexes: { ...(documentation.indexes || {}), [key]: { ...current, objective: text } } })
                                )
                              }
                            >
                              {loadingKey === `idxo-${key}` ? <CircularProgress size={16} /> : <Sparkles size={16} />}
                            </IconButton>
                          </Tooltip>
                        </InputAdornment>
                      )
                    }}
                  />
                  <TextField fullWidth label={copy.command} multiline minRows={2} value={current.createCommand || ''} InputProps={{ readOnly: true }} />
                </div>;
              })}
            </div>
          )}
        </div>;
      })}
    </CardContent></Card>
  </div>;
}

function buildIndexCreateCommand(collectionName: string, idx: Model['indexes'][number]) {
  const safeCollectionName = String(collectionName || '').trim() || 'collection';
  const collectionExpr = `db.getCollection(${JSON.stringify(safeCollectionName)})`;
  if (idx.type === 'atlas_search') {
    return `${collectionExpr}.createSearchIndex(${JSON.stringify(idx.name || 'index_name')}, ${idx.searchDefinition || '{ mappings: { dynamic: true } }'})`;
  }

  if (idx.type === 'wildcard') {
    const fieldsObject = (idx.fields || [])
      .filter((field) => field.field)
      .map((field) => `${JSON.stringify(String(field.field || 'field'))}: ${formatIndexFieldValue(field)}`)
      .join(', ');
    const wildcardPath = fieldsObject || `${JSON.stringify('$**')}: 1`;
    const options = buildIndexOptionsParts(idx);
    if (idx.wildcardProjection) {
      options.push(`wildcardProjection: ${idx.wildcardProjection}`);
    }
    const optionsPart = options.length > 0 ? `, { ${options.join(', ')} }` : '';
    return `${collectionExpr}.createIndex({ ${wildcardPath} }${optionsPart})`;
  }

  const fieldsObject = (idx.fields || [])
    .map((field) => `${JSON.stringify(String(field.field || 'field'))}: ${formatIndexFieldValue(field)}`)
    .join(', ');
  const options = buildIndexOptionsParts(idx);
  const optionsPart = options.length > 0 ? `, { ${options.join(', ')} }` : '';
  return `${collectionExpr}.createIndex({ ${fieldsObject} }${optionsPart})`;
}

function formatIndexFieldValue(field: Model['indexes'][number]['fields'][number]) {
  switch (field.mode) {
    case 'text':
    case 'hashed':
    case '2dsphere':
    case '2d':
      return JSON.stringify(field.mode);
    default:
      return field.order === 'desc' ? -1 : 1;
  }
}

function buildIndexOptionsParts(idx: Model['indexes'][number]) {
  const options: string[] = [];
  if (idx.name) options.push(`name: ${JSON.stringify(String(idx.name))}`);
  if (idx.unique) options.push('unique: true');
  if (idx.sparse) options.push('sparse: true');
  if (idx.background) options.push('background: true');
  if (idx.hidden) options.push('hidden: true');
  if (typeof idx.expireAfterSeconds === 'number' && Number.isFinite(idx.expireAfterSeconds)) {
    options.push(`expireAfterSeconds: ${idx.expireAfterSeconds}`);
  }
  if (idx.partialFilterExpression) {
    options.push(`partialFilterExpression: ${idx.partialFilterExpression}`);
  }
  if (idx.collation) {
    options.push(`collation: ${idx.collation}`);
  }
  return options;
}
