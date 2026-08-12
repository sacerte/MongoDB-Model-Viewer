import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Tooltip,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Dialog,
  DialogContent
} from '@mui/material';
import { ChevronDown, Download, Sparkles } from 'lucide-react';
import type { Field, Model } from './MongoModelBuilder';
import {
  buildDataDictionaryWorkbookBuffer,
  flattenModelFields,
  formatDisplayFieldPath,
  formatDisplayFieldType,
  normalizeFieldArray,
  updateFieldDescription
} from '../utils/dataDictionary';
import { useAppLanguage } from '../i18n';
// Importamos tu nueva utilidad
import { generateAIDescription } from '../utils/aiDescription';

interface Props {
  models: Model[];
  projectName: string;
  aiContext?: string;
  aiModel?: string;
  onUpdateAiContext: (value: string) => void;
  onUpdateAiModel: (value: string) => void;
  onUpdateModel: (model: Model) => void;
  aiApiKey?: string;
  aiBaseUrl?: string;
}

interface DescriptionEditorProps {
  label: string;
  value: string;
  field: any; // Contexto para la IA
  modelName: string; // Contexto para la IA
  aiContext?: string;
  aiModel?: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
  onCommit: (nextValue: string) => void;
}

interface ModelAccordionProps {
  model: Model;
  aiContext?: string;
  aiModel?: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
  copy: DictionaryCopy;
  expanded: boolean;
  onToggle: (nextExpanded: boolean) => void;
  onUpdateModel: (model: Model) => void;
  fieldCount: number;
}

type DictionaryCopy = {
  empty: string;
  title: string;
  subtitle: string;
  download: string;
  downloading: string;
  fields: string;
  indexes: string;
  fieldPath: string;
  type: string;
  array: string;
  required: string;
  description: string;
  yes: string;
  no: string;
  customDescription: string;
  fieldCount: string;
  indexCount: string;
  indexName: string;
  properties: string;
  atlasSearchIndex: string;
  unique: string;
  sparse: string;
  asc: string;
  noIndexes: string;
  generatingExcel: string;
};

function DescriptionEditor({
  label,
  value,
  field,
  modelName,
  aiContext,
  aiModel,
  aiApiKey,
  aiBaseUrl,
  onCommit
}: DescriptionEditorProps) {
  const [draft, setDraft] = useState(value);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const handleGenerateAI = async () => {
    setIsGenerating(true);
    try {
      // Usamos el path del campo y el nombre del modelo para el prompt
      const aiResponse = await generateAIDescription(field.path, field.type, modelName, aiContext, aiModel, aiApiKey, aiBaseUrl);
      setDraft(aiResponse);
      onCommit(aiResponse);
    } catch (error) {
      console.error("Error generating AI description", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const commitDraft = () => {
    if (draft.trim() === value.trim()) return;
    onCommit(draft);
  };

  return (
    <TextField
      fullWidth
      multiline
      minRows={2}
      maxRows={4}
      size="small"
      label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commitDraft}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <Tooltip title="Generar con IA)">
              <IconButton 
                onClick={handleGenerateAI} 
                disabled={isGenerating}
                size="small"
                color="primary"
              >
                {isGenerating ? <CircularProgress size={18} /> : <Sparkles size={18} />}
              </IconButton>
            </Tooltip>
          </InputAdornment>
        ),
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          commitDraft();
          (event.target as any).blur();
        }
      }}
    />
  );
}

function countDictionaryFields(fields?: Field[] | null): number {
  return normalizeFieldArray(fields).reduce((total, field) => {
    const nestedCount =
      (field.type === 'Document' ||
        (field.type === 'Array' && field.arrayType === 'Document')) &&
      field.nestedFields
        ? countDictionaryFields(field.nestedFields)
        : 0;
    return total + 1 + nestedCount;
  }, 0);
}


function estimateTopLevelFieldCount(fields: Field[]): number {
  return Array.isArray(fields) ? fields.length : 0;
}

function ModelDictionaryAccordion({
  model,
  aiContext,
  aiModel,
  aiApiKey,
  aiBaseUrl,
  copy,
  expanded,
  onToggle,
  onUpdateModel,
  fieldCount
}: ModelAccordionProps) {
  const { language } = useAppLanguage();
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [fieldSearch, setFieldSearch] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    setIsPreparing(true);
    const timer = window.setTimeout(() => setIsPreparing(false), 120);
    return () => window.clearTimeout(timer);
  }, [expanded, model.id]);

  const flatFields = useMemo(
    () => (expanded ? flattenModelFields(model) : []),
    [expanded, model]
  );
  const filteredFields = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    if (!q) return flatFields;
    return flatFields.filter((f) =>
      f.path.toLowerCase().includes(q) ||
      f.name.toLowerCase().includes(q) ||
      f.type.toLowerCase().includes(q)
    );
  }, [flatFields, fieldSearch]);

  const handleDescriptionCommit = (fieldPath: string, nextValue: string) => {
    const nextModel = updateFieldDescription(model, fieldPath, nextValue.trim());
    onUpdateModel(nextModel);
  };

  // --- NUEVA FUNCIÓN PARA GENERAR TODO EL MODELO ---
  const handleGenerateAllAI = async () => {
    if (!confirm("¿Quieres generar descripciones para TODOS los campos de esta colección?")) return;
    
    setIsBulkGenerating(true);
    let currentModel = { ...model };

    try {
      for (const field of flatFields) {
        // Opcional: Saltar si ya tiene una descripción manual
        if (field.customDescription) continue;

        const aiResponse = await generateAIDescription(field.path, field.type, model.name, aiContext, aiModel, aiApiKey, aiBaseUrl);
        
        // Actualizamos el modelo localmente en cada paso
        currentModel = updateFieldDescription(
          currentModel,
          field.path,
          aiResponse
        );
      }
      // Al terminar el bucle, disparamos la actualización final del estado de la app
      onUpdateModel(currentModel);
    } catch (error) {
      console.error("Error en generación por lote:", error);
    } finally {
      setIsBulkGenerating(false);
    }
  };

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, nextExpanded) => onToggle(nextExpanded)}
      disableGutters
      className="overflow-hidden rounded-2xl border border-slate-500/20 bg-slate-900/35 shadow-sm"
    >
      <AccordionSummary expandIcon={<ChevronDown className="h-4 w-4" />}>
        {/* ... (el contenido del Summary se mantiene igual) ... */}
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-100">
              {model.name}
            </div>
            <div className="mt-1 text-sm text-slate-300">
              {copy.fields}: {fieldCount} | {copy.indexes}: {model.indexes?.length || 0}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Chip size="small" label={`${copy.fieldCount}: ${fieldCount}`} />
          </div>
        </div>
      </AccordionSummary>

      {expanded && (
        <AccordionDetails className="space-y-6">
          {isPreparing && (
            <div className="flex items-center gap-2 text-slate-300">
              <CircularProgress size={18} />
              <span>{language === 'es' ? 'Cargando campos...' : 'Loading fields...'}</span>
            </div>
          )}
          {!isPreparing && (
          <div className="space-y-3">
            {/* CABECERA CON EL BOTÓN DE GENERACIÓN MASIVA */}
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-100">
                {copy.fields}
              </div>
              <Button
                size="small"
                variant="outlined"
                startIcon={isBulkGenerating ? <CircularProgress size={16} /> : <Sparkles size={16} />}
                onClick={handleGenerateAllAI}
                disabled={isBulkGenerating}
              >
                {isBulkGenerating ? "Generando..." : "Generar todo con IA"}
              </Button>
            </div>
            <TextField
              fullWidth
              size="small"
              label={language === 'es' ? 'Buscar campos en esta colección' : 'Search fields in this collection'}
              value={fieldSearch}
              onChange={(e) => setFieldSearch(e.target.value)}
            />

            <TableContainer component={Paper} variant="outlined" sx={{ backgroundColor: 'rgba(15,23,42,0.24)', borderColor: 'rgba(148,163,184,0.22)' }}>
              <Table size="small">
                <TableHead sx={{ '& .MuiTableCell-root': { color: '#cbd5e1', borderColor: 'rgba(148,163,184,0.2)' } }}>
                  <TableRow>
                    <TableCell>{copy.fieldPath}</TableCell>
                    <TableCell>{copy.type}</TableCell>
                    <TableCell>{copy.array}</TableCell>
                    <TableCell>{copy.required}</TableCell>
                    <TableCell>{copy.description}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody sx={{ '& .MuiTableCell-root': { color: '#f8fafc', borderColor: 'rgba(148,163,184,0.14)' } }}>
                  {filteredFields.map((field) => (
                    <TableRow key={field.path} hover>
                      <TableCell className="align-top font-medium">
                        {formatDisplayFieldPath(field.path)}
                      </TableCell>
                      <TableCell className="align-top">
                        {formatDisplayFieldType(field.type)}
                      </TableCell>
                      <TableCell className="align-top">
                        {field.isArray ? copy.yes : copy.no}
                      </TableCell>
                      <TableCell className="align-top">
                        {field.required ? copy.yes : copy.no}
                      </TableCell>
                      <TableCell className="min-w-[350px] align-top">
                        <DescriptionEditor
                          label={copy.description}
                          value={field.customDescription || ""}
                          field={field}
                          modelName={model.name}
                          aiContext={aiContext}
                          aiModel={aiModel}
                          aiApiKey={aiApiKey}
                          aiBaseUrl={aiBaseUrl}
                          onCommit={(nextValue) =>
                            handleDescriptionCommit(field.path, nextValue)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </div>
          )}
        </AccordionDetails>
      )}
    </Accordion>
  );
}

export default function DataDictionary({
  models,
  projectName,
  aiContext,
  aiModel,
  onUpdateAiContext,
  onUpdateAiModel,
  onUpdateModel,
  aiApiKey,
  aiBaseUrl
}: Props) {
  const { language } = useAppLanguage();
  const [expandedModelId, setExpandedModelId] = useState<string | false>(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const visibleModels = useMemo(() => {
    return (Array.isArray(models) ? models : [])
      .filter((model) => !String(model?.name || '').toLowerCase().includes('_photo'))
      .map((model) => ({
        ...model,
        name: String(model?.name || 'Collection'),
        fields: normalizeFieldArray(model?.fields),
        indexes: Array.isArray(model?.indexes) ? model.indexes.filter(Boolean) : []
      })) as Model[];
  }, [models]);

  const copy = useMemo<DictionaryCopy>(
    () => (language === 'es' ? {
      empty: 'No hay colecciones para mostrar. Crea primero un modelo de MongoDB.',
      title: 'Diccionario de Datos',
      subtitle: 'Consulta y documenta los campos e índices de cada colección.',
      download: 'Descargar Excel',
      downloading: 'Generando Excel...',
      fields: 'Campos',
      indexes: 'Índices',
      fieldPath: 'Ruta del campo',
      type: 'Tipo',
      array: 'Array',
      required: 'Obligatorio',
      description: 'Descripción',
      yes: 'Sí',
      no: 'No',
      customDescription: 'Descripción personalizada',
      fieldCount: 'Campos',
      indexCount: 'Índices',
      indexName: 'Índice',
      properties: 'Propiedades',
      atlasSearchIndex: 'Atlas Search',
      unique: 'Único',
      sparse: 'Sparse',
      asc: 'asc',
      noIndexes: 'Esta colección no tiene índices definidos.'
      ,
      generatingExcel: 'Generando archivo Excel...'
    } : {
      empty: 'No models to display. Create a MongoDB model first.',
      title: 'Data Dictionary',
      subtitle: 'Review and document fields and indexes per collection.',
      download: 'Download Excel',
      downloading: 'Generating Excel...',
      fields: 'Fields',
      indexes: 'Indexes',
      fieldPath: 'Field path',
      type: 'Type',
      array: 'Array',
      required: 'Required',
      description: 'Description',
      yes: 'Yes',
      no: 'No',
      customDescription: 'Custom description',
      fieldCount: 'Fields',
      indexCount: 'Indexes',
      indexName: 'Index',
      properties: 'Properties',
      atlasSearchIndex: 'Atlas Search',
      unique: 'Unique',
      sparse: 'Sparse',
      asc: 'asc',
      noIndexes: 'This collection has no indexes defined.',
      generatingExcel: 'Generating Excel file...'
    }),
    [language]
  );
  useEffect(() => {
    if (!visibleModels.length) {
      setExpandedModelId(false);
      return;
    }
    if (!expandedModelId || !visibleModels.some(m => m.id === expandedModelId)) {
      setExpandedModelId(visibleModels[0].id);
    }
  }, [expandedModelId, visibleModels]);

  const handleDownloadExcel = async () => {
    setIsDownloading(true);
    try {
      const workbookBuffer = await buildDataDictionaryWorkbookBuffer(visibleModels);
      const blob = new Blob([workbookBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${String(projectName || 'project').replace(/\s+/g, '_')}_data_dictionary.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!visibleModels.length) {
    return <div className="flex h-full items-center justify-center p-6 text-slate-300">{copy.empty}</div>;
  }

  return (
    <div className="h-full overflow-auto p-6 text-slate-100">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="mb-2 text-2xl font-bold">{copy.title}</h2>
          <p className="text-slate-300">{copy.subtitle}</p>
        </div>
        <Button
          variant="contained"
          startIcon={<Download size={16} />}
          onClick={handleDownloadExcel}
          disabled={isDownloading}
        >
          {isDownloading ? copy.downloading : copy.download}
        </Button>
      </div>
      <div className="mb-6">
        <TextField
          fullWidth
          size="small"
          label={language === 'es' ? 'Contexto para IA' : 'AI context'}
          placeholder={language === 'es' ? 'Ej: salud en España, facturación, autorizaciones...' : 'e.g. healthcare in Spain, billing, authorizations...'}
          value={aiContext || ''}
          onChange={(event) => onUpdateAiContext(event.target.value)}
        />
        <TextField
          select
          fullWidth
          size="small"
          sx={{ mt: 2 }}
          label={language === 'es' ? 'Modelo IA (gratuito y rápido)' : 'AI model (free and fast)'}
          value={aiModel || 'openai/gpt-oss-120b:free'}
          onChange={(event) => onUpdateAiModel(event.target.value)}
        >
          <MenuItem value="openai/gpt-oss-120b:free">GPT (OpenAI GPT-OSS-120B :free)</MenuItem>
          <MenuItem value="google/gemma-4-31b-it:free">Google: Gemma 4 26B A4B :free</MenuItem>
          <MenuItem value="deepseek/deepseek-r1:free">DeepSeek R1 :free</MenuItem>
        </TextField>
      </div>

      <div className="space-y-4">
        {visibleModels.map((model) => (
          <ModelDictionaryAccordion
            key={model.id}
            model={model}
            aiContext={aiContext}
            aiModel={aiModel}
            aiApiKey={aiApiKey}
            aiBaseUrl={aiBaseUrl}
            copy={copy}
            expanded={expandedModelId === model.id}
            onToggle={(next) => setExpandedModelId(next ? model.id : false)}
            onUpdateModel={onUpdateModel}
            fieldCount={
              expandedModelId === model.id
                ? countDictionaryFields(model.fields)
                : estimateTopLevelFieldCount(model.fields)
            }
          />
        ))}
      </div>

      <Dialog
        open={isDownloading}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: '#2b2b2b',
            border: '1px solid rgba(148,163,184,0.22)',
            borderRadius: 2,
            color: '#f8fafc'
          }
        }}
      >
        <DialogContent>
          <div className="flex items-center gap-3 py-2">
            <CircularProgress size={22} />
            <span>{copy.generatingExcel}</span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


