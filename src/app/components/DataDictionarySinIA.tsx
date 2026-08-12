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
  TextField
} from '@mui/material';
import { ChevronDown, Download } from 'lucide-react';
import type { Field, Model } from './MongoModelBuilder';
import {
  buildDataDictionaryWorkbookBuffer,
  flattenModelFields,
  formatDisplayFieldPath,
  formatDisplayFieldType,
  updateFieldDescription
} from '../utils/dataDictionary';
import { useAppLanguage } from '../i18n';

interface Props {
  models: Model[];
  projectName: string;
  onUpdateModel: (model: Model) => void;
}

interface DescriptionEditorProps {
  label: string;
  value: string;
  helperText: string;
  onCommit: (nextValue: string) => void;
}

interface ModelAccordionProps {
  model: Model;
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
  autoDescription: string;
  fieldCount: string;
  indexCount: string;
  indexName: string;
  properties: string;
  atlasSearchIndex: string;
  unique: string;
  sparse: string;
  asc: string;
  noIndexes: string;
};

function DescriptionEditor({
  label,
  value,
  helperText,
  onCommit
}: DescriptionEditorProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commitDraft = () => {
    if (draft.trim() === value.trim()) {
      return;
    }

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
      helperText={helperText}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          commitDraft();
          (event.target as HTMLInputElement | HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}

function countDictionaryFields(fields: Field[]): number {
  return fields.reduce((total, field) => {
    const nestedCount =
      (field.type === 'Document' ||
        (field.type === 'Array' && field.arrayType === 'Document')) &&
      field.nestedFields
        ? countDictionaryFields(field.nestedFields)
        : 0;

    return total + 1 + nestedCount;
  }, 0);
}

function formatIndexPropertiesDisplay(
  model: Model,
  indexId: string,
  copy: DictionaryCopy
) {
  const index = model.indexes.find(
    (currentIndex) => currentIndex.id === indexId
  );

  if (!index) {
    return '-';
  }

  if (index.type === 'atlas_search') {
    return copy.atlasSearchIndex;
  }

  const properties: string[] = index.fields.map(
    (field) =>
      `${field.field} (${field.order === 'desc' ? 'desc' : copy.asc})`
  );

  if (index.unique) {
    properties.push(copy.unique);
  }

  if (index.sparse) {
    properties.push(copy.sparse);
  }

  if (index.wildcardProjection) {
    properties.push(`Wildcard: ${index.wildcardProjection}`);
  }

  return properties.length ? properties.join(' | ') : '-';
}

function ModelDictionaryAccordion({
  model,
  copy,
  expanded,
  onToggle,
  onUpdateModel,
  fieldCount
}: ModelAccordionProps) {
  const { language } = useAppLanguage();
  const [fieldSearch, setFieldSearch] = useState('');
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

  const handleDescriptionCommit = (
    fieldPath: string,
    nextValue: string,
    generatedDescription: string
  ) => {
    const trimmedValue = nextValue.trim();

    const normalizedDescription =
      trimmedValue === generatedDescription.trim()
        ? ''
        : trimmedValue;

    const nextModel = updateFieldDescription(
      model,
      fieldPath,
      normalizedDescription
    );

    onUpdateModel(nextModel);
  };

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, nextExpanded) => onToggle(nextExpanded)}
      disableGutters
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <AccordionSummary
        expandIcon={<ChevronDown className="h-4 w-4" />}
      >
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-foreground">
              {model.name}
            </div>

            <div className="mt-1 text-sm text-muted-foreground">
              {copy.fields}: {fieldCount} | {copy.indexes}:{' '}
              {model.indexes?.length || 0}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <Chip
              size="small"
              label={`${copy.fieldCount}: ${fieldCount}`}
            />

            <Chip
              size="small"
              label={`${copy.indexCount}: ${
                model.indexes?.length || 0
              }`}
            />
          </div>
        </div>
      </AccordionSummary>

      {expanded && (
        <AccordionDetails className="space-y-6">
          <div className="space-y-3">
            <div className="text-sm font-medium text-foreground">
              {copy.fields}
            </div>
            <TextField
              fullWidth
              size="small"
              label={language === 'es' ? 'Buscar campos en esta colección' : 'Search fields in this collection'}
              value={fieldSearch}
              onChange={(e) => setFieldSearch(e.target.value)}
            />

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{copy.fieldPath}</TableCell>
                    <TableCell>{copy.type}</TableCell>
                    <TableCell>{copy.array}</TableCell>
                    <TableCell>{copy.required}</TableCell>
                    <TableCell>{copy.description}</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {filteredFields.map((field) => {
                    const descriptionValue =
                      field.customDescription ||
                      field.generatedDescription;

                    return (
                      <TableRow key={field.path} hover>
                        <TableCell className="align-top">
                          <div className="font-medium text-foreground">
                            {formatDisplayFieldPath(field.path)}
                          </div>
                        </TableCell>

                        <TableCell className="align-top text-foreground">
                          {formatDisplayFieldType(field.type)}
                        </TableCell>

                        <TableCell className="align-top text-foreground">
                          {field.isArray ? copy.yes : copy.no}
                        </TableCell>

                        <TableCell className="align-top text-foreground">
                          {field.required ? copy.yes : copy.no}
                        </TableCell>

                        <TableCell className="min-w-[320px] align-top">
                          <DescriptionEditor
                            label={copy.description}
                            value={descriptionValue}
                            helperText={
                              field.customDescription
                                ? copy.customDescription
                                : `${copy.autoDescription}: ${field.generatedDescription}`
                            }
                            onCommit={(nextValue) =>
                              handleDescriptionCommit(
                                field.path,
                                nextValue,
                                field.generatedDescription
                              )
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </div>
        </AccordionDetails>
      )}
    </Accordion>
  );
}

export default function DataDictionary({
  models,
  projectName,
  onUpdateModel
}: Props) {
  const { language } = useAppLanguage();

  const [expandedModelId, setExpandedModelId] =
    useState<string | false>(false);

  const [isDownloading, setIsDownloading] = useState(false);

  const visibleModels = useMemo(
  () =>
    models.filter(
      (model) => !model.name.toLowerCase().includes('_photo')
    ),
  [models]
);

  const copy = useMemo<DictionaryCopy>(
    () =>
      language === 'es'
        ? {
            empty:
              'No hay colecciones para mostrar. Crea primero un modelo de MongoDB.',
            title: 'Data Dictionary',
            subtitle:
              'Consulta y documenta los campos e indices de cada coleccion.',
            download: 'Descargar Excel',
            downloading: 'Generando Excel...',
            fields: 'Campos',
            indexes: 'Indices',
            fieldPath: 'Ruta del campo',
            type: 'Tipo',
            array: 'Array',
            required: 'Obligatorio',
            description: 'Descripcion',
            yes: 'Si',
            no: 'No',
            customDescription: 'Descripcion personalizada',
            autoDescription: 'Descripcion automatica',
            fieldCount: 'Campos',
            indexCount: 'Indices',
            indexName: 'Indice',
            properties: 'Propiedades',
            atlasSearchIndex: 'Atlas Search',
            unique: 'Unique',
            sparse: 'Sparse',
            asc: 'asc',
            noIndexes:
              'Esta coleccion no tiene indices definidos.'
          }
        : {
            empty:
              'No models to display. Create a MongoDB model first.',
            title: 'Data Dictionary',
            subtitle:
              'Review and document fields and indexes per collection.',
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
            autoDescription: 'Auto description',
            fieldCount: 'Fields',
            indexCount: 'Indexes',
            indexName: 'Index',
            properties: 'Properties',
            atlasSearchIndex: 'Atlas Search',
            unique: 'Unique',
            sparse: 'Sparse',
            asc: 'asc',
            noIndexes:
              'This collection has no indexes defined.'
          },
    [language]
  );

  const fieldCountByModelId = useMemo(
    () =>
      Object.fromEntries(
        visibleModels.map((model) => [
          model.id,
          countDictionaryFields(model.fields)
        ])
      ) as Record<string, number>,
    [visibleModels]
  );

  useEffect(() => {
    if (!visibleModels.length) {
      setExpandedModelId(false);
      return;
    }

    if (
      !expandedModelId ||
      !visibleModels.some(
        (model) => model.id === expandedModelId
      )
    ) {
      setExpandedModelId(visibleModels[0].id);
    }
  }, [expandedModelId, visibleModels]);

  const handleDownloadExcel = async () => {
    setIsDownloading(true);

    try {
      const workbookBuffer =
        await buildDataDictionaryWorkbookBuffer(
          visibleModels
        );

      const blob = new Blob([workbookBuffer], {
        type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      const downloadUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');

      link.href = downloadUrl;

      link.download = `${
        projectName.replace(/\s+/g, '_') || 'project'
      }_data_dictionary.xlsx`;

      document.body.appendChild(link);

      link.click();

      link.remove();

      URL.revokeObjectURL(downloadUrl);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!visibleModels.length) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-6 text-muted-foreground">
        {copy.empty}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-background p-6 text-foreground">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="mb-2">{copy.title}</h2>
          <p className="text-muted-foreground">
            {copy.subtitle}
          </p>
        </div>

        <Button
          variant="contained"
          startIcon={<Download className="h-4 w-4" />}
          onClick={handleDownloadExcel}
          disabled={isDownloading}
        >
          {isDownloading
            ? copy.downloading
            : copy.download}
        </Button>
      </div>

      <div className="space-y-4">
        {visibleModels.map((model) => (
          <ModelDictionaryAccordion
            key={model.id}
            model={model}
            copy={copy}
            expanded={expandedModelId === model.id}
            onToggle={(nextExpanded) =>
              setExpandedModelId(
                nextExpanded ? model.id : false
              )
            }
            onUpdateModel={onUpdateModel}
            fieldCount={
              fieldCountByModelId[model.id] || 0
            }
          />
        ))}
      </div>
    </div>
  );
}
