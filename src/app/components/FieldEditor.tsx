import { Field, Model } from './MongoModelBuilder';
import {
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
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getMongoTypeOptionLabel } from '../utils/mongoTypeLabels';
import { useAppLanguage } from '../i18n';

const MONGO_TYPES = [
  'String',
  'Enum',
  'Int',
  'Number',
  'Double',
  'Long',
  'Boolean',
  'Date',
  'Timestamp',
  'ObjectId',
  'Array',
  'Document',
  'Mixed',
  'Buffer',
  'Undefined',
  'DbPointer',
  'JavaScript',
  'JavaScriptWithScope',
  'Regex',
  'Symbol',
  'MinKey',
  'MaxKey',
  'Decimal128',
  'Null'
];

const NON_ARRAY_TYPES = MONGO_TYPES.filter((type) => type !== 'Array');

const COMPACT_FIELD_SX = {
  '& .MuiOutlinedInput-root': {
    height: 34,
    borderRadius: '8px',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#f8fafc',
    fontSize: '0.82rem',
    '& fieldset': {
      borderColor: 'rgba(255,255,255,0.08)'
    },
    '&:hover fieldset': {
      borderColor: 'rgba(255,255,255,0.16)'
    },
    '&.Mui-focused fieldset': {
      borderColor: '#38bdf8'
    },
    '&.Mui-disabled': {
      color: 'rgba(226,232,240,0.65)',
      WebkitTextFillColor: 'rgba(226,232,240,0.65)'
    }
  },
  '& .MuiInputBase-input': {
    padding: '8px 9px',
    color: '#f8fafc',
    WebkitTextFillColor: '#f8fafc'
  },
  '& .MuiSelect-select': {
    padding: '8px 9px',
    color: '#f8fafc',
    WebkitTextFillColor: '#f8fafc'
  },
  '& .MuiSvgIcon-root': {
    color: '#f8fafc',
    fontSize: 18
  }
};

const COMPACT_CHECKBOX_SX = {
  padding: '2px',
  color: '#f8fafc',
  '&.Mui-checked': {
    color: '#f8fafc'
  },
  '&.Mui-disabled': {
    color: 'rgba(248,250,252,0.48)'
  },
  '& .MuiSvgIcon-root': {
    fontSize: 16
  }
};

const COMPACT_MENU_PROPS = {
  PaperProps: {
    sx: {
      backgroundColor: '#334155',
      color: '#f8fafc',
      border: '1px solid rgba(148,163,184,0.18)',
      mt: 0.75
    }
  }
};

const DEFAULT_FIELD_SX = {
  '& .MuiInputBase-root': {
    backgroundColor: 'transparent'
  }
};

interface Props {
  field: Field;
  index: number;
  depth: number;
  models: Model[];
  isIdField: boolean;
  onUpdate: (field: Partial<Field>) => void;
  onDelete: () => void;
  onAddNestedField?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  layout?: 'default' | 'compact';
  forceExpand?: boolean;
  compactVariant?: 'card' | 'table';
  searchQuery?: string;
  selectedPath?: string;
  selectedPaths?: string[];
  parentPath?: string;
  onRenamePath?: (previousPath: string, nextPath: string) => void;
}

export default function FieldEditor({
  field,
  depth,
  models,
  isIdField,
  onUpdate,
  onDelete,
  onAddNestedField,
  onMoveUp,
  onMoveDown,
  layout = 'default',
  forceExpand = false,
  compactVariant = 'card',
  searchQuery = '',
  selectedPath = '',
  selectedPaths = [],
  parentPath = '',
  onRenamePath
}: Props) {
  const { language } = useAppLanguage();
  const copy =
    language === 'es'
      ? {
          fieldPlaceholder: 'nombre_campo',
          moveUp: 'Subir campo',
          moveDown: 'Bajar campo',
          deleteField: 'Eliminar campo',
          reference: 'Referencia',
          arrayRef: 'Ref. array',
          none: 'Ninguna',
          addNested: 'Añadir',
          fieldName: 'Nombre del campo',
          type: 'Tipo',
          arrayType: 'Tipo del array',
          addNestedField: 'Añadir campo anidado',
          enum: 'Enum',
          enumValues: 'Valores enum (coma separada)'
        }
      : {
          fieldPlaceholder: 'field_name',
          moveUp: 'Move field up',
          moveDown: 'Move field down',
          deleteField: 'Delete field',
          reference: 'Reference',
          arrayRef: 'Array Ref',
          none: 'None',
          addNested: 'Add',
          fieldName: 'Field Name',
          type: 'Type',
          arrayType: 'Array Type',
          addNestedField: 'Add nested field',
          enum: 'Enum',
          enumValues: 'Enum values (comma separated)'
        };

  const isCompact = layout === 'compact';
  const [isExpanded, setIsExpanded] = useState(() => !isCompact);
  const [nameDraft, setNameDraft] = useState(field.name);
  const isArrayField = Boolean(field.isArray);
  const effectiveType = isArrayField ? field.arrayType || 'String' : field.type;
  const isDocumentType = effectiveType === 'Document';
  const canAddNested = isDocumentType;
  const hasNestedChildren = Boolean(isDocumentType && field.nestedFields && field.nestedFields.length > 0);
  const canShowReference = !isArrayField && effectiveType === 'ObjectId' && !isIdField;
  const canShowArrayReference = isArrayField && effectiveType === 'ObjectId';
  const canUseEnum = effectiveType !== 'Document' && effectiveType !== 'Array' && effectiveType !== 'Mixed';
  const canUseMultipleBsonTypes = !isArrayField && field.type === 'Mixed';
  const hasEnum = Boolean(field.enum && field.enum.length > 0);
  const hasCompactDetails = canShowReference || canShowArrayReference || canAddNested || hasNestedChildren || hasEnum || canUseMultipleBsonTypes;
  const hasEnumOnlyDetails = hasEnum && !canShowReference && !canShowArrayReference && !canAddNested && !hasNestedChildren;
  const canExpand = hasNestedChildren;
  const isSearchMatch = Boolean(searchQuery && (field.name || '').toLowerCase().includes(searchQuery.toLowerCase()));
  const currentPath = parentPath ? `${parentPath}.${field.name}` : field.name || '';
  const currentPathForSelection =
    field.type === 'Array' && field.arrayType === 'Document' ? `${currentPath}[]` : currentPath;
  const normalizedCurrentPath = currentPathForSelection.replace(/\[\]/g, '');
  const normalizedSelectedPath = selectedPath.replace(/\[\]/g, '');
  const normalizedSelectedPaths = selectedPaths.map((path) => path.replace(/\[\]/g, ''));
  const isSelectedPath =
    normalizedSelectedPaths.some(
      (path) => path === normalizedCurrentPath || path.startsWith(`${normalizedCurrentPath}.`)
    ) ||
    (Boolean(normalizedSelectedPath) &&
      (normalizedSelectedPath === normalizedCurrentPath ||
        normalizedSelectedPath.startsWith(`${normalizedCurrentPath}.`)));
  const defaultTypeValue = isArrayField ? field.arrayType || 'String' : field.type;
  const typeDisplayValue = field.type === 'Mixed' && field.bsonTypes?.length
    ? `Mixed (${field.bsonTypes.join(' | ')})`
    : getMongoTypeOptionLabel(defaultTypeValue);
  const defaultTypeOptions = isIdField ? NON_ARRAY_TYPES : MONGO_TYPES;
  const multiTypeOptions = NON_ARRAY_TYPES.filter((type) => !['Enum', 'Document', 'Mixed', 'Null'].includes(type));

  useEffect(() => {
    if (forceExpand) {
      setIsExpanded(true);
    }
  }, [forceExpand]);

  useEffect(() => {
    setNameDraft(field.name);
  }, [field.name]);

  const commitNameDraft = () => {
    const nextName = nameDraft;
    if (nextName === field.name) {
      return;
    }

    if (nextName !== field.name && field.name && nextName.trim()) {
      const previousPath = currentPathForSelection;
      const nextPathBase = parentPath ? `${parentPath}.${nextName}` : nextName;
      const nextPath =
        field.type === 'Array' && field.arrayType === 'Document' ? `${nextPathBase}[]` : nextPathBase;
      onRenamePath?.(previousPath, nextPath);
    }

    onUpdate({ name: nextName });
  };

  const handleUpdateNestedField = (nestedIndex: number, updates: Partial<Field>) => {
    if (!field.nestedFields) return;

    const previousNestedField = field.nestedFields[nestedIndex];
    if (
      typeof updates.name === 'string' &&
      updates.name.trim() &&
      updates.name !== previousNestedField?.name &&
      previousNestedField?.name
    ) {
      const previousNestedPath = currentPathForSelection
        ? `${currentPathForSelection}.${previousNestedField.name}`
        : previousNestedField.name;
      const nextNestedPath = currentPathForSelection
        ? `${currentPathForSelection}.${updates.name}`
        : updates.name;
      onRenamePath?.(previousNestedPath, nextNestedPath);
    }

    const updatedNested = [...field.nestedFields];
    updatedNested[nestedIndex] = { ...updatedNested[nestedIndex], ...updates };
    onUpdate({ nestedFields: updatedNested });
  };

  const handleDeleteNestedField = (nestedIndex: number) => {
    if (!field.nestedFields) return;

    const updatedNested = field.nestedFields.filter((_, index) => index !== nestedIndex);
    onUpdate({ nestedFields: updatedNested });
  };

  const handleMoveNestedField = (nestedIndex: number, direction: 'up' | 'down') => {
    if (!field.nestedFields) return;

    const targetIndex = direction === 'up' ? nestedIndex - 1 : nestedIndex + 1;
    if (targetIndex < 0 || targetIndex >= field.nestedFields.length) {
      return;
    }

    const updatedNested = [...field.nestedFields];
    const [movedField] = updatedNested.splice(nestedIndex, 1);
    updatedNested.splice(targetIndex, 0, movedField);
    onUpdate({ nestedFields: updatedNested });
  };

  const handleAddNestedFieldInternal = (parentField: Field) => {
    const newNested: Field = {
      name: '',
      type: 'String',
      required: false,
      nullable: false,
      description: '',
      nestedFields: []
    };

    const updatedNested = [...(parentField.nestedFields || []), newNested];
    onUpdate({ nestedFields: updatedNested });
  };

  const handleFieldTypeChange = (nextType: string) => {
    if (isArrayField) {
      const updates: Partial<Field> = {
        type: 'Array',
        arrayType: nextType,
        nestedFields: nextType === 'Document' ? field.nestedFields || [] : [],
        arrayRef: nextType === 'ObjectId' ? field.arrayRef || '' : undefined,
        isArray: true,
        enum: nextType === 'Enum' ? (field.enum && field.enum.length ? field.enum : ['']) : field.enum
      };
      onUpdate(updates);
      return;
    }

    const updates: Partial<Field> = {
      type: nextType,
      // Mixed starts without allowed BSON types. They must be chosen explicitly.
      bsonTypes: nextType === 'Mixed' && field.type === 'Mixed' ? field.bsonTypes : undefined,
      isArray: false,
      nestedFields: nextType === 'Document' ? field.nestedFields || [] : [],
      ref: nextType === 'ObjectId' ? field.arrayRef || field.ref || '' : undefined,
      arrayType: undefined,
      arrayRef: undefined,
      enum: nextType === 'Enum' ? (field.enum && field.enum.length ? field.enum : ['']) : field.enum
    };

    if (nextType === 'Null') {
      updates.nullable = false;
    }

    onUpdate(updates);
  };

  const handleArrayToggle = (checked: boolean) => {
    if (checked) {
      const nextArrayType = effectiveType === 'Null' ? 'String' : effectiveType;
      const updates: Partial<Field> = {
        type: 'Array',
        isArray: true,
        arrayType: nextArrayType,
        nestedFields: nextArrayType === 'Document' ? field.nestedFields || [] : [],
        ref: undefined,
        arrayRef: nextArrayType === 'ObjectId' ? field.arrayRef || field.ref || '' : undefined
      };
      onUpdate(updates);
      return;
    }

    const nextType = field.arrayType || 'String';
    const updates: Partial<Field> = {
      type: nextType,
      isArray: false,
      arrayType: undefined,
      nestedFields: nextType === 'Document' ? field.nestedFields || [] : [],
      ref: nextType === 'ObjectId' ? field.arrayRef || field.ref || '' : undefined,
      arrayRef: undefined
    };

    if (nextType === 'Null') {
      updates.nullable = false;
    }

    onUpdate(updates);
  };

  const nestedFieldsContent = hasNestedChildren && isExpanded && field.nestedFields && (
    <div className={isCompact ? 'mt-3 space-y-2' : 'mt-2'}>
      {field.nestedFields.map((nestedField, nestedIndex) => (
        <FieldEditor
          key={nestedIndex}
          field={nestedField}
          index={nestedIndex}
          depth={depth + 1}
          models={models}
          isIdField={false}
          onUpdate={(updates) => handleUpdateNestedField(nestedIndex, updates)}
          onDelete={() => handleDeleteNestedField(nestedIndex)}
          onAddNestedField={onAddNestedField}
          onMoveUp={nestedIndex > 0 ? () => handleMoveNestedField(nestedIndex, 'up') : undefined}
          onMoveDown={
            nestedIndex < field.nestedFields.length - 1 ? () => handleMoveNestedField(nestedIndex, 'down') : undefined
          }
          layout={layout}
          compactVariant={compactVariant}
          forceExpand={forceExpand}
          searchQuery={searchQuery}
          selectedPath={selectedPath}
          selectedPaths={selectedPaths}
          parentPath={currentPathForSelection}
          onRenamePath={onRenamePath}
        />
      ))}
    </div>
  );

  if (isCompact) {
    const isTableVariant = compactVariant === 'table';
    return (
      <div className={`${depth > 0 ? (isTableVariant ? 'ml-3 border-l border-white/12 pl-2' : 'ml-4 border-l border-white/10 pl-3') : ''}`}>
        <div className={`${isTableVariant ? "border-b border-white/10 py-1.5" : "rounded-xl border border-white/8 bg-[#565656] p-2 shadow-[0_10px_24px_rgba(0,0,0,0.16)]"} ${isSearchMatch ? 'bg-cyan-500/12 ring-1 ring-cyan-300/60 rounded-md' : ''} ${isSelectedPath ? 'ring-2 ring-cyan-200/90 bg-cyan-500/20 rounded-md' : ''}`}>
          <div className={isTableVariant ? "grid w-full grid-cols-[minmax(0,1fr)_minmax(0,120px)_26px_26px_30px_34px_76px] items-center gap-1" : "grid grid-cols-[minmax(0,1fr),112px,88px] items-center gap-2"}>
            <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
              {hasCompactDetails ? (
                <IconButton
                  size="small"
                  onClick={() => setIsExpanded((current) => !current)}
                  className="shrink-0"
                  sx={{
                    color: '#e2e8f0',
                    backgroundColor: isTableVariant ? 'transparent' : 'rgba(255,255,255,0.05)',
                    padding: isTableVariant ? '2px' : '4px',
                    '&:hover': {
                      backgroundColor: isTableVariant ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.1)'
                    }
                  }}
                >
                  {hasEnumOnlyDetails ? (
                    <span className="text-[10px] font-semibold leading-none">{isExpanded ? 'E-' : 'E+'}</span>
                  ) : isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </IconButton>
              ) : (
                <div className={isTableVariant ? "h-5 w-5 shrink-0" : "h-7 w-7 shrink-0"} />
              )}

              <TextField
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitNameDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitNameDraft();
                  }
                }}
                disabled={isIdField}
                size="small"
                placeholder={copy.fieldPlaceholder}
                fullWidth
                sx={{
                  ...COMPACT_FIELD_SX,
                  position: 'relative',
                  zIndex: 2,
                  pointerEvents: 'auto',
                  '& .MuiInputBase-input': {
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap'
                  }
                }}
              />
            </div>

            <FormControl size="small" className="min-w-0">
              <Select
                value={defaultTypeValue}
                onChange={(e) => handleFieldTypeChange(e.target.value)}
                renderValue={() => typeDisplayValue.toLowerCase()}
                sx={{ ...COMPACT_FIELD_SX, position: 'relative', zIndex: 2, pointerEvents: 'auto' }}
                MenuProps={COMPACT_MENU_PROPS}
              >
                {defaultTypeOptions.map((type) => (
                  <MenuItem key={type} value={type}>
                    {getMongoTypeOptionLabel(type).toLowerCase()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {isTableVariant ? (
              <>
                <div className="flex flex-col items-center gap-0">
                  <span className="text-[9px] uppercase tracking-[0.08em] text-slate-400">ARR</span>
                  <Checkbox
                    checked={isArrayField}
                    onChange={(e) => handleArrayToggle(e.target.checked)}
                    disabled={isIdField}
                    size="small"
                    sx={COMPACT_CHECKBOX_SX}
                  />
                </div>
                <div className="flex flex-col items-center gap-0">
                  <span className="text-[9px] uppercase tracking-[0.08em] text-slate-400">NN</span>
                  <Checkbox
                    checked={field.required}
                    onChange={(e) => onUpdate({ required: e.target.checked })}
                    disabled={isIdField}
                    size="small"
                    sx={COMPACT_CHECKBOX_SX}
                  />
                </div>
                <div className="flex flex-col items-center gap-0">
                  <span className="text-[9px] uppercase tracking-[0.08em] text-slate-400">NULL</span>
                  <Checkbox
                    checked={Boolean(field.nullable)}
                    onChange={(e) => onUpdate({ nullable: e.target.checked })}
                    disabled={isIdField || effectiveType === 'Null'}
                    size="small"
                    sx={COMPACT_CHECKBOX_SX}
                  />
                </div>
                <div className="flex flex-col items-center gap-0">
                  <span className="text-[9px] uppercase tracking-[0.08em] text-slate-400">ENUM</span>
                  <Checkbox
                    checked={hasEnum}
                    onChange={(e) => onUpdate({ enum: e.target.checked ? (field.enum && field.enum.length ? field.enum : ['']) : undefined })}
                    disabled={!canUseEnum || isIdField}
                    size="small"
                    sx={COMPACT_CHECKBOX_SX}
                  />
                </div>
              </>
            ) : null}

            <div className="flex items-center justify-end gap-0">
              <IconButton
                size="small"
                onClick={onMoveUp}
                disabled={!onMoveUp}
                title={copy.moveUp}
                sx={compactActionSx}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </IconButton>

              <IconButton
                size="small"
                onClick={onMoveDown}
                disabled={!onMoveDown}
                title={copy.moveDown}
                sx={compactActionSx}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </IconButton>

              {!isIdField && (
                <IconButton size="small" onClick={onDelete} title={copy.deleteField} sx={isTableVariant ? compactDeleteTableSx : compactDeleteSx}>
                  <Trash2 className="h-3.5 w-3.5" />
                </IconButton>
              )}
            </div>
          </div>

          {!isTableVariant && <div className="mt-2 flex flex-wrap gap-1.5 pl-[34px]">
            <label className="flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-200">
              <Checkbox
                checked={isArrayField}
                onChange={(e) => handleArrayToggle(e.target.checked)}
                disabled={isIdField}
                size="small"
                sx={COMPACT_CHECKBOX_SX}
              />
              <span>ARR</span>
            </label>

            <label className="flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-200">
              <Checkbox checked={isIdField} disabled size="small" sx={COMPACT_CHECKBOX_SX} />
              <span>ID</span>
            </label>

            <label className="flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-200">
              <Checkbox
                checked={field.required}
                onChange={(e) => onUpdate({ required: e.target.checked })}
                disabled={isIdField}
                size="small"
                sx={COMPACT_CHECKBOX_SX}
              />
              <span>NN</span>
            </label>

            <label className="flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-200">
              <Checkbox
                checked={Boolean(field.nullable)}
                onChange={(e) => onUpdate({ nullable: e.target.checked })}
                disabled={isIdField || effectiveType === 'Null'}
                size="small"
                sx={COMPACT_CHECKBOX_SX}
              />
              <span>Null</span>
            </label>
            <label className="flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-200">
              <Checkbox
                checked={hasEnum}
                onChange={(e) => onUpdate({ enum: e.target.checked ? (field.enum && field.enum.length ? field.enum : ['']) : undefined })}
                disabled={!canUseEnum || isIdField}
                size="small"
                sx={COMPACT_CHECKBOX_SX}
              />
              <span>ENUM</span>
            </label>
          </div>}


          {isExpanded && hasCompactDetails && (
            <div className="mt-1 rounded-md border border-white/10 bg-slate-950/45 p-1.5">
              <div className="flex flex-wrap items-center gap-1">
                {canUseMultipleBsonTypes && (
                  <FormControl size="small" className="min-w-[160px] flex-1">
                    <InputLabel sx={compactLabelSx}>Tipos BSON</InputLabel>
                    <Select
                      multiple
                      value={field.bsonTypes || []}
                      label="Tipos BSON"
                      renderValue={(selected) => (selected as string[]).join(', ')}
                      onChange={(e) => {
                        const bsonTypes = e.target.value as string[];
                        onUpdate({ bsonTypes: bsonTypes.length ? bsonTypes : undefined, type: 'Mixed' });
                      }}
                      sx={COMPACT_FIELD_SX}
                      MenuProps={COMPACT_MENU_PROPS}
                    >
                      {multiTypeOptions.map((type) => <MenuItem key={type} value={type}>{getMongoTypeOptionLabel(type)}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
                {canShowReference && (
                  <FormControl size="small" className="min-w-[118px] flex-1">
                    <InputLabel sx={compactLabelSx}>{copy.reference}</InputLabel>
                    <Select
                      value={field.ref || ''}
                      label={copy.reference}
                      onChange={(e) => onUpdate({ ref: e.target.value })}
                      sx={COMPACT_FIELD_SX}
                      MenuProps={COMPACT_MENU_PROPS}
                    >
                      <MenuItem value="">{copy.none}</MenuItem>
                      {models.map((model) => (
                        <MenuItem key={model.id} value={model.name}>
                          {model.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                {canShowArrayReference && (
                  <FormControl size="small" className="min-w-[118px] flex-1">
                    <InputLabel sx={compactLabelSx}>{copy.arrayRef}</InputLabel>
                    <Select
                      value={field.arrayRef || ''}
                      label={copy.arrayRef}
                      onChange={(e) => onUpdate({ arrayRef: e.target.value })}
                      sx={COMPACT_FIELD_SX}
                      MenuProps={COMPACT_MENU_PROPS}
                    >
                      <MenuItem value="">{copy.none}</MenuItem>
                      {models.map((model) => (
                        <MenuItem key={model.id} value={model.name}>
                          {model.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                {hasEnum && canUseEnum && (
                  <div className="w-full rounded-md border border-white/10 bg-white/5 p-2">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-slate-300">ENUM</div>
                    <TextField
                      size="small"
                      fullWidth
                      label={copy.enumValues}
                      value={(field.enum || []).join(', ')}
                      onChange={(e) =>
                        onUpdate({
                          enum: e.target.value.split(',').map((item) => item.trim())
                        })
                      }
                      sx={COMPACT_FIELD_SX}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {nestedFieldsContent}
          {isExpanded && canAddNested && (
            <div className="mt-1">
              <Button
                variant="outlined"
                size="small"
                startIcon={<Plus className="h-4 w-4" />}
                onClick={() => handleAddNestedFieldInternal(field)}
                sx={{
                  color: '#e2e8f0',
                  borderColor: 'rgba(148,163,184,0.28)',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  minHeight: 28,
                  px: 1,
                  fontSize: '0.7rem',
                  '&:hover': {
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56,189,248,0.08)'
                  }
                }}
              >
                {copy.addNested}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${depth > 0 ? 'ml-8 border-l-2 border-border pl-4' : ''}`}>
      <div className="mb-2 rounded border border-border bg-card/70 p-3 text-foreground shadow-sm">
        <div className="flex items-start gap-3">
          {canExpand && (
            <IconButton size="small" onClick={() => setIsExpanded(!isExpanded)} className="mt-1">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </IconButton>
          )}

          <TextField
            label={copy.fieldName}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitNameDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitNameDraft();
              }
            }}
            disabled={isIdField}
            size="small"
            className="flex-1"
            sx={DEFAULT_FIELD_SX}
          />

          <FormControl size="small" className="w-40">
            <InputLabel>{copy.type}</InputLabel>
            <Select
              value={defaultTypeValue}
              label={copy.type}
              onChange={(e) => handleFieldTypeChange(e.target.value)}
              renderValue={() => typeDisplayValue}
            >
              {defaultTypeOptions.map((type) => (
                <MenuItem key={type} value={type}>
                  {getMongoTypeOptionLabel(type)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {!isArrayField && field.type === 'Mixed' && (
            <FormControl size="small" className="w-48">
              <InputLabel>Tipos BSON</InputLabel>
              <Select
                multiple
                value={field.bsonTypes || []}
                label="Tipos BSON"
                renderValue={(selected) => (selected as string[]).join(', ')}
                onChange={(e) => {
                  const selected = (e.target.value as string[]).filter(Boolean);
                  onUpdate({ bsonTypes: selected.length ? selected : undefined, type: 'Mixed' });
                }}
              >
                {multiTypeOptions.map((type) => <MenuItem key={type} value={type}>{getMongoTypeOptionLabel(type)}</MenuItem>)}
              </Select>
            </FormControl>
          )}

          {isArrayField && (
            <FormControl size="small" className="w-40">
              <InputLabel>{copy.arrayType}</InputLabel>
              <Select
                value={field.arrayType || 'String'}
                label={copy.arrayType}
                onChange={(e) => {
                  const nextArrayType = e.target.value;
                  onUpdate({
                    arrayType: nextArrayType,
                    nestedFields: nextArrayType === 'Document' ? field.nestedFields || [] : [],
                    arrayRef: nextArrayType === 'ObjectId' ? field.arrayRef || '' : undefined
                  });
                }}
              >
                {NON_ARRAY_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>
                    {getMongoTypeOptionLabel(type)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {field.type === 'ObjectId' && !isIdField && (
            <FormControl size="small" className="w-40">
              <InputLabel>{copy.reference}</InputLabel>
              <Select value={field.ref || ''} label={copy.reference} onChange={(e) => onUpdate({ ref: e.target.value })}>
                <MenuItem value="">{copy.none}</MenuItem>
                {models.map((model) => (
                  <MenuItem key={model.id} value={model.name}>
                    {model.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {isArrayField && field.arrayType === 'ObjectId' && (
            <FormControl size="small" className="w-40">
              <InputLabel>{copy.arrayRef}</InputLabel>
              <Select value={field.arrayRef || ''} label={copy.arrayRef} onChange={(e) => onUpdate({ arrayRef: e.target.value })}>
                <MenuItem value="">{copy.none}</MenuItem>
                {models.map((model) => (
                  <MenuItem key={model.id} value={model.name}>
                    {model.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <div className="flex min-h-[40px] items-center gap-1 rounded border border-border bg-background px-3 py-1 text-foreground">
            <FormControlLabel
              className="mr-0"
              control={
                <Checkbox
                  checked={isArrayField}
                  onChange={(e) => handleArrayToggle(e.target.checked)}
                  disabled={isIdField}
                  size="small"
                />
              }
              label="ARR"
            />
          </div>

          <div className="flex min-h-[40px] items-center gap-1 rounded border border-border bg-background px-3 py-1 text-foreground">
            <FormControlLabel
              className="mr-0"
              control={
                <Checkbox
                  checked={field.required}
                  onChange={(e) => onUpdate({ required: e.target.checked })}
                  disabled={isIdField}
                  size="small"
                />
              }
              label="NN"
            />
          </div>

          <div className="flex min-h-[40px] items-center gap-1 rounded border border-border bg-background px-3 py-1 text-foreground">
            <FormControlLabel
              className="mr-0"
              control={
                <Checkbox
                  checked={Boolean(field.nullable)}
                  onChange={(e) => onUpdate({ nullable: e.target.checked })}
                  disabled={isIdField || field.type === 'Null'}
                  size="small"
                />
              }
              label="Null"
            />
          </div>
          <div className="flex min-h-[40px] items-center gap-1 rounded border border-border bg-background px-3 py-1 text-foreground">
            <FormControlLabel
              className="mr-0"
              control={
                <Checkbox
                  checked={hasEnum}
                  onChange={(e) => onUpdate({ enum: e.target.checked ? (field.enum && field.enum.length ? field.enum : ['']) : undefined })}
                  disabled={!canUseEnum || isIdField}
                  size="small"
                />
              }
              label={copy.enum}
            />
          </div>
          {hasEnum && canUseEnum && (
            <TextField
              size="small"
              className="w-56"
              label={copy.enumValues}
              value={(field.enum || []).join(', ')}
              onChange={(e) =>
                onUpdate({
                  enum: e.target.value.split(',').map((item) => item.trim())
                })
              }
              sx={{
                ...DEFAULT_FIELD_SX,
                '& .MuiInputBase-input': {
                  color: '#ffffff',
                  WebkitTextFillColor: '#ffffff'
                },
                '& .MuiInputLabel-root': {
                  color: 'rgba(255,255,255,0.86)'
                }
              }}
            />
          )}

          {canAddNested && (
            <IconButton onClick={() => handleAddNestedFieldInternal(field)} color="primary" size="small" title={copy.addNestedField}>
              <Plus className="h-4 w-4" />
            </IconButton>
          )}

          {!isIdField && (
            <IconButton onClick={onDelete} color="error" size="small">
              <Trash2 className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </div>

      {nestedFieldsContent}
    </div>
  );
}

const compactLabelSx = {
  color: 'rgba(226,232,240,0.76)',
  '&.Mui-focused': {
    color: '#e2e8f0'
  }
};

const compactActionSx = {
  color: '#e2e8f0',
  border: '1px solid rgba(148,163,184,0.16)',
  backgroundColor: 'rgba(255,255,255,0.05)',
  padding: '5px',
  '&:hover': {
    backgroundColor: 'rgba(255,255,255,0.12)'
  },
  '&.Mui-disabled': {
    color: 'rgba(148,163,184,0.38)',
    borderColor: 'rgba(148,163,184,0.08)'
  }
};

const compactDeleteSx = {
  color: '#fecaca',
  border: '1px solid rgba(248,113,113,0.24)',
  backgroundColor: 'rgba(127,29,29,0.18)',
  padding: '5px',
  '&:hover': {
    backgroundColor: 'rgba(127,29,29,0.3)'
  }
};

const compactDeleteTableSx = {
  color: '#fda4af',
  border: '1px solid rgba(244,63,94,0.28)',
  backgroundColor: 'rgba(136,19,55,0.22)',
  padding: '5px',
  '&:hover': {
    backgroundColor: 'rgba(136,19,55,0.38)'
  }
};


