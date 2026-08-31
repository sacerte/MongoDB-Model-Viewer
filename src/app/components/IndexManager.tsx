import { useEffect, useState } from 'react';
import { Model, Index, Field } from './MongoModelBuilder';
import {
  Autocomplete,
  Alert,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField
} from '@mui/material';
import { Copy, Plus, Trash2, X } from 'lucide-react';
import { useAppLanguage } from '../i18n';

interface Props {
  model: Model;
  onUpdateModel: (model: Model) => void;
}

type WildcardProjectionMode = 'include' | 'exclude';
type MongoIndexFieldMode = 'asc' | 'desc' | 'text' | 'hashed' | '2dsphere' | '2d';
type SearchNumberRepresentation = 'double' | 'int64';
type SearchMappingType =
  | 'autocomplete'
  | 'boolean'
  | 'date'
  | 'document'
  | 'geo'
  | 'number'
  | 'objectId'
  | 'string'
  | 'token'
  | 'embeddedDocuments';

interface FieldPathOption {
  displayType: string;
  path: string;
  searchMappingType: SearchMappingType | null;
}

interface SearchFieldConfig {
  id: string;
  fieldPath: string;
  mappingType: SearchMappingType;
  variantScope?: 'all' | 'document' | 'embeddedDocuments';
  /** Path of the container whose variant this field belongs to. */
  variantScopePath?: string;
  /** Complete ancestry of document/embeddedDocuments alternatives. */
  variantTrail?: Array<{ path: string; type: 'document' | 'embeddedDocuments' }>;
  tokenization?: 'edgeGram' | 'rightEdgeGram' | 'nGram';
  analyzer?: string;
  minGrams?: number;
  maxGrams?: number;
  representation?: SearchNumberRepresentation;
}

const SEARCH_MAPPING_OPTIONS: Array<{ label: string; value: SearchMappingType }> = [
  { label: 'String', value: 'string' },
  { label: 'Token', value: 'token' },
  { label: 'Autocomplete', value: 'autocomplete' },
  { label: 'Geo', value: 'geo' },
  { label: 'Document', value: 'document' },
  { label: 'Embedded Documents', value: 'embeddedDocuments' },
  { label: 'Number', value: 'number' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Date', value: 'date' },
  { label: 'ObjectId', value: 'objectId' }
];
const AUTOCOMPLETE_TOKENIZATION_OPTIONS = ['edgeGram', 'rightEdgeGram', 'nGram'] as const;
const NUMBER_REPRESENTATION_OPTIONS: SearchNumberRepresentation[] = ['double', 'int64'];
const AUTOCOMPLETE_ANALYZER_OPTIONS = [
  'lucene.standard',
  'lucene.simple',
  'lucene.whitespace',
  'lucene.keyword',
  'lucene.english',
  'lucene.spanish',
  'lucene.french',
  'lucene.german',
  'lucene.portuguese',
  'lucene.italian'
] as const;

const ATLAS_FIELD_SX = {
  '& .MuiInputBase-input': {
    color: '#f8fafc',
    WebkitTextFillColor: '#f8fafc'
  },
  '& .MuiInputLabel-root': {
    color: 'rgba(248,250,252,0.8)'
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'rgba(148,163,184,0.35)'
  },
  '& .MuiSvgIcon-root': {
    color: '#f8fafc'
  }
};

const MONGO_INDEX_FIELD_MODE_OPTIONS: Array<{ value: MongoIndexFieldMode; label: string }> = [
  { value: 'asc', label: '1 (asc)' },
  { value: 'desc', label: '-1 (desc)' },
  { value: 'text', label: 'text' },
  { value: 'hashed', label: 'hashed' },
  { value: '2dsphere', label: '2dsphere' },
  { value: '2d', label: '2d' }
];

export default function IndexManager({ model, onUpdateModel }: Props) {
  const { language } = useAppLanguage();
  const copy =
    language === 'es'
      ? {
          title: 'Índices',
          addIndex: 'Añadir índice',
          editIndex: 'Editar índice',
          newIndex: 'Nuevo índice',
          indexName: 'Nombre del índice',
          indexType: 'Tipo de índice',
          regular: 'Normal',
          compound: 'Compuesto',
          wildcard: 'Wildcard',
          atlasSearch: 'Atlas Search',
          fields: 'Campos',
          addField: 'Añadir campo',
          field: 'Campo',
          order: 'Orden',
          ascending: 'Ascendente',
          descending: 'Descendente',
          unique: 'Único',
          sparse: 'Disperso',
          background: 'Background',
          hidden: 'Oculto',
          advancedOptions: 'Opciones avanzadas',
          collation: 'Collation',
          partialFilterExpression: 'Partial filter expression',
          expireAfterSeconds: 'TTL (expireAfterSeconds)',
          fieldType: 'Tipo de clave',
          fieldSelector: 'Seleccionar campo',
          fieldSearchPlaceholder: 'Busca un campo...',
          mongoOptionsHelp: 'Admite JSON para opciones como collation y partialFilterExpression.',
          wildcardPath: 'Ruta wildcard',
          wildcardHelp: 'Usa `$**` para toda la colección o elige un subárbol como `metadata.$**`.',
          filterFields: 'Filtrar campos',
          projectionMode: 'Modo de proyección',
          include: 'Incluir',
          exclude: 'Excluir',
          selectVisible: 'Seleccionar visibles',
          noFieldsWildcard: 'Ningún campo coincide con este alcance wildcard.',
          projectionPreview: 'Vista previa de la proyección',
          noProjectionFilter: 'Sin filtro de proyección',
          atlasBuilder: 'Constructor de Atlas Search',
          atlasHelp: 'Elige los atributos que quieras y el asistente generará la definición por ti.',
          dynamicMappings: 'Activar mapeos dinámicos',
          indexedAttributes: 'Atributos indexados',
          textFields: 'Campos de texto',
          clear: 'Limpiar',
          findAttributes: 'Buscar atributos',
          searchPlaceholder: 'Busca por ruta o tipo de dato',
          noCompatibleFields: 'No se encontraron campos compatibles para Atlas Search.',
          noFilteredAttributes: 'Ningún atributo coincide con el filtro actual.',
          suggested: 'sugerido',
          searchType: 'Tipo de búsqueda',
          generatedDefinition: 'Definición generada',
          selectedAttributes: (count: number, dynamic: boolean) =>
            `${count} atributo${count === 1 ? '' : 's'} seleccionado${count === 1 ? '' : 's'}${dynamic ? ' más mapeos dinámicos.' : '.'}`,
          cancel: 'Cancelar',
          save: 'Guardar',
          edit: 'Editar',
          noIndexes: 'Todavía no hay índices definidos. Pulsa "Añadir índice" para crear uno.',
          manageIndexes: 'Gestiona los índices de la colección seleccionada.',
          errorIndexNameRequired: 'El nombre del índice es obligatorio',
          errorAtlasFields: 'Selecciona al menos un atributo o activa los mapeos dinámicos.',
          errorAtLeastOneField: 'Hace falta al menos un campo.',
          errorAllFieldsSelected: 'Todos los campos deben estar seleccionados.'
        }
      : {
          title: 'Indexes',
          addIndex: 'Add Index',
          editIndex: 'Edit Index',
          newIndex: 'New Index',
          indexName: 'Index Name',
          indexType: 'Index Type',
          regular: 'Regular',
          compound: 'Compound',
          wildcard: 'Wildcard',
          atlasSearch: 'Atlas Search',
          fields: 'Fields',
          addField: 'Add Field',
          field: 'Field',
          order: 'Order',
          ascending: 'Ascending',
          descending: 'Descending',
          unique: 'Unique',
          sparse: 'Sparse',
          background: 'Background',
          hidden: 'Hidden',
          advancedOptions: 'Advanced options',
          collation: 'Collation',
          partialFilterExpression: 'Partial filter expression',
          expireAfterSeconds: 'TTL (expireAfterSeconds)',
          fieldType: 'Key type',
          fieldSelector: 'Select field',
          fieldSearchPlaceholder: 'Search a field...',
          mongoOptionsHelp: 'Supports JSON for options like collation and partialFilterExpression.',
          wildcardPath: 'Wildcard path',
          wildcardHelp: 'Use `$**` for the whole collection or choose a subtree like `metadata.$**`.',
          filterFields: 'Filter fields',
          projectionMode: 'Projection mode',
          include: 'Include',
          exclude: 'Exclude',
          selectVisible: 'Select visible',
          noFieldsWildcard: 'No fields match this wildcard scope.',
          projectionPreview: 'Projection preview',
          noProjectionFilter: 'No projection filter',
          atlasBuilder: 'Atlas Search builder',
          atlasHelp: 'Pick the attributes you want and the builder will generate the search definition for you.',
          dynamicMappings: 'Enable dynamic mappings',
          indexedAttributes: 'Indexed attributes',
          textFields: 'Text fields',
          clear: 'Clear',
          findAttributes: 'Find attributes',
          searchPlaceholder: 'Search by path or datatype',
          noCompatibleFields: 'No compatible fields found for Atlas Search.',
          noFilteredAttributes: 'No attributes match the current filter.',
          suggested: 'suggested',
          searchType: 'Search type',
          generatedDefinition: 'Generated definition',
          selectedAttributes: (count: number, dynamic: boolean) =>
            `${count} attribute${count === 1 ? '' : 's'} selected${dynamic ? ' plus dynamic mappings.' : '.'}`,
          cancel: 'Cancel',
          save: 'Save',
          edit: 'Edit',
          noIndexes: 'No indexes defined yet. Click "Add Index" to create one.',
          manageIndexes: 'Manage the indexes for the selected collection.',
          errorIndexNameRequired: 'Index name is required',
          errorAtlasFields: 'Select at least one attribute or enable dynamic mappings.',
          errorAtLeastOneField: 'At least one field is required.',
          errorAllFieldsSelected: 'All fields must be selected.'
        };

  const [editingIndex, setEditingIndex] = useState<Index | null>(null);
  const [error, setError] = useState('');
  const [wildcardProjectionMode, setWildcardProjectionMode] = useState<WildcardProjectionMode>('include');
  const [selectedWildcardProjectionPaths, setSelectedWildcardProjectionPaths] = useState<string[]>([]);
  const [wildcardFieldFilter, setWildcardFieldFilter] = useState('');
  const [searchDynamicMappings, setSearchDynamicMappings] = useState(false);
  const [searchFieldConfigs, setSearchFieldConfigs] = useState<SearchFieldConfig[]>([]);
  const [searchFieldFilter, setSearchFieldFilter] = useState('');

  const fieldOptions = getAllFieldOptions(model.fields);
  const fieldPaths = fieldOptions.map((option) => option.path);
  const searchableFieldOptions = fieldOptions.filter((option) => option.searchMappingType !== null);
  const wildcardRootPath = getWildcardRootPath(getWildcardFieldPath(editingIndex?.fields));
  const wildcardSelectableOptions = fieldOptions.filter((option) =>
    isPathInsideWildcardRoot(option.path, wildcardRootPath)
  );
  const filteredWildcardOptions = wildcardSelectableOptions.filter((option) =>
    matchesFieldOptionFilter(option, wildcardFieldFilter)
  );
  const filteredSearchableFieldOptions = searchableFieldOptions.filter((option) =>
    matchesFieldOptionFilter(option, searchFieldFilter)
  );
  const wildcardPathOptions = [
    { label: '$** (all fields)', value: '$**' },
    ...fieldOptions.map((option) => ({
      label: `${option.path}.$**`,
      value: `${option.path}.$**`
    }))
  ];
  const wildcardIndexFieldOptions = [
    {
      displayType: 'Wildcard',
      path: '$**',
      searchMappingType: null
    },
    ...fieldOptions.filter((option) => isPathInsideWildcardRoot(option.path, wildcardRootPath))
  ];

  useEffect(() => {
    if (!editingIndex) {
      return;
    }

    const validFieldPaths = new Set(fieldPaths);
    setSelectedWildcardProjectionPaths((currentPaths) => {
      const nextPaths = currentPaths.filter((path) => validFieldPaths.has(path));
      return nextPaths.length === currentPaths.length ? currentPaths : nextPaths;
    });

    const searchableByPath = new Map(searchableFieldOptions.map((option) => [option.path, option]));
    setSearchFieldConfigs((currentConfigs) => {
      const nextConfigs = currentConfigs
        .filter((config) => searchableByPath.has(config.fieldPath))
        .map((config) => {
          const option = searchableByPath.get(config.fieldPath);
          return {
            ...config,
            mappingType: config.mappingType || option?.searchMappingType || 'string'
          };
        });

      return areSearchFieldConfigsEqual(currentConfigs, nextConfigs) ? currentConfigs : nextConfigs;
    });
  }, [editingIndex, fieldPaths, searchableFieldOptions]);

  const startEditingIndex = (index: Index) => {
    const nextDraft = cloneIndexDraft(index);
    setEditingIndex(nextDraft);
    setError('');
    setWildcardFieldFilter('');
    setSearchFieldFilter('');

    const wildcardState = parseWildcardProjection(nextDraft.wildcardProjection, fieldPaths);
    setWildcardProjectionMode(wildcardState.mode);
    setSelectedWildcardProjectionPaths(wildcardState.paths);

    const searchState = parseSearchDefinition(nextDraft.searchDefinition);
    setSearchDynamicMappings(searchState.dynamic);
    setSearchFieldConfigs(sortSearchFieldConfigs(searchState.fields, searchableFieldOptions));
  };

  const syncWildcardProjection = (nextMode: WildcardProjectionMode, nextPaths: string[]) => {
    setWildcardProjectionMode(nextMode);
    setSelectedWildcardProjectionPaths(nextPaths);
    setEditingIndex((currentIndex) =>
      currentIndex
        ? {
            ...currentIndex,
            wildcardProjection: buildWildcardProjection(nextMode, nextPaths)
          }
        : currentIndex
    );
  };

  const syncSearchDefinition = (nextDynamic: boolean, nextFields: SearchFieldConfig[]) => {
    const orderedFields = sortSearchFieldConfigs(nextFields, searchableFieldOptions);
    setSearchDynamicMappings(nextDynamic);
    setSearchFieldConfigs(orderedFields);
    setEditingIndex((currentIndex) =>
      currentIndex
        ? {
            ...currentIndex,
            searchDefinition: JSON.stringify(buildAtlasSearchDefinition(nextDynamic, orderedFields), null, 2)
          }
        : currentIndex
    );
  };

  const handleCreateIndex = () => {
    startEditingIndex({
      id: Date.now().toString(),
      name: '',
      type: 'regular',
      fields: [{ field: '', order: 'asc' }],
      unique: false,
      sparse: false,
      background: false,
      hidden: false
    });
  };

  const handleSaveIndex = () => {
    if (!editingIndex || !editingIndex.name.trim()) {
      setError(copy.errorIndexNameRequired);
      return;
    }

    const nextIndex: Index = cloneIndexDraft(editingIndex);

    if (nextIndex.type === 'atlas_search') {
      if (!searchDynamicMappings && searchFieldConfigs.length === 0) {
        setError(copy.errorAtlasFields);
        return;
      }

      nextIndex.fields = [];
      nextIndex.searchDefinition = JSON.stringify(
        buildAtlasSearchDefinition(searchDynamicMappings, searchFieldConfigs),
        null,
        2
      );
      nextIndex.wildcardProjection = undefined;
      nextIndex.unique = false;
      nextIndex.sparse = false;
    } else {
      if (nextIndex.fields.length === 0) {
        setError(copy.errorAtLeastOneField);
        return;
      }

      if (nextIndex.fields.some((field) => !field.field)) {
        setError(copy.errorAllFieldsSelected);
        return;
      }

      if (nextIndex.type === 'wildcard') {
        nextIndex.fields = normalizeWildcardIndexFields(nextIndex.fields);
        nextIndex.wildcardProjection = buildWildcardProjection(
          wildcardProjectionMode,
          selectedWildcardProjectionPaths
        );
      } else {
        nextIndex.wildcardProjection = undefined;
      }

      nextIndex.searchDefinition = undefined;
    }

    const existingIndex = model.indexes.find((index) => index.id === nextIndex.id);

    onUpdateModel({
      ...model,
      indexes: existingIndex
        ? model.indexes.map((index) => (index.id === nextIndex.id ? nextIndex : index))
        : [...model.indexes, nextIndex]
    });

    setEditingIndex(null);
    setError('');
  };

  const handleDeleteIndex = (id: string) => {
    onUpdateModel({
      ...model,
      indexes: model.indexes.filter((index) => index.id !== id)
    });
  };

  const handleChangeIndexType = (nextType: Index['type']) => {
    if (!editingIndex) {
      return;
    }

    const nextDraft: Index = {
      ...editingIndex,
      type: nextType
    };

    if (nextType === 'atlas_search') {
      nextDraft.fields = [];
      nextDraft.unique = false;
      nextDraft.sparse = false;
      if (!nextDraft.searchDefinition) {
        nextDraft.searchDefinition = JSON.stringify(buildAtlasSearchDefinition(false, []), null, 2);
      }
    } else {
      nextDraft.fields =
        nextType === 'wildcard'
          ? normalizeWildcardIndexFields(editingIndex.fields)
          : editingIndex.fields.length > 0
            ? editingIndex.fields.map((field) => normalizeIndexField(field))
            : [{ field: '', order: 'asc', mode: 'asc' }];
    }

    startEditingIndex(nextDraft);
  };

  const handleUpdateIndexField = (fieldIndex: number, updates: Partial<Index['fields'][0]>) => {
    if (!editingIndex) {
      return;
    }

    const updatedFields = [...editingIndex.fields];
    updatedFields[fieldIndex] = normalizeIndexField({ ...updatedFields[fieldIndex], ...updates });
    setEditingIndex({ ...editingIndex, fields: updatedFields });
    setError('');
  };

  const handleAddIndexField = () => {
    if (!editingIndex) {
      return;
    }

    setEditingIndex({
      ...editingIndex,
      fields: [...editingIndex.fields, { field: '', order: 'asc', mode: 'asc' }]
    });
    setError('');
  };

  const handleRemoveIndexField = (fieldIndex: number) => {
    if (!editingIndex || editingIndex.fields.length <= 1) {
      return;
    }

    setEditingIndex({
      ...editingIndex,
      fields: editingIndex.fields.filter((_, index) => index !== fieldIndex)
    });
    setError('');
  };

  const handleChangeWildcardPath = (nextPath: string) => {
    const normalizedPath = normalizeWildcardPath(nextPath);
    const nextSelectablePaths = fieldOptions
      .filter((option) => isPathInsideWildcardRoot(option.path, getWildcardRootPath(normalizedPath)))
      .map((option) => option.path);
    const nextProjectionPaths = selectedWildcardProjectionPaths.filter((path) => nextSelectablePaths.includes(path));

    setWildcardFieldFilter('');
    setSelectedWildcardProjectionPaths(nextProjectionPaths);
    setEditingIndex((currentIndex) =>
      currentIndex
        ? {
            ...currentIndex,
            fields: replaceWildcardIndexField(currentIndex.fields, normalizedPath),
            wildcardProjection: buildWildcardProjection(wildcardProjectionMode, nextProjectionPaths)
          }
        : currentIndex
    );
    setError('');
  };

  const handleToggleWildcardProjectionPath = (path: string) => {
    const nextPaths = selectedWildcardProjectionPaths.includes(path)
      ? selectedWildcardProjectionPaths.filter((currentPath) => currentPath !== path)
      : [...selectedWildcardProjectionPaths, path];

    syncWildcardProjection(wildcardProjectionMode, nextPaths);
    setError('');
  };

  const handleSelectVisibleWildcardProjectionPaths = () => {
    syncWildcardProjection(
      wildcardProjectionMode,
      mergeFieldPathsInDisplayOrder(
        selectedWildcardProjectionPaths,
        filteredWildcardOptions.map((option) => option.path),
        wildcardSelectableOptions.map((option) => option.path)
      )
    );
    setError('');
  };

  const handleToggleSearchField = (path: string) => {
    const existingField = searchFieldConfigs.find((fieldConfig) => fieldConfig.fieldPath === path);

    if (existingField) {
      syncSearchDefinition(
        searchDynamicMappings,
        searchFieldConfigs.filter((fieldConfig) => fieldConfig.fieldPath !== path)
      );
      setError('');
      return;
    }

    const option = searchableFieldOptions.find((candidate) => candidate.path === path);
    syncSearchDefinition(searchDynamicMappings, [
      ...searchFieldConfigs,
      {
        id: `${path}-${Date.now()}-${Math.random()}`,
        fieldPath: path,
        mappingType: option?.searchMappingType || 'string',
        variantScope: 'all'
      }
    ]);
    setError('');
  };

  const handleUpdateSearchFieldType = (configId: string, nextType: SearchMappingType) => {
    const updated = searchFieldConfigs.map((fieldConfig) =>
      fieldConfig.id === configId
        ? {
            ...fieldConfig,
            mappingType: nextType
          }
        : fieldConfig
    );
    syncSearchDefinition(searchDynamicMappings, dedupeSearchConfigsByPathType(updated, configId));
    setError('');
  };

  const handleAddSearchFieldVariant = (path: string) => {
    syncSearchDefinition(searchDynamicMappings, [
      ...searchFieldConfigs,
      { id: `${path}-${Date.now()}-${Math.random()}`, fieldPath: path, mappingType: 'token' }
      
    ]);
    setError('');
  };

  const handleRemoveSearchFieldVariant = (configId: string) => {
    syncSearchDefinition(
      searchDynamicMappings,
      searchFieldConfigs.filter((fieldConfig) => fieldConfig.id !== configId)
    );
    setError('');
  };

  const handleSelectVisibleSearchFields = () => {
    const nextFieldsByPath = new Map(searchFieldConfigs.map((fieldConfig) => [fieldConfig.fieldPath, fieldConfig]));

    filteredSearchableFieldOptions.forEach((option) => {
      if (!nextFieldsByPath.has(option.path)) {
        nextFieldsByPath.set(option.path, {
          id: `${option.path}-${Date.now()}-${Math.random()}`,
          fieldPath: option.path,
          mappingType: option.searchMappingType || 'string',
          variantScope: 'all'
        });
      }
    });

    syncSearchDefinition(searchDynamicMappings, Array.from(nextFieldsByPath.values()));
    setError('');
  };

  const handleSelectRecommendedSearchFields = () => {
    const nextFieldsByPath = new Map(searchFieldConfigs.map((fieldConfig) => [fieldConfig.fieldPath, fieldConfig]));

    filteredSearchableFieldOptions
      .filter((option) => option.searchMappingType === 'string')
      .forEach((option) => {
        if (!nextFieldsByPath.has(option.path)) {
          nextFieldsByPath.set(option.path, {
            id: `${option.path}-${Date.now()}-${Math.random()}`,
            fieldPath: option.path,
            mappingType: 'string',
            variantScope: 'all'
          });
        }
      });

    syncSearchDefinition(searchDynamicMappings, Array.from(nextFieldsByPath.values()));
    setError('');
  };

  const handleClearSearchFields = () => {
    syncSearchDefinition(searchDynamicMappings, []);
    setError('');
  };

  return (
    <div className="space-y-4 text-foreground">
      <div className="flex items-center justify-between">
        <h3 className="text-slate-100">{copy.title}</h3>
        <Button variant="contained" startIcon={<Plus className="w-4 h-4" />} onClick={handleCreateIndex}>
          {copy.addIndex}
        </Button>
      </div>

      {editingIndex && (
        <div className="rounded-xl border border-slate-500/20 bg-slate-900/35 p-3 text-slate-100 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h4>{model.indexes.find((index) => index.id === editingIndex.id) ? copy.editIndex : copy.newIndex}</h4>
            <div className="flex items-center gap-2">
              <Button
                size="small"
                onClick={() => {
                  setEditingIndex(null);
                  setError('');
                }}
              >
                {copy.cancel}
              </Button>
              <Button size="small" variant="contained" onClick={handleSaveIndex}>
                {copy.save}
              </Button>
              <IconButton
                size="small"
                onClick={() => {
                  setEditingIndex(null);
                  setError('');
                }}
              >
                <X className="w-4 h-4" />
              </IconButton>
            </div>
          </div>

          {error && <Alert severity="error" className="mb-3">{error}</Alert>}

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <TextField
                label={copy.indexName}
                value={editingIndex.name}
                onChange={(e) => {
                  setEditingIndex({ ...editingIndex, name: e.target.value });
                  setError('');
                }}
                fullWidth
                size="small"
                required
                error={!editingIndex.name}
                helperText={!editingIndex.name ? copy.errorIndexNameRequired : ''}
              />

              <FormControl fullWidth size="small">
                <InputLabel>{copy.indexType}</InputLabel>
                <Select
                  value={editingIndex.type}
                  label={copy.indexType}
                  onChange={(e) => handleChangeIndexType(e.target.value as Index['type'])}
                >
                  <MenuItem value="regular">{copy.regular}</MenuItem>
                  <MenuItem value="compound">{copy.compound}</MenuItem>
                  <MenuItem value="wildcard">{copy.wildcard}</MenuItem>
                  <MenuItem value="atlas_search">{copy.atlasSearch}</MenuItem>
                </Select>
              </FormControl>
            </div>

            {editingIndex.type === 'regular' || editingIndex.type === 'compound' || editingIndex.type === 'wildcard' ? (
              <>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">{copy.fields}</span>
                    {(editingIndex.type === 'compound' || editingIndex.type === 'wildcard' || editingIndex.fields.length === 0) && (
                      <Button size="small" onClick={handleAddIndexField}>
                        <Plus className="mr-1 w-4 h-4" />
                        {copy.addField}
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {editingIndex.fields.map((indexField, fieldIndex) => (
                      <div key={fieldIndex} className="flex gap-2">
                        <SearchableFieldSelect
                          label={copy.fieldSelector}
                          placeholder={copy.fieldSearchPlaceholder}
                          options={
                            editingIndex.type === 'wildcard'
                              ? wildcardIndexFieldOptions
                              : fieldOptions
                          }
                          value={indexField.field}
                          onChange={(value) => handleUpdateIndexField(fieldIndex, { field: value })}
                        />

                        <FormControl size="small" className="w-40">
                          <InputLabel>{copy.fieldType}</InputLabel>
                          <Select
                            value={normalizeIndexField(indexField).mode || 'asc'}
                            label={copy.fieldType}
                            onChange={(e) =>
                              handleUpdateIndexField(fieldIndex, buildIndexFieldModeUpdate(e.target.value as MongoIndexFieldMode))
                            }
                          >
                            {MONGO_INDEX_FIELD_MODE_OPTIONS.map((option) => (
                              <MenuItem key={option.value} value={option.value}>
                                {option.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        {(editingIndex.type === 'compound' || editingIndex.type === 'wildcard') &&
                          editingIndex.fields.length > 1 && (
                          <IconButton size="small" onClick={() => handleRemoveIndexField(fieldIndex)} color="error">
                            <Trash2 className="w-4 h-4" />
                          </IconButton>
                          )}
                      </div>
                    ))}
                  </div>
                </div>

                {editingIndex.type !== 'wildcard' && (
                  <div className="flex gap-4">
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={editingIndex.unique || false}
                        onChange={(e) => setEditingIndex({ ...editingIndex, unique: e.target.checked })}
                      />
                    }
                    label={copy.unique}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={editingIndex.sparse || false}
                        onChange={(e) => setEditingIndex({ ...editingIndex, sparse: e.target.checked })}
                      />
                    }
                    label={copy.sparse}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={editingIndex.background || false}
                        onChange={(e) => setEditingIndex({ ...editingIndex, background: e.target.checked })}
                      />
                    }
                    label={copy.background}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={editingIndex.hidden || false}
                        onChange={(e) => setEditingIndex({ ...editingIndex, hidden: e.target.checked })}
                      />
                    }
                    label={copy.hidden}
                  />
                  </div>
                )}

                <div className="space-y-3 rounded-xl border border-slate-500/20 bg-slate-900/25 p-3">
                  <div className="text-sm font-medium text-slate-100">{copy.advancedOptions}</div>
                  <div className="text-xs text-slate-300">{copy.mongoOptionsHelp}</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <TextField
                      label={copy.expireAfterSeconds}
                      type="number"
                      size="small"
                      value={editingIndex.expireAfterSeconds ?? ''}
                      onChange={(e) =>
                        setEditingIndex({
                          ...editingIndex,
                          expireAfterSeconds: e.target.value === '' ? undefined : Number(e.target.value)
                        })
                      }
                    />
                    <TextField
                      label={copy.collation}
                      size="small"
                      value={editingIndex.collation || ''}
                      onChange={(e) => setEditingIndex({ ...editingIndex, collation: e.target.value })}
                      placeholder='{"locale":"es","strength":1}'
                    />
                  </div>
                  <TextField
                    label={copy.partialFilterExpression}
                    size="small"
                    multiline
                    minRows={3}
                    value={editingIndex.partialFilterExpression || ''}
                    onChange={(e) => setEditingIndex({ ...editingIndex, partialFilterExpression: e.target.value })}
                    placeholder='{"status":{"$exists":true}}'
                    fullWidth
                  />
                </div>
              </>
            ) : null}

            {editingIndex.type === 'wildcard' && (
              <div className="space-y-4 rounded-xl border border-slate-500/20 bg-slate-900/30 p-3 text-slate-100">
                <div>
                  <div className="text-sm font-medium text-slate-100">{copy.wildcardPath}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{copy.wildcardHelp}</div>
                </div>

                <SearchableValueSelect
                  label={copy.wildcardPath}
                  placeholder={copy.fieldSearchPlaceholder}
                  options={wildcardPathOptions}
                  value={getWildcardFieldPath(editingIndex.fields)}
                  onChange={handleChangeWildcardPath}
                />

                <div className="grid gap-3 md:grid-cols-[220px,1fr]">
                  <FormControl size="small">
                    <InputLabel>{copy.projectionMode}</InputLabel>
                    <Select
                      value={wildcardProjectionMode}
                      label={copy.projectionMode}
                      onChange={(e) =>
                        syncWildcardProjection(e.target.value as WildcardProjectionMode, selectedWildcardProjectionPaths)
                      }
                    >
                      <MenuItem value="include">{copy.include}</MenuItem>
                      <MenuItem value="exclude">{copy.exclude}</MenuItem>
                    </Select>
                  </FormControl>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="small" onClick={handleSelectVisibleWildcardProjectionPaths}>
                      {copy.selectVisible}
                    </Button>
                    <Button size="small" onClick={() => syncWildcardProjection(wildcardProjectionMode, [])}>
                      {copy.clear}
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      {selectedWildcardProjectionPaths.length} field
                      {selectedWildcardProjectionPaths.length === 1 ? '' : 's'} selected
                    </div>
                  </div>
                </div>

                <TextField
                  label={copy.filterFields}
                  value={wildcardFieldFilter}
                  onChange={(e) => setWildcardFieldFilter(e.target.value)}
                  size="small"
                  fullWidth
                  placeholder={copy.searchPlaceholder}
                />

                <div className="max-h-56 overflow-auto rounded-xl border border-slate-500/20 bg-slate-900/25 p-3">
                  {filteredWildcardOptions.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-500/25 bg-slate-900/25 px-4 py-6 text-center text-sm text-slate-300">
                      {copy.noFieldsWildcard}
                    </div>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-2">
                      {filteredWildcardOptions.map((option) => (
                        <label
                          key={option.path}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-500/20 bg-slate-900/30 px-3 py-2 text-sm text-slate-100 transition-colors hover:bg-slate-800/40"
                        >
                          <Checkbox
                            checked={selectedWildcardProjectionPaths.includes(option.path)}
                            onChange={() => handleToggleWildcardProjectionPath(option.path)}
                            size="small"
                          />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{option.path}</div>
                            <div className="text-xs text-muted-foreground">{option.displayType}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-xs text-slate-300">
                  {copy.projectionPreview}:{' '}
                  {buildWildcardProjection(wildcardProjectionMode, selectedWildcardProjectionPaths) || copy.noProjectionFilter}
                </div>
              </div>
            )}

            {editingIndex.type === 'atlas_search' && (
              <div className="space-y-4 rounded-xl border border-slate-500/20 bg-slate-900/30 p-3 text-slate-100">
                <div>
                  <div className="text-sm font-medium text-slate-100">{copy.atlasBuilder}</div>
                  <div className="mt-1 text-xs text-slate-300">{copy.atlasHelp}</div>
                </div>

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={searchDynamicMappings}
                      onChange={(e) => syncSearchDefinition(e.target.checked, searchFieldConfigs)}
                    />
                  }
                  label={copy.dynamicMappings}
                />

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{copy.indexedAttributes}</span>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="small"
                        onClick={handleSelectRecommendedSearchFields}
                        disabled={filteredSearchableFieldOptions.length === 0}
                      >
                        {copy.textFields}
                      </Button>
                      <Button
                        size="small"
                        onClick={handleSelectVisibleSearchFields}
                        disabled={filteredSearchableFieldOptions.length === 0}
                      >
                        {copy.selectVisible}
                      </Button>
                      <Button
                        size="small"
                        onClick={handleClearSearchFields}
                        disabled={searchFieldConfigs.length === 0}
                      >
                        {copy.clear}
                      </Button>
                    </div>
                  </div>

                  <TextField
                    label={copy.findAttributes}
                    value={searchFieldFilter}
                    onChange={(e) => setSearchFieldFilter(e.target.value)}
                    size="small"
                    fullWidth
                    placeholder={copy.searchPlaceholder}
                    sx={ATLAS_FIELD_SX}
                  />

                  {searchableFieldOptions.length === 0 ? (
                    <div className="mt-3 rounded-lg border border-dashed border-slate-500/25 bg-slate-900/25 px-4 py-6 text-sm text-slate-300">
                      {copy.noCompatibleFields}
                    </div>
                  ) : filteredSearchableFieldOptions.length === 0 ? (
                    <div className="mt-3 rounded-lg border border-dashed border-slate-500/25 bg-slate-900/25 px-4 py-6 text-sm text-slate-300">
                      {copy.noFilteredAttributes}
                    </div>
                  ) : (
                    <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                      {filteredSearchableFieldOptions.map((option) => {
                        const selectedFields = searchFieldConfigs.filter((fieldConfig) => fieldConfig.fieldPath === option.path);
                        const selectedField = selectedFields[0];

                        return (
                          <div
                            key={option.path}
                            className={`grid gap-3 rounded-lg border px-3 py-3 md:grid-cols-[minmax(0,1fr),180px] ${
                              selectedField ? 'border-cyan-400/40 bg-cyan-500/10' : 'border-slate-500/20 bg-slate-900/30'
                            }`}
                          >
                            <label className="flex min-w-0 cursor-pointer items-center gap-2">
                              <Checkbox
                                checked={Boolean(selectedField)}
                                onChange={() => handleToggleSearchField(option.path)}
                                size="small"
                              />
                              <div className="min-w-0">
                                <div className="truncate font-medium text-slate-100">{option.path}</div>
                                <div className="text-xs text-muted-foreground">
                                  {option.displayType} - {copy.suggested} {formatSearchMappingTypeLabel(option.searchMappingType || 'string')}
                                </div>
                              </div>
                            </label>

                            <div className="space-y-2">
                              {selectedFields.map((config) => (
                                <div key={config.id} className="rounded border border-slate-500/25 p-2">
                                  <div className="flex items-center gap-2">
                                    <FormControl size="small" fullWidth>
                                      <InputLabel>{copy.searchType}</InputLabel>
                                      <Select
                                        value={config.mappingType}
                                        label={copy.searchType}
                                        onChange={(e) =>
                                          handleUpdateSearchFieldType(config.id, e.target.value as SearchMappingType)
                                        }
                                        sx={ATLAS_FIELD_SX}
                                        MenuProps={{
                                          PaperProps: {
                                            sx: {
                                              bgcolor: '#0f172a',
                                              color: '#f8fafc'
                                            }
                                          }
                                        }}
                                      >
                                        {SEARCH_MAPPING_OPTIONS.map((mappingOption) => (
                                          <MenuItem key={mappingOption.value} value={mappingOption.value}>
                                            {mappingOption.label}
                                          </MenuItem>
                                        ))}
                                      </Select>
                                    </FormControl>
                                    <IconButton size="small" onClick={() => handleRemoveSearchFieldVariant(config.id)}>
                                      <X className="w-4 h-4" />
                                    </IconButton>
                                  </div>
                                  <FormControl size="small" fullWidth className="mt-2">
                                    <InputLabel>scope</InputLabel>
                                    <Select
                                      value={config.variantScope || 'all'}
                                      label="scope"
                                      onChange={(e) => {
                                        const updated = searchFieldConfigs.map((fieldConfig) =>
                                          fieldConfig.id === config.id
                                            ? { ...fieldConfig, variantScope: e.target.value as 'all' | 'document' | 'embeddedDocuments' }
                                            : fieldConfig
                                        );
                                        syncSearchDefinition(
                                          searchDynamicMappings,
                                          dedupeSearchConfigsByPathType(updated, config.id)
                                        );
                                      }}
                                      sx={ATLAS_FIELD_SX}
                                    >
                                      <MenuItem value="all">all</MenuItem>
                                      <MenuItem value="document">document</MenuItem>
                                      <MenuItem value="embeddedDocuments">embeddedDocuments</MenuItem>
                                    </Select>
                                  </FormControl>
                                  {config.mappingType === 'autocomplete' && (
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                      <FormControl size="small">
                                        <InputLabel>tokenization</InputLabel>
                                        <Select
                                          value={config.tokenization ?? ''}
                                          label="tokenization"
                                          onChange={(e) =>
                                            syncSearchDefinition(
                                              searchDynamicMappings,
                                              searchFieldConfigs.map((fieldConfig) =>
                                                fieldConfig.id === config.id
                                                  ? { ...fieldConfig, tokenization: e.target.value as 'edgeGram' | 'rightEdgeGram' | 'nGram' }
                                                  : fieldConfig
                                              )
                                            )
                                          }
                                          sx={ATLAS_FIELD_SX}
                                        >
                                          <MenuItem value="">(empty)</MenuItem>
                                          {AUTOCOMPLETE_TOKENIZATION_OPTIONS.map((opt) => (
                                            <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>
                                      <FormControl size="small">
                                        <InputLabel>analyzer</InputLabel>
                                        <Select
                                          value={config.analyzer ?? ''}
                                          label="analyzer"
                                          onChange={(e) =>
                                            syncSearchDefinition(
                                              searchDynamicMappings,
                                              searchFieldConfigs.map((fieldConfig) =>
                                                fieldConfig.id === config.id
                                                  ? { ...fieldConfig, analyzer: e.target.value }
                                                  : fieldConfig
                                              )
                                            )
                                          }
                                          sx={ATLAS_FIELD_SX}
                                        >
                                          <MenuItem value="">(empty)</MenuItem>
                                          {AUTOCOMPLETE_ANALYZER_OPTIONS.map((opt) => (
                                            <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                                          ))}
                                        </Select>
                                      </FormControl>
                                      <TextField size="small" type="number" label="minGrams" value={config.minGrams ?? ''} onChange={(e) => syncSearchDefinition(searchDynamicMappings, searchFieldConfigs.map((fieldConfig) => fieldConfig.id === config.id ? { ...fieldConfig, minGrams: e.target.value ? Number(e.target.value) : undefined } : fieldConfig))} sx={ATLAS_FIELD_SX} />
                                      <TextField size="small" type="number" label="maxGrams" value={config.maxGrams ?? ''} onChange={(e) => syncSearchDefinition(searchDynamicMappings, searchFieldConfigs.map((fieldConfig) => fieldConfig.id === config.id ? { ...fieldConfig, maxGrams: e.target.value ? Number(e.target.value) : undefined } : fieldConfig))} sx={ATLAS_FIELD_SX} />
                                    </div>
                                  )}
                                  {config.mappingType === 'number' && (
                                    <FormControl size="small" fullWidth className="mt-2">
                                      <InputLabel>representation</InputLabel>
                                      <Select
                                        value={config.representation ?? ''}
                                        label="representation"
                                        onChange={(e) =>
                                          syncSearchDefinition(
                                            searchDynamicMappings,
                                            searchFieldConfigs.map((fieldConfig) =>
                                              fieldConfig.id === config.id
                                                ? {
                                                    ...fieldConfig,
                                                    representation: e.target.value
                                                      ? (e.target.value as SearchNumberRepresentation)
                                                      : undefined
                                                  }
                                                : fieldConfig
                                            )
                                          )
                                        }
                                        sx={ATLAS_FIELD_SX}
                                      >
                                        <MenuItem value="">(empty)</MenuItem>
                                        {NUMBER_REPRESENTATION_OPTIONS.map((opt) => (
                                          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                                        ))}
                                      </Select>
                                    </FormControl>
                                  )}
                                </div>
                              ))}
                              {selectedField && (
                                <Button size="small" onClick={() => handleAddSearchFieldVariant(option.path)}>
                                  + type
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-500/20 bg-slate-900/25 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
                      {copy.generatedDefinition}
                    </div>
                    <Button
                      size="small"
                      startIcon={<Copy className="h-3.5 w-3.5" />}
                      onClick={() => void navigator.clipboard.writeText(JSON.stringify(buildAtlasSearchDefinition(searchDynamicMappings, searchFieldConfigs), null, 2))}
                    >
                      {language === 'es' ? 'Copiar' : 'Copy'}
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-slate-300">
                    {copy.selectedAttributes(searchFieldConfigs.length, searchDynamicMappings)}
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-100">
                    {JSON.stringify(buildAtlasSearchDefinition(searchDynamicMappings, searchFieldConfigs), null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {model.indexes.map((index) => (
          <div key={index.id} className="flex items-start justify-between rounded-xl border border-slate-500/20 bg-slate-900/30 p-3 text-slate-100 shadow-sm">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-medium">{index.name}</span>
                <span className="rounded border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-100">{index.type}</span>
                {index.unique && <span className="rounded border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100">{copy.unique}</span>}
                {index.sparse && <span className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">{copy.sparse}</span>}
              </div>

              {index.type === 'wildcard' ? (
                <div className="text-sm text-muted-foreground">
                  {getWildcardFieldPath(index.fields)}
                  {index.wildcardProjection ? ` | ${copy.projectionPreview}: ${summarizeWildcardProjection(index.wildcardProjection)}` : ''}
                  {index.collation ? ' | collation' : ''}
                </div>
              ) : index.type === 'atlas_search' ? (
                <div className="text-sm text-muted-foreground">{summarizeAtlasSearchDefinition(index.searchDefinition)}</div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {copy.fields}: {index.fields.map((field) => `${field.field} (${formatIndexFieldMode(field)})`).join(', ')}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button size="small" onClick={() => startEditingIndex(index)}>
                {copy.edit}
              </Button>
              <IconButton size="small" onClick={() => handleDeleteIndex(index.id)} color="error">
                <Trash2 className="w-4 h-4" />
              </IconButton>
            </div>
          </div>
        ))}

        {model.indexes.length === 0 && !editingIndex && (
          <div className="py-8 text-center text-slate-300">{copy.noIndexes}</div>
        )}
      </div>
    </div>
  );
}

function cloneIndexDraft(index: Index): Index {
  return {
    ...index,
    fields: index.fields.map((field) => normalizeIndexField({ ...field }))
  };
}

function normalizeIndexField(field: Index['fields'][number]): Index['fields'][number] {
  const mode = field.mode || (field.order === 'desc' ? 'desc' : 'asc');
  return {
    ...field,
    mode,
    order: mode === 'desc' ? 'desc' : 'asc'
  };
}

function buildIndexFieldModeUpdate(mode: MongoIndexFieldMode): Partial<Index['fields'][number]> {
  if (mode === 'desc') {
    return { mode, order: 'desc' };
  }

  if (mode === 'asc') {
    return { mode, order: 'asc' };
  }

  return { mode, order: 'asc' };
}

function formatIndexFieldMode(field: Index['fields'][number]) {
  switch (normalizeIndexField(field).mode) {
    case 'desc':
      return '-1';
    case 'text':
    case 'hashed':
    case '2dsphere':
    case '2d':
      return normalizeIndexField(field).mode;
    default:
      return '1';
  }
}

function getAllFieldOptions(fields: Field[], prefix = ''): FieldPathOption[] {
  const options: FieldPathOption[] = [];

  fields.forEach((field) => {
    if (!field.name) {
      return;
    }

    const path = prefix ? `${prefix}.${field.name}` : field.name;

    options.push({
      displayType: buildFieldDisplayType(field),
      path,
      searchMappingType: inferSearchMappingType(field)
    });

    if (field.type === 'Document' && field.nestedFields) {
      options.push(...getAllFieldOptions(field.nestedFields, path));
    } else if (field.type === 'Array' && field.arrayType === 'Document' && field.nestedFields) {
      options.push(...getAllFieldOptions(field.nestedFields, path));
    }
  });

  return options;
}

function buildFieldDisplayType(field: Field) {
  if (field.type === 'Array' && field.arrayType) {
    return `${field.arrayType}[]`;
  }

  return field.type;
}

function SearchableFieldSelect({
  label,
  options,
  value,
  onChange,
  placeholder
}: {
  label: string;
  options: FieldPathOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const selectedOption = options.find((option) => option.path === value) || null;

  return (
    <Autocomplete
      size="small"
      className="flex-1"
      openOnFocus
      autoHighlight
      selectOnFocus
      clearOnBlur={false}
      options={options}
      value={selectedOption}
      onChange={(_, nextValue) => onChange(nextValue?.path || '')}
      getOptionLabel={(option) => `${option.path} - ${option.displayType}`}
      isOptionEqualToValue={(option, currentValue) => option.path === currentValue.path}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
        />
      )}
      renderOption={(props, option) => (
        <li {...props} key={option.path}>
          {option.path} - {option.displayType}
        </li>
      )}
    />
  );
}

function SearchableValueSelect({
  label,
  options,
  value,
  onChange,
  placeholder
}: {
  label: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const selectedOption = options.find((option) => option.value === value) || null;

  return (
    <Autocomplete
      size="small"
      fullWidth
      openOnFocus
      autoHighlight
      selectOnFocus
      clearOnBlur={false}
      options={options}
      value={selectedOption}
      onChange={(_, nextValue) => onChange(nextValue?.value || '')}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, currentValue) => option.value === currentValue.value}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
        />
      )}
      renderOption={(props, option) => (
        <li {...props} key={option.value}>
          {option.label}
        </li>
      )}
    />
  );
}

function inferSearchMappingType(field: Field): SearchMappingType | null {
  if (field.type === 'Array' && field.arrayType) {
    return inferSearchMappingType({ ...field, type: field.arrayType, arrayType: undefined });
  }

  switch (field.type) {
    case 'Boolean':
      return 'boolean';
    case 'Date':
      return 'date';
    case 'Document':
      return 'document';
    case 'Decimal128':
    case 'Double':
    case 'Int':
    case 'Long':
    case 'Number':
      return 'number';
    case 'ObjectId':
      return 'objectId';
    case 'String':
      return 'string';
    default:
      return null;
  }
}

function normalizeWildcardPath(path: string) {
  if (!path || path === '$**') {
    return '$**';
  }

  return path.endsWith('.$**') ? path : `${path}.$**`;
}

function getWildcardFieldPath(fields: Index['fields'] | undefined) {
  const wildcardField = (fields || []).find((field) => String(field.field || '').includes('$**'))?.field;
  return normalizeWildcardPath(wildcardField || '$**');
}

function normalizeWildcardIndexFields(fields: Index['fields']) {
  const nextFields = (fields || [])
    .filter((field) => String(field.field || '').trim())
    .map((field) => ({ ...field }));

  const wildcardIndex = nextFields.findIndex((field) => String(field.field || '').includes('$**'));
  if (wildcardIndex >= 0) {
    return nextFields.map((field, index) =>
      index === wildcardIndex
        ? {
          ...field,
          field: normalizeWildcardPath(field.field || '$**')
        }
        : field
    );
  }

  return [...nextFields, { field: '$**', order: 'asc' }];
}

function replaceWildcardIndexField(fields: Index['fields'], nextWildcardPath: string) {
  const normalizedWildcardPath = normalizeWildcardPath(nextWildcardPath);
  const nextFields = (fields || []).map((field) => ({ ...field }));
  const wildcardIndex = nextFields.findIndex((field) => String(field.field || '').includes('$**'));

  if (wildcardIndex >= 0) {
    return nextFields.map((field, index) =>
      index === wildcardIndex
        ? {
          ...field,
          field: normalizedWildcardPath
        }
        : field
    );
  }

  return [
    ...nextFields,
    {
      field: normalizedWildcardPath,
      order: 'asc'
    }
  ];
}

function getWildcardRootPath(path: string) {
  const normalizedPath = normalizeWildcardPath(path);
  if (normalizedPath === '$**') {
    return '';
  }

  return normalizedPath.replace(/\.\$\*\*$/, '');
}

function isPathInsideWildcardRoot(path: string, wildcardRootPath: string) {
  if (!wildcardRootPath) {
    return true;
  }

  return path === wildcardRootPath || path.startsWith(`${wildcardRootPath}.`);
}

function buildWildcardProjection(mode: WildcardProjectionMode, paths: string[]) {
  if (paths.length === 0) {
    return '';
  }

  const projectionValue = mode === 'include' ? 1 : 0;
  const projection = paths.reduce<Record<string, number>>((accumulator, path) => {
    accumulator[path] = projectionValue;
    return accumulator;
  }, {});

  return JSON.stringify(projection, null, 2);
}

function parseWildcardProjection(value: string | undefined, validPaths: string[]) {
  if (!value) {
    return { mode: 'include' as WildcardProjectionMode, paths: [] };
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const rawEntries = Object.entries(parsed).filter(([path]) => validPaths.includes(path));
    if (rawEntries.length === 0) {
      return { mode: 'include' as WildcardProjectionMode, paths: [] };
    }

    const mode = rawEntries.every(([, entryValue]) => Number(entryValue) === 0) ? 'exclude' : 'include';
    return {
      mode,
      paths: rawEntries.map(([path]) => path)
    };
  } catch {
    return { mode: 'include' as WildcardProjectionMode, paths: [] };
  }
}

function buildAtlasSearchDefinition(dynamic: boolean, fields: SearchFieldConfig[]) {
  const mappingFields: Record<string, unknown> = {};
  const normalizedFields = normalizeSearchFieldConfigsForBuild(fields);

  normalizedFields
    .filter((field) => field.fieldPath)
    .forEach((field) => {
      insertAtlasSearchField(mappingFields, field.fieldPath, field, normalizedFields);
    });

  return {
    mappings: {
      dynamic,
      fields: mappingFields
    }
  };
}

function insertAtlasSearchField(
  target: Record<string, unknown>,
  path: string,
  fieldConfig: SearchFieldConfig,
  allFields: SearchFieldConfig[],
  applyVariantScope = true,
  contextPath = ''
) {
  const segments = path.split('.');
  let currentTarget = target;

  segments.forEach((segment, index) => {
    const currentPath = contextPath
      ? `${contextPath}.${segments.slice(0, index + 1).join('.')}`
      : segments.slice(0, index + 1).join('.');
    const isLeaf = index === segments.length - 1;

    if (isLeaf) {
      const entry: Record<string, unknown> = { type: fieldConfig.mappingType };
      if (fieldConfig.mappingType === 'document' || fieldConfig.mappingType === 'embeddedDocuments') {
        entry.dynamic = false;
        entry.fields = buildSubFieldMappings(path, allFields, fieldConfig.mappingType);
      }
      if (fieldConfig.mappingType === 'autocomplete') {
        if (fieldConfig.tokenization) entry.tokenization = fieldConfig.tokenization;
        if (fieldConfig.analyzer) entry.analyzer = fieldConfig.analyzer;
        if (typeof fieldConfig.minGrams === 'number') entry.minGrams = fieldConfig.minGrams;
        if (typeof fieldConfig.maxGrams === 'number') entry.maxGrams = fieldConfig.maxGrams;
      }
      if (fieldConfig.mappingType === 'number' && fieldConfig.representation) {
        entry.representation = fieldConfig.representation;
      }
      const existing = currentTarget[segment];
      if (!existing) {
        currentTarget[segment] = entry;
        return;
      }

      if (Array.isArray(existing)) {
        const duplicateExists = existing.some((candidate) => areSearchEntriesEqual(candidate, entry));
        currentTarget[segment] = duplicateExists ? existing : [...existing, entry];
        return;
      }

      if (areSearchEntriesEqual(existing, entry)) {
        currentTarget[segment] = existing;
        return;
      }

      currentTarget[segment] = [existing, entry];
      return;
    }

    const rawNode = currentTarget[segment] as
      | { fields?: Record<string, unknown>; type?: string }
      | Array<{ fields?: Record<string, unknown>; type?: string }>
      | undefined;

    let documentContainer: { fields?: Record<string, unknown>; type?: string } | undefined;
    const explicitVariantType = getExplicitContainerType(fieldConfig, currentPath, applyVariantScope);
    let preferredType = explicitVariantType || 'document';
    if (Array.isArray(rawNode)) {
      documentContainer = rawNode.find((node) => node.type === preferredType && node.fields);
      if (!documentContainer) {
        documentContainer = { type: preferredType, fields: {} };
        currentTarget[segment] = [documentContainer, ...rawNode];
      }
    } else {
      documentContainer = rawNode;
      if (
        !explicitVariantType &&
        (documentContainer?.type === 'document' || documentContainer?.type === 'embeddedDocuments')
      ) {
        preferredType = documentContainer.type;
      }
      if (documentContainer?.fields && documentContainer.type && documentContainer.type !== preferredType) {
        const variantContainer = { type: preferredType, fields: {} as Record<string, unknown> };
        currentTarget[segment] = [variantContainer, documentContainer];
        documentContainer = variantContainer;
      } else if (!documentContainer || !documentContainer.fields) {
        documentContainer = { type: preferredType, fields: {} };
        currentTarget[segment] = documentContainer;
      }
    }

    currentTarget = (documentContainer.fields || {}) as Record<string, unknown>;
  });
}

function parseSearchDefinition(value: string | undefined) {
  if (!value) {
    return { dynamic: false, fields: [] as SearchFieldConfig[] };
  }

  try {
    const parsed = JSON.parse(value) as {
      mappings?: { dynamic?: boolean; fields?: Record<string, unknown> };
    };
    const mappings = parsed.mappings || {};
    const fields: SearchFieldConfig[] = [];

    collectAtlasSearchFieldConfigs(mappings.fields || {}, '', fields);

    return {
      dynamic: Boolean(mappings.dynamic),
      fields
    };
  } catch {
    return { dynamic: false, fields: [] as SearchFieldConfig[] };
  }
}

function collectAtlasSearchFieldConfigs(
  fieldsObject: Record<string, unknown>,
  prefix: string,
  accumulator: SearchFieldConfig[]
) {
  collectAtlasSearchFieldConfigsRecursive(fieldsObject, prefix, accumulator, undefined, []);
}

function collectAtlasSearchFieldConfigsRecursive(
  fieldsObject: Record<string, unknown>,
  prefix: string,
  accumulator: SearchFieldConfig[],
  parentVariantScope?: { type: 'document' | 'embeddedDocuments'; path: string },
  variantTrail: Array<{ path: string; type: 'document' | 'embeddedDocuments' }> = []
) {
  Object.entries(fieldsObject).forEach(([key, value]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    const fieldDefinition = value as 
      | { fields?: Record<string, unknown>; type?: string; dynamic?: boolean; tokenization?: 'edgeGram' | 'rightEdgeGram' | 'nGram'; analyzer?: string; minGrams?: number; maxGrams?: number; representation?: SearchNumberRepresentation }
      | Array<{ type?: string; dynamic?: boolean; fields?: Record<string, unknown>; tokenization?: 'edgeGram' | 'rightEdgeGram' | 'nGram'; analyzer?: string; minGrams?: number; maxGrams?: number; representation?: SearchNumberRepresentation }>;
    
    if (Array.isArray(fieldDefinition)) {
      // Array of variants - register each variant and recurse into container fields.
      fieldDefinition.forEach((variant) => {
        if (!variant.type) return;
        const mappingType = normalizeSearchMappingType(variant.type);
        if (!mappingType) return;
        
        if (mappingType === 'document' || mappingType === 'embeddedDocuments') {
          accumulator.push({
            id: `${nextPath}-${mappingType}-${Math.random()}`,
            fieldPath: nextPath,
            mappingType,
            variantScope: parentVariantScope?.type,
            variantScopePath: parentVariantScope?.path,
            variantTrail,
            tokenization: variant.tokenization,
            analyzer: variant.analyzer,
            minGrams: variant.minGrams,
            maxGrams: variant.maxGrams,
            representation: variant.representation
          });
        } else {
          accumulator.push({
            id: `${nextPath}-${mappingType}-${Math.random()}`,
            fieldPath: nextPath,
            mappingType,
            variantScope: parentVariantScope?.type,
            variantScopePath: parentVariantScope?.path,
            variantTrail,
            tokenization: variant.tokenization,
            analyzer: variant.analyzer,
            minGrams: variant.minGrams,
            maxGrams: variant.maxGrams,
            representation: variant.representation
          });
        }
        
        if (variant.fields) {
          collectAtlasSearchFieldConfigsRecursive(
            variant.fields,
            nextPath,
            accumulator,
            // Variants in an array define a new branch. Their descendants must
            // remain scoped to this exact container.
            { type: mappingType, path: nextPath },
            [...variantTrail, { type: mappingType, path: nextPath }]
          );
        }
      });
      return;
    }

    if (fieldDefinition.type) {
      const mappingType = normalizeSearchMappingType(fieldDefinition.type);
      if (!mappingType) return;
      
      // Determine if this is a container with sub-fields
      const hasSubFields = fieldDefinition.fields && Object.keys(fieldDefinition.fields).length > 0;
      const isContainer = mappingType === 'document' || mappingType === 'embeddedDocuments';
      
      if (!isContainer) {
        // Leaf field (not a container) - always register it
        accumulator.push({
          id: `${nextPath}-${mappingType}-${Math.random()}`,
          fieldPath: nextPath,
          mappingType,
          variantScope: parentVariantScope?.type,
          variantScopePath: parentVariantScope?.path,
          variantTrail,
          tokenization: fieldDefinition.tokenization,
          analyzer: fieldDefinition.analyzer,
          minGrams: fieldDefinition.minGrams,
          maxGrams: fieldDefinition.maxGrams,
          representation: fieldDefinition.representation
        });
      } else if (hasSubFields && (!parentVariantScope || mappingType === 'embeddedDocuments')) {
        // Keep top-level containers, and always keep embeddedDocuments even
        // when they are nested in another variant: the embedded container is
        // semantic data, not just a structural path.
        accumulator.push({
          id: `${nextPath}-${mappingType}-${Math.random()}`,
          fieldPath: nextPath,
          mappingType,
          variantScope: parentVariantScope?.type,
          variantScopePath: parentVariantScope?.path,
          variantTrail,
          tokenization: fieldDefinition.tokenization,
          analyzer: fieldDefinition.analyzer,
          minGrams: fieldDefinition.minGrams,
          maxGrams: fieldDefinition.maxGrams,
          representation: fieldDefinition.representation
        });
      }
      
      // Recurse into nested fields if they exist
      if (hasSubFields) {
        collectAtlasSearchFieldConfigsRecursive(
          fieldDefinition.fields,
          nextPath,
          accumulator,
          // A regular nested document is only structural: it must not discard
          // the scope inherited from an outer document/embeddedDocuments
          // variant. embeddedDocuments, on the other hand, starts a new
          // independently queryable nested scope.
          mappingType === 'embeddedDocuments'
            ? { type: mappingType, path: nextPath }
            : parentVariantScope,
          mappingType === 'embeddedDocuments'
            ? [...variantTrail, { type: mappingType, path: nextPath }]
            : variantTrail
        );
      }
    }
  });
}

function normalizeSearchMappingType(value: string): SearchMappingType | null {
  switch (value) {
    case 'autocomplete':
      return 'autocomplete';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'document':
      return 'document';
    case 'geo':
      return 'geo';
    case 'number':
      return 'number';
    case 'objectId':
      return 'objectId';
    case 'string':
      return 'string';
    case 'token':
      return 'token';
    case 'embeddedDocuments':
      return 'embeddedDocuments';
    default:
      return null;
  }
}

function buildSubFieldMappings(
  parentPath: string,
  allFields: SearchFieldConfig[],
  variantType: 'document' | 'embeddedDocuments'
) {
  const nested: Record<string, unknown> = {};
  const prefix = `${parentPath}.`;
  const parentVariants = new Set(
    allFields
      .filter((f) => f.fieldPath === parentPath && (f.mappingType === 'document' || f.mappingType === 'embeddedDocuments'))
      .map((f) => f.mappingType)
  );
  const hasBothParentVariants = parentVariants.has('document') && parentVariants.has('embeddedDocuments');
  allFields
    .filter(
      (f) =>
        f.fieldPath.startsWith(prefix) &&
        (getVariantTypeAtPath(f, parentPath) === undefined || getVariantTypeAtPath(f, parentPath) === variantType) &&
        (!hasBothParentVariants || getVariantTypeAtPath(f, parentPath) !== undefined || f.variantScope === 'all')
    )
    .forEach((f) => {
      const relativePath = f.fieldPath.slice(prefix.length);
      insertAtlasSearchField(nested, relativePath, f, allFields, true, parentPath);
    });
  return nested;
}

function getVariantTypeAtPath(fieldConfig: SearchFieldConfig, path: string) {
  return fieldConfig.variantTrail?.find((variant) => variant.path === path)?.type;
}

function getPreferredContainerType(
  fieldConfig: SearchFieldConfig,
  path: string,
  applyVariantScope: boolean
): 'document' | 'embeddedDocuments' {
  return getExplicitContainerType(fieldConfig, path, applyVariantScope) || 'document';
}

function getExplicitContainerType(
  fieldConfig: SearchFieldConfig,
  path: string,
  applyVariantScope: boolean
): 'document' | 'embeddedDocuments' | undefined {
  const branchType = getVariantTypeAtPath(fieldConfig, path);
  if (branchType) return branchType;
  if (
    applyVariantScope &&
    fieldConfig.variantScopePath === path &&
    (fieldConfig.variantScope === 'document' || fieldConfig.variantScope === 'embeddedDocuments')
  ) {
    return fieldConfig.variantScope;
  }
  return undefined;
}

function areSearchEntriesEqual(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function normalizeSearchFieldConfigsForBuild(fields: SearchFieldConfig[]) {
  const byKey = new Map<string, SearchFieldConfig>();

  fields.forEach((fieldConfig) => {
    const key = `${normalizeScopePath(fieldConfig.fieldPath)}::${fieldConfig.mappingType}::${fieldConfig.variantScope || 'all'}`;
    // Keep only the latest config for a path+type+scope combination (scope changes overwrite previous state).
    byKey.set(key, fieldConfig);
  });

  return Array.from(byKey.values());
}

function dedupeSearchConfigsByPathType(fields: SearchFieldConfig[], keepId: string) {
  const keep = fields.find((f) => f.id === keepId);
  if (!keep) return fields;
  const keepPath = normalizeScopePath(keep.fieldPath);

  return fields.filter((f) => {
    if (f.id === keepId) return true;
    return !(normalizeScopePath(f.fieldPath) === keepPath && f.mappingType === keep.mappingType);
  });
}

function normalizeScopePath(path: string) {
  return path.replace(/\[\]/g, '');
}

function matchesFieldOptionFilter(option: FieldPathOption, filterValue: string) {
  const normalizedFilter = filterValue.trim().toLowerCase();
  if (!normalizedFilter) {
    return true;
  }

  return (
    option.path.toLowerCase().includes(normalizedFilter) ||
    option.displayType.toLowerCase().includes(normalizedFilter)
  );
}

function mergeFieldPathsInDisplayOrder(existingPaths: string[], newPaths: string[], displayOrder: string[]) {
  const nextPathSet = new Set(existingPaths);
  newPaths.forEach((path) => nextPathSet.add(path));
  return displayOrder.filter((path) => nextPathSet.has(path));
}

function sortSearchFieldConfigs(fields: SearchFieldConfig[], searchableFieldOptions: FieldPathOption[]) {
  const fieldOrder = new Map(searchableFieldOptions.map((option, index) => [option.path, index]));

  return [...fields].sort((left, right) => {
    const leftIndex = fieldOrder.get(left.fieldPath) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = fieldOrder.get(right.fieldPath) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

function areSearchFieldConfigsEqual(left: SearchFieldConfig[], right: SearchFieldConfig[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => {
    const candidate = right[index];
    return candidate && candidate.fieldPath === item.fieldPath && candidate.mappingType === item.mappingType;
  });
}

function formatSearchMappingTypeLabel(value: SearchMappingType) {
  return SEARCH_MAPPING_OPTIONS.find((option) => option.value === value)?.label || value;
}

function summarizeWildcardProjection(value: string | undefined) {
  if (!value) {
    return 'no projection filter';
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const count = Object.keys(parsed).length;
    const mode = Object.values(parsed).every((entryValue) => Number(entryValue) === 0) ? 'exclude' : 'include';
    return `${mode} ${count} field${count === 1 ? '' : 's'}`;
  } catch {
    return 'custom projection';
  }
}

function summarizeAtlasSearchDefinition(value: string | undefined) {
  const parsed = parseSearchDefinition(value);
  if (parsed.fields.length === 0) {
    return parsed.dynamic ? 'Atlas Search with dynamic mappings' : 'Atlas Search definition';
  }

  return `${parsed.fields.length} mapped attribute${parsed.fields.length === 1 ? '' : 's'}${
    parsed.dynamic ? ' + dynamic' : ''
  }`;
}
