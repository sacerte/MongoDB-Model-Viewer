import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Chip, FormControl, FormControlLabel, IconButton, InputLabel, Menu, MenuItem, Select, Tab, Tabs, TextField } from '@mui/material';
import { ClipboardPaste, Copy, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Database, GripVertical, Network, Plus, Trash2 } from 'lucide-react';
import DiagramViewer from './DiagramViewer';
import FieldEditor from './FieldEditor';
import { Field, Index, Model } from './MongoModelBuilder';
import { DiagramModelPosition, DiagramSheet, PhotoSheetConfig, Relation } from '../utils/projectBundle';
import {
  appendFieldKeepingMetadataLast,
  buildDefaultCollectionFields,
  isMetadataField
} from '../utils/defaultCollectionFields';
import { flattenModelFields } from '../utils/dataDictionary';
import { getMongoTypeOptionLabel } from '../utils/mongoTypeLabels';
import { buildPhotoCollectionId } from '../utils/photoCollections';
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

type InspectorTab = 'collection' | 'relations';

interface QuickFieldDraft {
  name: string;
  type: string;
  isArray: boolean;
  required: boolean;
  nullable: boolean;
  enumEnabled: boolean;
  arrayType: string;
  ref: string;
  arrayRef: string;
  bsonTypes: string[];
}

interface RelationDraft {
  fromModelId: string;
  fromFieldPath: string;
  toModelId: string;
  toFieldPath: string;
  label: string;
  type: Relation['type'];
}

export interface CopiedAttributesDraft {
  count: number;
  fields: Field[];
  sourceModelId: string;
  sourceModelName: string;
}

export interface CopiedCollectionDraft {
  model: Model;
  sourceModelId: string;
  sourceModelName: string;
}

interface DiagramContextMenuState {
  mouseX: number;
  mouseY: number;
  modelId: string | null;
  fieldPath: string | null;
}

interface DiagramSearchMatch {
  modelId: string;
  fieldPath: string;
  fieldName: string;
}


interface Props {
  models: Model[];
  relations: Relation[];
  diagramSheets: DiagramSheet[];
  activeDiagramSheetId: string;
  projectName: string;
  photoSheetConfig?: PhotoSheetConfig;
  onAddModel: (model: Model) => void;
  onUpdateModel: (model: Model) => void;
  onDeleteModel: (id: string) => void;
  onAddPhotoCollection: (sourceModelId: string) => void;
  onRemovePhotoCollection: (sourceModelId: string) => void;
  onUpdateRelations: (relations: Relation[]) => void;
  onUpdateDiagramSheets: (diagramSheets: DiagramSheet[]) => void;
  onChangeActiveDiagramSheetId: (diagramSheetId: string) => void;
  canUndo?: boolean;
  onUndo?: () => void;
  onExportPdfReady?: (exporter: ((format: 'pdf' | 'png') => Promise<{ base64: string; fileName: string }> | null) | null) => void;
  copiedAttributes: CopiedAttributesDraft | null;
  onCopiedAttributesChange: (nextValue: CopiedAttributesDraft | null) => void;
  copiedCollection: CopiedCollectionDraft | null;
  onCopiedCollectionChange: (nextValue: CopiedCollectionDraft | null) => void;
}

const RELATION_LABELS: Record<Relation['type'], string> = {
  'one-to-one': '1:1',
  'one-to-many': '1:N',
  'many-to-one': 'N:1',
  'many-to-many': 'N:N'
};

const INPUT_SX = {
  '& .MuiInputLabel-root': {
    color: 'rgba(226,232,240,0.82)',
    fontSize: '0.8rem'
  },
  '& .MuiInputLabel-root.Mui-focused': {
    color: '#f8fafc'
  },
  '& .MuiOutlinedInput-root': {
    color: '#f8fafc',
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    borderRadius: '10px',
    minHeight: 34,
    fontSize: '0.86rem',
    '& fieldset': {
      borderColor: 'rgba(148, 163, 184, 0.24)'
    },
    '&:hover fieldset': {
      borderColor: 'rgba(148, 163, 184, 0.4)'
    },
    '&.Mui-focused fieldset': {
      borderColor: '#22d3ee'
    },
    '&.Mui-disabled': {
      backgroundColor: 'rgba(15, 23, 42, 0.2)'
    }
  },
  '& .MuiInputBase-input': {
    color: '#f8fafc',
    WebkitTextFillColor: '#f8fafc',
    paddingTop: '8px',
    paddingBottom: '8px'
  },
  '& .MuiSelect-select': {
    color: '#f8fafc',
    WebkitTextFillColor: '#f8fafc',
    paddingTop: '8px',
    paddingBottom: '8px'
  },
  '& .MuiSvgIcon-root': {
    color: '#e2e8f0'
  }
};

const DARK_CHECKBOX_SX = {
  color: '#f8fafc',
  '&.Mui-checked': {
    color: '#f8fafc'
  },
  '&.Mui-disabled': {
    color: 'rgba(248,250,252,0.48)'
  }
};

const DARK_BUTTON_SX = {
  color: '#f8fafc',
  textTransform: 'none',
  borderRadius: '10px',
  fontSize: '0.8rem',
  fontWeight: 600,
  minHeight: 32,
  '& .MuiButton-startIcon, & .MuiButton-endIcon': {
    color: '#f8fafc'
  },
  '&.MuiButton-contained': {
    color: '#f8fafc',
    backgroundColor: '#2563eb',
    '&:hover': {
      backgroundColor: '#1d4ed8'
    },
    '&.Mui-disabled': {
      backgroundColor: 'rgba(37,99,235,0.45)',
      color: 'rgba(248,250,252,0.7)'
    }
  },
  '&.MuiButton-outlined': {
    color: '#f8fafc',
    borderColor: 'rgba(148,163,184,0.28)',
    '&:hover': {
      borderColor: '#38bdf8',
      backgroundColor: 'rgba(56,189,248,0.08)'
    }
  },
  '&.MuiButton-text': {
    color: '#f8fafc',
    '&:hover': {
      backgroundColor: 'rgba(255,255,255,0.06)'
    }
  },
  '&.Mui-disabled': {
    color: 'rgba(248,250,252,0.55)',
    borderColor: 'rgba(148,163,184,0.18)'
  }
};

const DARK_CHIP_SX = {
  color: '#f8fafc',
  borderColor: 'rgba(148,163,184,0.22)',
  backgroundColor: 'rgba(15,23,42,0.26)',
  '& .MuiChip-icon': {
    color: '#f8fafc'
  },
  '& .MuiChip-label': {
    color: '#f8fafc'
  }
};

const DARK_FORM_CONTROL_LABEL_SX = {
  '& .MuiFormControlLabel-label': {
    color: '#f8fafc'
  }
};

const PANEL_ICON_BUTTON_SX = {
  color: '#e2e8f0',
  border: '1px solid rgba(148,163,184,0.18)',
  backgroundColor: 'rgba(15,23,42,0.18)',
  '&:hover': {
    backgroundColor: 'rgba(15,23,42,0.32)'
  }
};

const PANEL_ACTION_ICON_SX = {
  color: '#e2e8f0',
  border: '1px solid rgba(148,163,184,0.18)',
  backgroundColor: 'rgba(15,23,42,0.18)',
  padding: '5px',
  '&:hover': {
    backgroundColor: 'rgba(15,23,42,0.32)',
    borderColor: 'rgba(56,189,248,0.5)'
  },
  '&.Mui-disabled': {
    color: 'rgba(148,163,184,0.38)',
    borderColor: 'rgba(148,163,184,0.1)'
  }
};

const PANEL_DELETE_ICON_SX = {
  color: '#fda4af',
  border: '1px solid rgba(244,63,94,0.28)',
  backgroundColor: 'rgba(136,19,55,0.22)',
  padding: '5px',
  '&:hover': {
    backgroundColor: 'rgba(136,19,55,0.38)',
    borderColor: 'rgba(251,113,133,0.55)'
  }
};

const DEFAULT_RELATION_DRAFT: RelationDraft = {
  fromModelId: '',
  fromFieldPath: '',
  toModelId: '',
  toFieldPath: '',
  label: '',
  type: 'one-to-many'
};

const LEFT_SIDEBAR_WIDTH = 290;
const DEFAULT_INSPECTOR_WIDTH = 680;
const MIN_INSPECTOR_WIDTH = 680;
const MAX_INSPECTOR_WIDTH = 860;
const MIN_DIAGRAM_WIDTH = 420;
const INSPECTOR_RESIZE_GUTTER = 12;

function buildDefaultQuickFieldDraft(): QuickFieldDraft {
  return {
    name: '',
    type: 'String',
    isArray: false,
    required: false,
    nullable: false,
    enumEnabled: false,
    arrayType: 'String',
    ref: '',
    arrayRef: '',
    bsonTypes: []
  };
}

export default function DiagramStudio({
  models,
  relations,
  diagramSheets,
  activeDiagramSheetId,
  projectName,
  photoSheetConfig,
  onAddModel,
  onUpdateModel,
  onDeleteModel,
  onAddPhotoCollection,
  onRemovePhotoCollection,
  onUpdateRelations,
  onUpdateDiagramSheets,
  onChangeActiveDiagramSheetId,
  canUndo = false,
  onUndo,
  onExportPdfReady,
  copiedAttributes,
  onCopiedAttributesChange,
  copiedCollection,
  onCopiedCollectionChange
}: Props) {
  const { language } = useAppLanguage();
  const copy =
    language === 'es'
      ? {
          diagramPrefix: 'Diagrama',
          diagramNamePrompt: 'Nombre del diagrama',
          selectBothCollections: 'Selecciona las dos colecciones para crear la relación.',
          selectBothFields: 'Selecciona los dos campos de la relación.',
          differentEndpoints: 'Elige dos extremos distintos para la relación.',
          project: 'Proyecto',
          collections: 'Colecciones',
          createCollection: 'Crear colección',
          firstCollection: 'Crea tu primera colección para empezar a construir desde el espacio de diagrama.',
          emptySheet: 'Esta hoja aún no tiene colecciones. Crea una nueva o usa los detalles de la colección seleccionada para añadirla a',
          thisDiagram: 'este diagrama',
          fields: (count: number) => `${count} campo${count === 1 ? '' : 's'}`,
          onThisDiagram: 'En este diagrama',
          noCollectionsSheet: (name: string) =>
            `Todavía no hay colecciones en "${name}". Crea una nueva o añade la seleccionada a este diagrama desde Detalles de la colección.`,
          noDiagrams: 'Todavía no hay diagramas disponibles.',
          newSheet: 'Nueva hoja',
          rename: 'Renombrar',
          delete: 'Eliminar',
          deleteDiagramConfirm: (name: string, count: number) =>
            `Se eliminará el diagrama "${name}" y también ${count} colección${count === 1 ? '' : 'es'} de ese diagrama. ¿Quieres continuar?`,
          showProjectPanel: 'Mostrar panel del proyecto',
          showPanel: 'Mostrar panel',
          collectionDetails: 'Detalles de la colección',
          relations: 'Relaciones',
          collection: 'Colección',
          name: 'Nombre',
          indexes: 'Índices',
          quickAddHelp: 'El constructor rápido de abajo está pensado para trabajar directamente desde el diagrama. Los campos anidados y las referencias avanzadas siguen siendo editables en el editor completo.',
          currentDiagram: 'Diagrama actual',
          visibleInDiagram: 'Esta colección está visible ahora mismo en la hoja activa.',
          hiddenInDiagram: 'Esta colección todavía no se muestra en la hoja activa.',
          removeFromDiagram: 'Quitar de este diagrama',
          addToDiagram: 'Añadir a este diagrama',
          photos: 'Fotos',
          photoCollection: 'Colección de fotos',
          photoBelongsTo: 'Esta colección pertenece a',
          sourceCollection: 'su colección de origen',
          livesInFotos: 'y vive en la hoja Fotos.',
          openSourceCollection: 'Abrir colección origen',
          noPhotoCollectionYet: 'Todavía no hay colección de fotos',
          linkedPhotosExists: 'Esta colección ya tiene una colección _photo vinculada. Su original_doc se mantiene sincronizado con los campos de la colección principal.',
          createLinkedPhotos: 'Crea una colección _photo vinculada para esta colección existente y colócala en la hoja Fotos.',
          removePhotoCollection: 'Quitar colección de fotos',
          addPhotoCollection: 'Añadir colección de fotos',
          openPhotoCollection: 'Abrir colección de fotos',
          attributeTransfer: 'Transferencia de atributos',
          transferOpen: 'Copia atributos seleccionados de una colección y pégalos en otra.',
          copiedFrom: (count: number, source: string) => `${count} copiados desde ${source}.`,
          transferHidden: 'Oculto por defecto. Ábrelo cuando necesites copiar atributos.',
          idMetadataCopy: '`_id` y `metadata` también se pueden copiar. Al pegar en la raíz de la colección se sustituyen los campos del sistema existentes.',
          pasteInto: 'Pegar en',
          collectionRoot: 'Raíz de la colección',
          document: 'Documento',
          pasteHint: 'Elige Raíz de la colección para pegarlos como campos de primer nivel, o selecciona un destino Documento para insertarlos dentro.',
          selectAttributes: 'Seleccionar atributos',
          selectAll: 'Seleccionar todo',
          clear: 'Limpiar',
          noAttributes: 'No hay atributos disponibles para copiar.',
          selectedCount: (selected: number, total: number) => `${selected} de ${total} seleccionados.`,
          copyAttributes: 'Copiar atributos',
          pasteAttributes: 'Pegar atributos',
          noCopiedAttributes: 'Todavía no hay atributos copiados.',
          quickAddField: 'Añadir campo rápido',
          fieldName: 'Nombre del campo',
          datatype: 'Tipo de dato',
          arrayType: 'Tipo del array',
          chooseArrayHint: 'Elige Array para configurar el tipo de sus elementos.',
          reference: 'Referencia',
          arrayRef: 'Ref. array',
          none: 'Ninguna',
          addField: 'Añadir campo',
          fieldsLegend: 'Campos',
          fieldsInCollection: (count: number) => `${count} campo${count === 1 ? '' : 's'} en esta colección.`,
          arrLegend: 'ARR = array',
          idLegend: 'ID = clave primaria',
          nnLegend: 'NN = obligatorio',
          nullLegend: 'Null = nullable',
          selectCollectionLeft: 'Selecciona una colección del panel izquierdo para configurar aquí sus campos.',
          createRelation: 'Crear relación',
          createRelationHelp: 'Conecta exactamente los campos que quieras para que la línea quede anclada a esos atributos en el diagrama.',
          fromCollection: 'Colección origen',
          fromField: 'Campo origen',
          toCollection: 'Colección destino',
          toField: 'Campo destino',
          relationType: 'Tipo de relación',
          label: 'Etiqueta',
          addRelation: 'Añadir relación',
          savedRelations: 'Relaciones guardadas',
          noManualRelations: 'Todavía no hay relaciones manuales.',
          workspaceRelations: (count: number) => `${count} relación${count === 1 ? '' : 'es'} manual${count === 1 ? '' : 'es'} en este espacio.`,
          unknown: 'Desconocido',
          fieldFallback: '(campo)',
          hideProjectPanel: 'Ocultar panel del proyecto',
          hideInspectorPanel: 'Ocultar panel del inspector',
          copySelection: 'Copiar',
          copyCollection: 'Copiar colección',
          pasteSelection: 'Pegar',
          pasteCollection: 'Pegar colección',
          deleteSelection: 'Eliminar',
          copiedCollections: (count: number) => `${count} atributo${count === 1 ? '' : 's'} copiado${count === 1 ? '' : 's'}`,
          noDiagramSelectedModels: 'Selecciona un atributo del diagrama para copiarlo.',
          selectedAttributesSummary: 'Atributos seleccionados',
          selectedInGroup: (count: number, group: string) => `${count} en ${group}`
        }
      : {
          diagramPrefix: 'Diagram',
          diagramNamePrompt: 'Diagram name',
          selectBothCollections: 'Select both collections to create a relation.',
          selectBothFields: 'Select both fields for the relation.',
          differentEndpoints: 'Choose two different relation endpoints.',
          project: 'Project',
          collections: 'Collections',
          createCollection: 'Create Collection',
          firstCollection: 'Create your first collection to start building from the diagram workspace.',
          emptySheet: 'This sheet has no collections yet. Create a new one or use the selected collection details to add it to',
          thisDiagram: 'this diagram',
          fields: (count: number) => `${count} field${count === 1 ? '' : 's'}`,
          onThisDiagram: 'On this diagram',
          noCollectionsSheet: (name: string) =>
            `No collections in "${name}" yet. Create a new collection or add the selected one to this diagram from Collection Details.`,
          noDiagrams: 'No diagrams available yet.',
          newSheet: 'New sheet',
          rename: 'Rename',
          delete: 'Delete',
          deleteDiagramConfirm: (name: string, count: number) =>
            `This will delete the "${name}" diagram and also ${count} collection${count === 1 ? '' : 's'} from this diagram. Continue?`,
          showProjectPanel: 'Show project panel',
          showPanel: 'Show panel',
          collectionDetails: 'Collection Details',
          relations: 'Relations',
          collection: 'Collection',
          name: 'Name',
          indexes: 'Indexes',
          quickAddHelp: 'The quick-add builder below is tuned for working directly from the diagram. Nested fields and advanced references remain editable in the full field editor.',
          currentDiagram: 'Current Diagram',
          visibleInDiagram: 'This collection is currently visible in the active diagram sheet.',
          hiddenInDiagram: 'This collection is not shown in the active diagram sheet yet.',
          removeFromDiagram: 'Remove from this diagram',
          addToDiagram: 'Add to this diagram',
          photos: 'Photos',
          photoCollection: 'Photo collection',
          photoBelongsTo: 'This collection belongs to',
          sourceCollection: 'its source collection',
          livesInFotos: 'and lives in the Fotos sheet.',
          openSourceCollection: 'Open source collection',
          noPhotoCollectionYet: 'No photo collection yet',
          linkedPhotosExists: 'This collection already has a linked _photo collection. Its original_doc stays synced with the main collection fields.',
          createLinkedPhotos: 'Create a linked _photo collection for this existing collection and place it on the Fotos sheet.',
          removePhotoCollection: 'Remove photo collection',
          addPhotoCollection: 'Add photo collection',
          openPhotoCollection: 'Open photo collection',
          attributeTransfer: 'Attribute Transfer',
          transferOpen: 'Copy selected attributes from one collection and paste them into another.',
          copiedFrom: (count: number, source: string) => `${count} copied from ${source}.`,
          transferHidden: 'Hidden by default. Open when you need to copy attributes.',
          idMetadataCopy: '`_id` and `metadata` can also be copied. Pasting to the collection root replaces the existing system fields.',
          pasteInto: 'Paste into',
          collectionRoot: 'Collection root',
          document: 'Document',
          pasteHint: 'Choose Collection root to paste as top-level fields, or pick a Document target to insert them inside it.',
          selectAttributes: 'Select attributes',
          selectAll: 'Select all',
          clear: 'Clear',
          noAttributes: 'No attributes available to copy.',
          selectedCount: (selected: number, total: number) => `${selected} of ${total} selected.`,
          copyAttributes: 'Copy attributes',
          pasteAttributes: 'Paste attributes',
          noCopiedAttributes: 'No copied attributes yet.',
          quickAddField: 'Quick Add Field',
          fieldName: 'Field name',
          datatype: 'Datatype',
          arrayType: 'Array type',
          chooseArrayHint: 'Choose Array to configure its item type.',
          reference: 'Reference',
          arrayRef: 'Array ref',
          none: 'None',
          addField: 'Add field',
          fieldsLegend: 'Fields',
          fieldsInCollection: (count: number) => `${count} field${count === 1 ? '' : 's'} in this collection.`,
          arrLegend: 'ARR = array',
          idLegend: 'ID = primary key',
          nnLegend: 'NN = required',
          nullLegend: 'Null = nullable',
          selectCollectionLeft: 'Select a collection from the left panel to configure its fields here.',
          createRelation: 'Create Relation',
          createRelationHelp: 'Connect the exact fields you want so the line stays anchored to those attributes in the diagram.',
          fromCollection: 'From collection',
          fromField: 'From field',
          toCollection: 'To collection',
          toField: 'To field',
          relationType: 'Relation type',
          label: 'Label',
          addRelation: 'Add relation',
          savedRelations: 'Saved Relations',
          noManualRelations: 'No manual relations yet.',
          workspaceRelations: (count: number) => `${count} manual relation${count === 1 ? '' : 's'} in this workspace.`,
          unknown: 'Unknown',
          fieldFallback: '(field)',
          hideProjectPanel: 'Hide project panel',
          hideInspectorPanel: 'Hide inspector panel',
          copySelection: 'Copy',
          copyCollection: 'Copy collection',
          pasteSelection: 'Paste',
          pasteCollection: 'Paste collection',
          deleteSelection: 'Delete',
          copiedCollections: (count: number) => `${count} attribute${count === 1 ? '' : 's'} copied`,
          noDiagramSelectedModels: 'Select a diagram attribute to copy it.',
          selectedAttributesSummary: 'Selected attributes',
          selectedInGroup: (count: number, group: string) => `${count} in ${group}`
        };

  const studioShellRef = useRef<HTMLDivElement>(null);
  const inspectorResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('collection');
  const [quickFieldDraft, setQuickFieldDraft] = useState<QuickFieldDraft>(buildDefaultQuickFieldDraft());
  const [relationDraft, setRelationDraft] = useState<RelationDraft>(DEFAULT_RELATION_DRAFT);
  const [inspectorWidth, setInspectorWidth] = useState(DEFAULT_INSPECTOR_WIDTH);
  const [isCollectionsPanelVisible, setIsCollectionsPanelVisible] = useState(true);
  const [isInspectorVisible, setIsInspectorVisible] = useState(true);
  const [isInspectorResizing, setIsInspectorResizing] = useState(false);
  const [attributeSearch, setAttributeSearch] = useState('');
  const [diagramFieldSearch, setDiagramFieldSearch] = useState('');
  const [selectedFieldPath, setSelectedFieldPath] = useState('');
  const [selectedFieldPaths, setSelectedFieldPaths] = useState<string[]>([]);
  const [editingDiagramSheetId, setEditingDiagramSheetId] = useState<string | null>(null);
  const [diagramSheetNameDraft, setDiagramSheetNameDraft] = useState('');
  const [collectionNameDraft, setCollectionNameDraft] = useState('');
  const [moveToSheetId, setMoveToSheetId] = useState('');
  const [diagramContextMenu, setDiagramContextMenu] = useState<DiagramContextMenuState | null>(null);
  const [activeDiagramSearchIndex, setActiveDiagramSearchIndex] = useState(0);
  const activeDiagramSheet = useMemo(
    () => diagramSheets.find((sheet) => sheet.id === activeDiagramSheetId) || diagramSheets[0] || null,
    [diagramSheets, activeDiagramSheetId]
  );
  const activeDiagramModelPositions = activeDiagramSheet?.modelPositions || {};
  const visibleModelIds = activeDiagramSheet?.modelIds || [];
  const visibleModelIdSet = useMemo(() => new Set(visibleModelIds), [visibleModelIds]);
  const visibleModels = useMemo(
    () => models.filter((model) => visibleModelIdSet.has(model.id)),
    [models, visibleModelIdSet]
  );
  const visibleRelations = useMemo(
    () => {
      const directVisibleRelations = relations.filter(
        (relation) => visibleModelIdSet.has(relation.fromModelId) && visibleModelIdSet.has(relation.toModelId)
      );

      if (!photoSheetConfig?.enabled || activeDiagramSheetId !== photoSheetConfig.photosSheetId) {
        return directVisibleRelations;
      }

      const derivedPhotoRelations = buildDerivedPhotoRelations(relations, models, visibleModelIdSet);
      const directRelationKeys = new Set(directVisibleRelations.map(buildRelationIdentityKey));

      return [
        ...directVisibleRelations,
        ...derivedPhotoRelations.filter((relation) => !directRelationKeys.has(buildRelationIdentityKey(relation)))
      ];
    },
    [activeDiagramSheetId, models, photoSheetConfig, relations, visibleModelIdSet]
  );
  const diagramSearchMatches = useMemo<DiagramSearchMatch[]>(() => {
    const normalizedQuery = diagramFieldSearch.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return visibleModels.flatMap((model) =>
      flattenModelFields(model)
        .filter((field) => {
          const normalizedPath = (field.path || '').toLowerCase();
          const normalizedName = (field.field || '').toLowerCase();
          if (!normalizedPath && !normalizedName) {
            return false;
          }
          return normalizedPath.includes(normalizedQuery) || normalizedName.includes(normalizedQuery);
        })
        .map((field) => ({
          modelId: model.id,
          fieldPath: field.path || '',
          fieldName: field.field || ''
        }))
        .filter((field) => Boolean(field.fieldPath))
    );
  }, [diagramFieldSearch, visibleModels]);
  const activeDiagramSearchMatch =
    diagramSearchMatches.length > 0
      ? {
          ...diagramSearchMatches[((activeDiagramSearchIndex % diagramSearchMatches.length) + diagramSearchMatches.length) % diagramSearchMatches.length],
          sequence: activeDiagramSearchIndex
        }
      : null;
  const isSelectedModelInActiveDiagram = selectedModelId ? visibleModelIdSet.has(selectedModelId) : false;

  useEffect(() => {
    if (models.length === 0) {
      setSelectedModelId('');
      setSelectedModelIds([]);
      return;
    }

    if (selectedModelId && !models.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(models[0].id);
    }
  }, [models, selectedModelId]);

  useEffect(() => {
    setSelectedModelIds((currentIds) => {
      const nextIds = currentIds.filter((modelId) => models.some((model) => model.id === modelId));
      if (selectedModelId && !nextIds.includes(selectedModelId) && models.some((model) => model.id === selectedModelId)) {
        nextIds.push(selectedModelId);
      }
      return nextIds;
    });
  }, [models, selectedModelId]);

  useEffect(() => {
    setSelectedModelIds((currentIds) => currentIds.filter((modelId) => visibleModelIdSet.has(modelId)));
  }, [activeDiagramSheetId, visibleModelIdSet]);

  useEffect(() => {
    setActiveDiagramSearchIndex(0);
  }, [diagramFieldSearch, activeDiagramSheetId]);

  useEffect(() => {
    if (diagramSearchMatches.length === 0) {
      setActiveDiagramSearchIndex(0);
      return;
    }

    setActiveDiagramSearchIndex((currentIndex) => {
      const normalizedIndex = ((currentIndex % diagramSearchMatches.length) + diagramSearchMatches.length) % diagramSearchMatches.length;
      return normalizedIndex;
    });
  }, [diagramSearchMatches.length]);

  useEffect(() => {
    if (!activeDiagramSheet && diagramSheets.length > 0) {
      onChangeActiveDiagramSheetId(diagramSheets[0].id);
    }
  }, [activeDiagramSheet, diagramSheets, onChangeActiveDiagramSheetId]);

  useEffect(() => {
    setRelationDraft((currentDraft) => {
      const firstModelId = models[0]?.id || '';
      const secondModelId = models[1]?.id || firstModelId;
      const fromModelId = models.some((model) => model.id === currentDraft.fromModelId)
        ? currentDraft.fromModelId
        : firstModelId;
      const toModelId = models.some((model) => model.id === currentDraft.toModelId)
        ? currentDraft.toModelId
        : secondModelId;
      const fromFields = getFieldOptions(fromModelId, models);
      const toFields = getFieldOptions(toModelId, models);
      const fromFieldPath = fromFields.some((field) => field.path === currentDraft.fromFieldPath)
        ? currentDraft.fromFieldPath
        : fromFields[0]?.path || '';
      const toFieldPath = toFields.some((field) => field.path === currentDraft.toFieldPath)
        ? currentDraft.toFieldPath
        : toFields[0]?.path || '';

      return {
        ...currentDraft,
        fromModelId,
        fromFieldPath,
        toModelId,
        toFieldPath
      };
    });
  }, [models]);

  useEffect(() => {
    const clampWidth = (width: number) => {
      const containerWidth = studioShellRef.current?.clientWidth || 0;
      const availableWidth = containerWidth - LEFT_SIDEBAR_WIDTH - MIN_DIAGRAM_WIDTH - INSPECTOR_RESIZE_GUTTER;
      const maxWidth = Math.min(MAX_INSPECTOR_WIDTH, Math.max(280, availableWidth));
      const minWidth = Math.min(MIN_INSPECTOR_WIDTH, maxWidth);
      return Math.min(maxWidth, Math.max(minWidth, width));
    };

    const syncWidth = () => {
      setInspectorWidth((currentWidth) => clampWidth(currentWidth));
    };

    syncWidth();
    window.addEventListener('resize', syncWidth);

    return () => window.removeEventListener('resize', syncWidth);
  }, []);

  useEffect(() => {
    if (!isInspectorResizing) {
      return;
    }

    const clampWidth = (width: number) => {
      const containerWidth = studioShellRef.current?.clientWidth || 0;
      const availableWidth = containerWidth - LEFT_SIDEBAR_WIDTH - MIN_DIAGRAM_WIDTH - INSPECTOR_RESIZE_GUTTER;
      const maxWidth = Math.min(MAX_INSPECTOR_WIDTH, Math.max(280, availableWidth));
      const minWidth = Math.min(MIN_INSPECTOR_WIDTH, maxWidth);
      return Math.min(maxWidth, Math.max(minWidth, width));
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!inspectorResizeRef.current) {
        return;
      }

      const delta = inspectorResizeRef.current.startX - event.clientX;
      setInspectorWidth(clampWidth(inspectorResizeRef.current.startWidth + delta));
    };

    const stopResizing = () => {
      inspectorResizeRef.current = null;
      setIsInspectorResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isInspectorResizing]);

  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) || null,
    [models, selectedModelId]
  );
  const selectedModelPhotoCollection = useMemo(() => {
    if (!selectedModel || selectedModel.photoSourceModelId) {
      return null;
    }

    return (
      models.find(
        (model) => model.photoSourceModelId === selectedModel.id || model.id === buildPhotoCollectionId(selectedModel.id)
      ) || null
    );
  }, [models, selectedModel]);
  const selectedModelPhotoSource = useMemo(() => {
    if (!selectedModel?.photoSourceModelId) {
      return null;
    }

    return models.find((model) => model.id === selectedModel.photoSourceModelId) || null;
  }, [models, selectedModel]);
  const canManageSelectedModelPhoto = Boolean(photoSheetConfig?.enabled && selectedModel && !selectedModel.photoSourceModelId);
  const filteredSelectedModelFields = useMemo(() => {
    if (!selectedModel) return [];
    if (selectedFieldPath) {
      const selectedPathNormalized = selectedFieldPath.replace(/\[\]/g, '');
      const selectedField = findFieldByPath(selectedModel.fields, selectedPathNormalized);
      if (selectedField) {
        return [{ field: cloneFieldTree(selectedField), index: -1 }];
      }
    }

    if (selectedFieldPaths.length > 0) {
      return buildSelectedEditorFieldEntries(selectedModel.fields, selectedFieldPaths);
    }

    const query = attributeSearch.trim().toLowerCase();
    if (!query) return selectedModel.fields.map((field, index) => ({ field, index }));
    return filterFieldTreeByQuery(selectedModel.fields, query);
  }, [attributeSearch, selectedFieldPath, selectedFieldPaths, selectedModel]);
  const selectedFieldGroups = useMemo(() => groupSelectedFieldPaths(selectedFieldPaths), [selectedFieldPaths]);
  const fromFieldOptions = getFieldOptions(relationDraft.fromModelId, models);
  const toFieldOptions = getFieldOptions(relationDraft.toModelId, models);

  useEffect(() => {
    setCollectionNameDraft(selectedModel?.name || '');
  }, [selectedModel?.id, selectedModel?.name]);

  useEffect(() => {
    setMoveToSheetId(activeDiagramSheet?.id || '');
  }, [activeDiagramSheet?.id, selectedModelId]);


  const handleInspectorResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    inspectorResizeRef.current = {
      startX: event.clientX,
      startWidth: inspectorWidth
    };
    setIsInspectorResizing(true);
    event.preventDefault();
  };

  const handleCreateCollection = () => {
    const trimmedName = newCollectionName.trim();
    if (!trimmedName) {
      return;
    }

    const uniqueId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const newModel: Model = {
      id: uniqueId,
      name: trimmedName,
      fields: buildDefaultCollectionFields(),
      indexes: []
    };

    onAddModel(newModel);
    setSelectedModelId(newModel.id);
    setSelectedModelIds([newModel.id]);
    setNewCollectionName('');
  };

  const handleCommitCollectionName = () => {
    if (!selectedModel) {
      return;
    }

    const trimmedName = collectionNameDraft.trim();
    if (!trimmedName) {
      setCollectionNameDraft(selectedModel.name);
      return;
    }

    if (trimmedName === selectedModel.name) {
      return;
    }

    onUpdateModel({
      ...selectedModel,
      name: trimmedName
    });
  };

  const handleAddQuickField = () => {
    if (!selectedModel) {
      return;
    }

    const trimmedName = quickFieldDraft.name.trim();
    if (!trimmedName) {
      return;
    }

    const nextField: Field = {
      name: trimmedName,
      type: quickFieldDraft.type,
      isArray: quickFieldDraft.isArray,
      required: quickFieldDraft.required,
      nullable: quickFieldDraft.nullable,
      bsonTypes: !quickFieldDraft.isArray && quickFieldDraft.type === 'Mixed' && quickFieldDraft.bsonTypes.length > 0
        ? quickFieldDraft.bsonTypes
        : undefined,
      enum: quickFieldDraft.enumEnabled || quickFieldDraft.type === 'Enum' ? [''] : undefined,
      description: '',
      nestedFields: []
    };

    if (quickFieldDraft.isArray) {
      const selectedItemType = quickFieldDraft.type === 'Array' ? quickFieldDraft.arrayType : quickFieldDraft.type;
      nextField.type = 'Array';
      nextField.arrayType = selectedItemType;
      nextField.nestedFields = selectedItemType === 'Document' ? [] : [];
      if (selectedItemType === 'Enum' && (!nextField.enum || nextField.enum.length === 0)) {
        nextField.enum = [''];
      }
      if (selectedItemType === 'ObjectId' && quickFieldDraft.arrayRef) {
        nextField.arrayRef = quickFieldDraft.arrayRef;
      }
    }

    if (quickFieldDraft.type === 'Document') {
      nextField.nestedFields = [];
    }

    if (quickFieldDraft.type === 'ObjectId' && quickFieldDraft.ref) {
      nextField.ref = quickFieldDraft.ref;
    }

    onUpdateModel({
      ...selectedModel,
      fields: appendFieldKeepingMetadataLast(selectedModel.fields, nextField)
    });
    setQuickFieldDraft(buildDefaultQuickFieldDraft());
  };

  const handleUpdateField = (fieldIndex: number, updates: Partial<Field>) => {
    if (!selectedModel) {
      return;
    }

    const nextFields = [...selectedModel.fields];
    const currentField = nextFields[fieldIndex];
    const { nestedFields, ...restUpdates } = updates;
    const shouldPreserveSiblings = Boolean(selectedFieldPath) && nestedFields !== undefined;
    const nextNestedFields =
      nestedFields === undefined
        ? currentField.nestedFields
        : shouldPreserveSiblings
          ? mergeNestedFieldsForSelectedPath(
              currentField.nestedFields || [],
              nestedFields || [],
              selectedFieldPath,
              currentField.name
            )
          : nestedFields;

    nextFields[fieldIndex] = {
      ...currentField,
      ...restUpdates,
      nestedFields: nextNestedFields
    };
    onUpdateModel({
      ...selectedModel,
      fields: nextFields
    });
  };

  const handleUpdateSelectedField = useCallback((updates: Partial<Field>) => {
    if (!selectedModel || !selectedFieldPath) {
      return;
    }

    const normalizedSelectedPath = selectedFieldPath.replace(/\[\]/g, '');
    const selectedField = findFieldByPath(selectedModel.fields, normalizedSelectedPath);
    if (!selectedField) {
      return;
    }

    onUpdateModel({
      ...selectedModel,
      fields: replaceFieldAtPath(selectedModel.fields, normalizedSelectedPath, {
        ...selectedField,
        ...updates
      })
    });
  }, [onUpdateModel, selectedFieldPath, selectedModel]);

  const handleRenameSelectedPaths = useCallback((previousPath: string, nextPath: string) => {
    const normalizePathToken = (path: string) => path.replace(/\[\]/g, '');
    const normalizedPreviousPath = normalizePathToken(previousPath);
    const normalizedNextPath = normalizePathToken(nextPath);

    if (!normalizedPreviousPath || normalizedPreviousPath === normalizedNextPath) {
      return;
    }

    setSelectedFieldPath((currentPath) =>
      renamePathPreservingSelection(currentPath, normalizedPreviousPath, normalizedNextPath)
    );
    setSelectedFieldPaths((currentPaths) =>
      currentPaths.map((path) => renamePathPreservingSelection(path, normalizedPreviousPath, normalizedNextPath))
    );
  }, []);

  const handleDeleteField = (fieldIndex: number) => {
    if (!selectedModel || fieldIndex === 0) {
      return;
    }

    const nextFields = selectedModel.fields.filter((_, index) => index !== fieldIndex);
    onUpdateModel({
      ...selectedModel,
      fields: nextFields
    });

    const nextSelectableIndex = Math.min(fieldIndex, nextFields.length - 1);
    const nextField = nextFields[nextSelectableIndex];
    const nextPath = nextField?.name || '';
    setSelectedFieldPath(nextPath);
    setAttributeSearch(nextPath);
  };

  const handleDeleteSelectedField = useCallback(() => {
    if (!selectedModel || !selectedFieldPath) {
      return;
    }

    const normalizedSelectedPath = selectedFieldPath.replace(/\[\]/g, '');
    onUpdateModel({
      ...selectedModel,
      fields: removeFieldAtPath(selectedModel.fields, normalizedSelectedPath)
    });
    setSelectedFieldPath('');
    setSelectedFieldPaths([]);
    setAttributeSearch('');
  }, [onUpdateModel, selectedFieldPath, selectedModel]);

  const handleMoveField = (fieldIndex: number, direction: 'up' | 'down') => {
    if (!selectedModel || fieldIndex === 0) {
      return;
    }

    if (isMetadataField(selectedModel.fields[fieldIndex])) {
      return;
    }

    const targetIndex = direction === 'up' ? fieldIndex - 1 : fieldIndex + 1;
    if (targetIndex <= 0 || targetIndex >= selectedModel.fields.length) {
      return;
    }

    if (isMetadataField(selectedModel.fields[targetIndex])) {
      return;
    }

    const nextFields = [...selectedModel.fields];
    const [movedField] = nextFields.splice(fieldIndex, 1);
    nextFields.splice(targetIndex, 0, movedField);

    onUpdateModel({
      ...selectedModel,
      fields: nextFields
    });
  };

  const handleDeleteSelectedCollection = () => {
    if (!selectedModel) {
      return;
    }

    onDeleteModel(selectedModel.id);
  };

  const handleAddSelectedModelPhotoCollection = () => {
    if (!selectedModel || selectedModel.photoSourceModelId) {
      return;
    }

    onAddPhotoCollection(selectedModel.id);
  };

  const handleRemoveSelectedModelPhotoCollection = () => {
    if (!selectedModel || selectedModel.photoSourceModelId) {
      return;
    }

    onRemovePhotoCollection(selectedModel.id);
  };

  const handleCreateDiagramSheet = () => {
    const nextSheetNumber = diagramSheets.length + 1;
    const newSheet: DiagramSheet = {
      id: `diagram-sheet-${Date.now()}`,
      name: `${copy.diagramPrefix} ${nextSheetNumber}`,
      modelIds: []
    };

    onUpdateDiagramSheets([...diagramSheets, newSheet]);
    onChangeActiveDiagramSheetId(newSheet.id);
  };

  const handleRenameDiagramSheet = (sheetId?: string) => {
    const targetSheet = sheetId ? diagramSheets.find((sheet) => sheet.id === sheetId) : activeDiagramSheet;
    if (!targetSheet) {
      return;
    }

    onChangeActiveDiagramSheetId(targetSheet.id);
    setEditingDiagramSheetId(targetSheet.id);
    setDiagramSheetNameDraft(targetSheet.name);
  };

  const handleCommitDiagramSheetRename = useCallback(() => {
    if (!editingDiagramSheetId) {
      return;
    }

    const trimmedName = diagramSheetNameDraft.trim();
    const targetSheet = diagramSheets.find((sheet) => sheet.id === editingDiagramSheetId);
    setEditingDiagramSheetId(null);

    if (!trimmedName || !targetSheet || trimmedName === targetSheet.name) {
      setDiagramSheetNameDraft('');
      return;
    }

    onUpdateDiagramSheets(
      diagramSheets.map((sheet) =>
        sheet.id === editingDiagramSheetId
          ? {
              ...sheet,
              name: trimmedName
            }
          : sheet
      )
    );
    setDiagramSheetNameDraft('');
  }, [diagramSheetNameDraft, diagramSheets, editingDiagramSheetId, onUpdateDiagramSheets]);

  const handleCancelDiagramSheetRename = useCallback(() => {
    setEditingDiagramSheetId(null);
    setDiagramSheetNameDraft('');
  }, []);

  useEffect(() => {
    if (!editingDiagramSheetId) {
      return;
    }

    const targetSheet = diagramSheets.find((sheet) => sheet.id === editingDiagramSheetId);
    if (!targetSheet) {
      handleCancelDiagramSheetRename();
    }
  }, [diagramSheets, editingDiagramSheetId, handleCancelDiagramSheetRename]);

  useEffect(() => {
    if (!editingDiagramSheetId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleCommitDiagramSheetRename();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancelDiagramSheetRename();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingDiagramSheetId, handleCancelDiagramSheetRename, handleCommitDiagramSheetRename]);

  const handleDeleteActiveDiagramSheet = () => {
    if (!activeDiagramSheet || diagramSheets.length <= 1) {
      return;
    }

    const modelIdsToDelete = Array.from(new Set(activeDiagramSheet.modelIds || []));
    const shouldDelete = window.confirm(copy.deleteDiagramConfirm(activeDiagramSheet.name, modelIdsToDelete.length));
    if (!shouldDelete) {
      return;
    }

    modelIdsToDelete.forEach((modelId) => {
      onDeleteModel(modelId);
    });

    const nextSheets = diagramSheets.filter((sheet) => sheet.id !== activeDiagramSheet.id);
    onUpdateDiagramSheets(nextSheets);
    onChangeActiveDiagramSheetId(nextSheets[0]?.id || '');
  };

  const handleToggleSelectedModelInActiveDiagram = () => {
    if (!selectedModel || !activeDiagramSheet) {
      return;
    }

    const nextModelIds = activeDiagramSheet.modelIds.includes(selectedModel.id)
      ? activeDiagramSheet.modelIds.filter((modelId) => modelId !== selectedModel.id)
      : [...activeDiagramSheet.modelIds, selectedModel.id];

    onUpdateDiagramSheets(
      diagramSheets.map((sheet) =>
        sheet.id === activeDiagramSheet.id
          ? {
              ...sheet,
              modelIds: nextModelIds
            }
          : sheet
      )
    );
  };

  const handleMoveSelectedModelToSheet = () => {
    if (!selectedModel || !activeDiagramSheet || !moveToSheetId || moveToSheetId === activeDiagramSheet.id) {
      return;
    }

    onUpdateDiagramSheets(
      diagramSheets.map((sheet) => {
        if (sheet.id === activeDiagramSheet.id) {
          return { ...sheet, modelIds: sheet.modelIds.filter((modelId) => modelId !== selectedModel.id) };
        }
        if (sheet.id === moveToSheetId) {
          return sheet.modelIds.includes(selectedModel.id)
            ? sheet
            : { ...sheet, modelIds: [...sheet.modelIds, selectedModel.id] };
        }
        return sheet;
      })
    );
    onChangeActiveDiagramSheetId(moveToSheetId);
  };

  const handleActiveDiagramModelPositionsChange = useCallback(
    (positions: Record<string, DiagramModelPosition>) => {
      if (!activeDiagramSheet) {
        return;
      }

      const existingPositions = activeDiagramSheet.modelPositions || {};
      const activeModelIds = activeDiagramSheet.modelIds || [];
      const hasExistingPositions = Object.keys(existingPositions).length > 0;
      const incomingCount = Object.keys(positions).length;
      const expectedCount = activeModelIds.length;

      // Guardrail: ignore transient/incomplete payloads that can arrive during first paint
      // and would overwrite a valid persisted layout (observed mostly on Main sheet).
      if (hasExistingPositions && incomingCount < expectedCount) {
        return;
      }

      if (areDiagramModelPositionRecordsEqual(activeDiagramSheet.modelPositions, positions)) {
        return;
      }

      onUpdateDiagramSheets(
        diagramSheets.map((sheet) =>
          sheet.id === activeDiagramSheet.id
            ? {
                ...sheet,
                modelPositions: positions
              }
            : sheet
        )
      );
    },
    [activeDiagramSheet, diagramSheets, onUpdateDiagramSheets]
  );

  const handleSelectDiagramModel = useCallback(
    (modelId: string, options?: { append?: boolean; toggle?: boolean }) => {
      if (!modelId) {
        setSelectedModelId('');
        setSelectedModelIds([]);
        setSelectedFieldPath('');
        setSelectedFieldPaths([]);
        return;
      }

      setSelectedModelIds((currentIds) => {
        if (options?.toggle) {
          return currentIds.includes(modelId)
            ? currentIds.filter((currentId) => currentId !== modelId)
            : [...currentIds, modelId];
        }

        if (options?.append) {
          return currentIds.includes(modelId) ? currentIds : [...currentIds, modelId];
        }

        return [modelId];
      });
      setSelectedModelId(modelId);
      setInspectorTab('collection');
      setIsInspectorVisible(true);
      if (!options?.toggle && !options?.append) {
        setAttributeSearch('');
        setSelectedFieldPath('');
        setSelectedFieldPaths([]);
      }
    },
    []
  );

  const handleCloseDiagramContextMenu = () => {
    setDiagramContextMenu(null);
  };

  const handleCopySelectedAttribute = useCallback(() => {
    if (!selectedModel || selectedFieldPaths.length === 0) {
      return;
    }

    const copiedFields = selectedFieldPaths
      .map((fieldPath) => {
        const normalizedSelectedPath = fieldPath.replace(/\[\]/g, '');
        const selectedField = findFieldByPath(selectedModel.fields, normalizedSelectedPath);
        return selectedField ? cloneFieldTree(selectedField) : null;
      })
      .filter((field): field is Field => field !== null);

    if (copiedFields.length === 0) {
      return;
    }

    onCopiedAttributesChange({
      count: copiedFields.length,
      fields: copiedFields,
      sourceModelId: selectedModel.id,
      sourceModelName: selectedModel.name
    });
  }, [onCopiedAttributesChange, selectedFieldPaths, selectedModel]);

  const handleCopySelectedCollection = useCallback(() => {
    if (!selectedModel) {
      return;
    }

    onCopiedCollectionChange({
      model: cloneModel(selectedModel),
      sourceModelId: selectedModel.id,
      sourceModelName: selectedModel.name
    });
  }, [onCopiedCollectionChange, selectedModel]);

  const handlePasteCopiedAttribute = useCallback(() => {
    if (!selectedModel || !copiedAttributes || copiedAttributes.fields.length === 0) {
      return;
    }

    const selectedTargetField = selectedFieldPath ? findFieldByPath(selectedModel.fields, selectedFieldPath.replace(/\[\]/g, '')) : null;
    const isDocumentTarget =
      selectedTargetField?.type === 'Document' ||
      (selectedTargetField?.type === 'Array' && selectedTargetField.arrayType === 'Document');

    const nextFields =
      selectedFieldPath && isDocumentTarget
        ? appendCopiedFieldsToDocumentTarget(selectedModel.fields, selectedFieldPath, copiedAttributes.fields)
        : appendCopiedFieldsToContainer(selectedModel.fields, copiedAttributes.fields, true);

    onUpdateModel({
      ...selectedModel,
      fields: nextFields
    });
  }, [copiedAttributes, onUpdateModel, selectedFieldPath, selectedModel]);

  const handlePasteCopiedCollection = useCallback(() => {
    if (!copiedCollection) {
      return;
    }

    const usedNames = new Set(models.map((model) => model.name));
    const nextModel: Model = {
      ...cloneModel(copiedCollection.model),
      id: createUniqueId(),
      name: buildUniqueModelName(copiedCollection.model.name, usedNames)
    };

    onAddModel(nextModel);
    setSelectedModelId(nextModel.id);
    setSelectedModelIds([nextModel.id]);
    setSelectedFieldPath('');
    setSelectedFieldPaths([]);
    setInspectorTab('collection');
    setIsInspectorVisible(true);
  }, [copiedCollection, models, onAddModel]);

  const handleDeleteSelectedAttributes = useCallback(() => {
    if (!selectedModel || selectedFieldPaths.length === 0) {
      return;
    }

    const impactedIndexes = getIndexesAffectedByFieldDeletion(selectedModel.indexes, selectedFieldPaths);
    if (impactedIndexes.length > 0) {
      const shouldDelete = window.confirm(
        buildDeleteAttributesConfirmationMessage(selectedFieldPaths.length, impactedIndexes)
      );
      if (!shouldDelete) {
        return;
      }
    }

    const nextFields = removeFieldsByPaths(selectedModel.fields, selectedFieldPaths);
    const nextIndexes = removeDeletedFieldReferencesFromIndexes(selectedModel.indexes, selectedFieldPaths);
    onUpdateModel({
      ...selectedModel,
      fields: nextFields,
      indexes: nextIndexes
    });
    setSelectedFieldPaths([]);
    setSelectedFieldPath('');
  }, [copy, onUpdateModel, selectedFieldPaths, selectedModel]);

  const contextMenuHasCollectionTarget = Boolean(diagramContextMenu?.modelId && !diagramContextMenu?.fieldPath);
  const contextMenuHasFieldTarget = Boolean(diagramContextMenu?.modelId && diagramContextMenu?.fieldPath);
  const contextMenuHasCanvasTarget = Boolean(!diagramContextMenu?.modelId && !diagramContextMenu?.fieldPath);

  const handleAddRelation = () => {
    if (!relationDraft.fromModelId || !relationDraft.toModelId) {
      alert(copy.selectBothCollections);
      return;
    }

    if (!relationDraft.fromFieldPath || !relationDraft.toFieldPath) {
      alert(copy.selectBothFields);
      return;
    }

    if (
      relationDraft.fromModelId === relationDraft.toModelId &&
      relationDraft.fromFieldPath === relationDraft.toFieldPath
    ) {
      alert(copy.differentEndpoints);
      return;
    }

    const newRelation: Relation = {
      id: Date.now().toString(),
      fromModelId: relationDraft.fromModelId,
      fromFieldPath: relationDraft.fromFieldPath,
      toModelId: relationDraft.toModelId,
      toFieldPath: relationDraft.toFieldPath,
      label: relationDraft.label.trim(),
      type: relationDraft.type
    };

    onUpdateRelations([...relations, newRelation]);
    setRelationDraft((currentDraft) => ({
      ...currentDraft,
      label: ''
    }));
  };

  const handleDeleteRelation = (relationId: string) => {
    onUpdateRelations(relations.filter((relation) => relation.id !== relationId));
  };

  return (
    <div className="h-full w-full overflow-hidden bg-gradient-to-br from-fuchsia-950 via-slate-950 to-orange-500 p-4">
      <div
        ref={studioShellRef}
        className="relative flex h-full overflow-hidden rounded-[30px] border border-black/40 bg-[#2e2e2e] shadow-[0_28px_100px_rgba(15,23,42,0.58)]"
      >
        {isCollectionsPanelVisible && (
          <aside className="w-[300px] shrink-0 border-r border-slate-500/20 bg-slate-900/55 text-slate-100">
            <div className="border-b border-slate-500/20 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-300">{copy.project}</div>
                  <div className="mt-2 text-lg font-semibold leading-tight text-white">{projectName}</div>
                </div>
                <IconButton
                  size="small"
                  onClick={() => setIsCollectionsPanelVisible(false)}
                  aria-label={copy.hideProjectPanel}
                  sx={PANEL_ICON_BUTTON_SX}
                >
                  <ChevronLeft className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Chip
                  size="small"
                  icon={<Database className="w-3 h-3" />}
                  label={`${visibleModels.length} ${copy.collections.toLowerCase()}`}
                  sx={DARK_CHIP_SX}
                />
                <Chip
                  size="small"
                  icon={<Network className="w-3 h-3" />}
                  label={`${relations.length} ${copy.relations.toLowerCase()}`}
                  sx={DARK_CHIP_SX}
                />
              </div>
            </div>

            <div className="border-b border-slate-500/20 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-300">{copy.createCollection}</div>
              <div className="mt-3 flex gap-2">
                <TextField
                  size="small"
                  fullWidth
                  placeholder="collection_name"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateCollection();
                    }
                  }}
                  sx={INPUT_SX}
                />
                <Button variant="contained" onClick={handleCreateCollection} className="!min-w-0 !px-4" sx={DARK_BUTTON_SX}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="min-h-0 overflow-auto px-3 py-3">
              <div className="mb-2 px-1 text-[10px] uppercase tracking-[0.14em] text-slate-300">{copy.collections}</div>
              <div className="space-y-2.5">
                {models.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-500/25 px-3 py-4 text-sm text-slate-300">
                    {copy.firstCollection}
                  </div>
                ) : visibleModels.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-500/25 px-3 py-4 text-sm text-slate-300">
                    {copy.emptySheet}{' '}
                    <span className="font-semibold text-white">{activeDiagramSheet?.name || copy.thisDiagram}</span>.
                  </div>
                ) : (
                  visibleModels.map((model) => {
                    const fieldCount = flattenModelFields(model).length;
                    const isSelected = selectedModelIds.includes(model.id);
                    const isVisibleInActiveDiagram = true;

                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={(event) => {
                          handleSelectDiagramModel(model.id, {
                            append: (event.ctrlKey || event.metaKey) && !selectedModelIds.includes(model.id),
                            toggle: event.ctrlKey || event.metaKey
                          });
                        }}
                        className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                          isSelected
                            ? 'border-cyan-300/70 bg-cyan-500/15 shadow-[0_0_0_1px_rgba(56,189,248,0.35)]'
                            : 'border-slate-500/20 bg-slate-900/35 hover:border-slate-300/40 hover:bg-slate-800/45'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">{model.name}</div>
                            <div className="mt-1 text-xs text-slate-300/90">
                              {fieldCount} field{fieldCount === 1 ? '' : 's'} ·{' '}
                              {isVisibleInActiveDiagram ? 'On this diagram' : 'Hidden from this diagram'}
                            </div>
                          </div>
                          <div
                            className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                              isSelected ? 'bg-cyan-300/25 text-cyan-50' : 'bg-white/10 text-slate-100'
                            }`}
                          >
                            {model.indexes?.length || 0} idx
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </aside>
        )}

        <div className={`flex min-w-0 flex-1 flex-col bg-black/15 ${isInspectorVisible ? 'border-r border-white/10' : ''}`}>
          <div className="border-b border-white/10 bg-[#353535] px-4 py-2">
            <div className="flex items-center gap-2">
              <TextField
                size="small"
                fullWidth
                value={diagramFieldSearch}
                onChange={(event) => setDiagramFieldSearch(event.target.value)}
                placeholder={language === 'es' ? 'Buscar atributos en diagrama...' : 'Search attributes in diagram...'}
                sx={INPUT_SX}
              />
              <div className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-slate-900/30 px-2 py-1 text-xs text-slate-200">
                <span className="min-w-[52px] text-center">
                  {diagramSearchMatches.length === 0
                    ? '0/0'
                    : `${(((activeDiagramSearchIndex % diagramSearchMatches.length) + diagramSearchMatches.length) % diagramSearchMatches.length) + 1}/${diagramSearchMatches.length}`}
                </span>
                <IconButton
                  size="small"
                  onClick={() => setActiveDiagramSearchIndex((currentIndex) => currentIndex - 1)}
                  disabled={diagramSearchMatches.length === 0}
                  sx={PANEL_ACTION_ICON_SX}
                >
                  <ChevronUp className="h-4 w-4" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => setActiveDiagramSearchIndex((currentIndex) => currentIndex + 1)}
                  disabled={diagramSearchMatches.length === 0}
                  sx={PANEL_ACTION_ICON_SX}
                >
                  <ChevronDown className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <DiagramViewer
              key={activeDiagramSheetId}
              projectName={projectName}
              diagramSheetName={activeDiagramSheet?.name || ''}
              diagramSheetId={activeDiagramSheetId}
              models={visibleModels}
              relations={visibleRelations}
              onUpdateRelations={onUpdateRelations}
              panelMode="none"
              initialModelPositions={activeDiagramModelPositions}
              onModelPositionsChange={handleActiveDiagramModelPositionsChange}
              selectedModelId={isSelectedModelInActiveDiagram ? selectedModelId : undefined}
              selectedModelIds={selectedModelIds.filter((modelId) => visibleModelIdSet.has(modelId))}
              selectedFieldPath={selectedFieldPath || undefined}
              selectedFieldPaths={selectedFieldPaths}
              fieldSearchQuery={diagramFieldSearch}
              activeSearchMatch={activeDiagramSearchMatch}
              canUndo={canUndo}
              onUndo={onUndo}
              onExportPdfReady={onExportPdfReady}
              onSelectModel={handleSelectDiagramModel}
              onSelectField={(modelId, fieldPath, options) => {
                setSelectedModelIds([modelId]);
                setSelectedModelId(modelId);
                setInspectorTab('collection');
                setIsInspectorVisible(true);
                setSelectedFieldPath(fieldPath);
                setSelectedFieldPaths((currentPaths) => {
                  if (options?.toggle) {
                    return currentPaths.includes(fieldPath)
                      ? currentPaths.filter((currentPath) => currentPath !== fieldPath)
                      : [...currentPaths, fieldPath];
                  }

                  if (options?.append) {
                    return currentPaths.includes(fieldPath) ? currentPaths : [...currentPaths, fieldPath];
                  }

                  return [fieldPath];
                });
                const fallbackSearch = fieldPath.split('.').pop()?.replace(/\[\]/g, '') || fieldPath;
                setAttributeSearch(fieldPath || fallbackSearch);
              }}
              onOpenContextMenu={({ clientX, clientY, modelId, fieldPath }) => {
                if (modelId && !selectedModelIds.includes(modelId)) {
                  handleSelectDiagramModel(modelId);
                }
                if (modelId && fieldPath) {
                  setSelectedModelIds([modelId]);
                  setSelectedModelId(modelId);
                  setSelectedFieldPath(fieldPath);
                  setSelectedFieldPaths((currentPaths) => (currentPaths.includes(fieldPath) ? currentPaths : [fieldPath]));
                  setInspectorTab('collection');
                  setIsInspectorVisible(true);
                }
                if (modelId && !fieldPath) {
                  setSelectedModelIds([modelId]);
                  setSelectedModelId(modelId);
                  setSelectedFieldPath('');
                  setSelectedFieldPaths([]);
                  setInspectorTab('collection');
                  setIsInspectorVisible(true);
                }
                setDiagramContextMenu({
                  mouseX: clientX + 2,
                  mouseY: clientY - 6,
                  modelId,
                  fieldPath
                });
              }}
              emptyStateMessage={
                activeDiagramSheet
                  ? copy.noCollectionsSheet(activeDiagramSheet.name)
                  : copy.noDiagrams
              }
            />
          </div>

          <div className="border-t border-white/10 bg-[#353535] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {diagramSheets.map((sheet) => {
                const isActive = activeDiagramSheet?.id === sheet.id;

                return (
                  editingDiagramSheetId === sheet.id ? (
                    <TextField
                      key={sheet.id}
                      autoFocus
                      size="small"
                      value={diagramSheetNameDraft}
                      onChange={(event) => setDiagramSheetNameDraft(event.target.value)}
                      onBlur={handleCommitDiagramSheetRename}
                      sx={{
                        ...INPUT_SX,
                        minWidth: 180,
                        '& .MuiOutlinedInput-root': {
                          ...INPUT_SX['& .MuiOutlinedInput-root'],
                          backgroundColor: 'rgba(6, 182, 212, 0.12)'
                        }
                      }}
                    />
                  ) : (
                    <button
                      key={sheet.id}
                      type="button"
                      onClick={() => onChangeActiveDiagramSheetId(sheet.id)}
                      onDoubleClick={() => handleRenameDiagramSheet(sheet.id)}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? 'border-cyan-300/60 bg-cyan-500/15 text-white'
                          : 'border-white/10 bg-black/15 text-slate-300 hover:border-white/20 hover:bg-white/5'
                      }`}
                    >
                      {sheet.name}
                      <span className="ml-2 text-[11px] text-slate-300/80">({sheet.modelIds.length})</span>
                    </button>
                  )
                );
              })}

              <Button size="small" variant="outlined" onClick={handleCreateDiagramSheet} sx={DARK_BUTTON_SX}>
                <Plus className="mr-1 h-4 w-4" />
                {copy.newSheet}
              </Button>
              <Button
                size="small"
                variant="text"
                onClick={() => handleRenameDiagramSheet()}
                disabled={!activeDiagramSheet}
                sx={DARK_BUTTON_SX}
              >
                {copy.rename}
              </Button>
              <Button
                size="small"
                variant="text"
                color="error"
                onClick={handleDeleteActiveDiagramSheet}
                disabled={diagramSheets.length <= 1}
                sx={DARK_BUTTON_SX}
              >
                {copy.delete}
              </Button>
            </div>
          </div>
        </div>

        {!isCollectionsPanelVisible && (
          <button
            type="button"
            onClick={() => setIsCollectionsPanelVisible(true)}
            className="absolute left-5 top-5 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-medium text-white shadow-lg backdrop-blur transition hover:border-cyan-300/60 hover:bg-slate-950"
          >
            <ChevronRight className="h-4 w-4" />
            {copy.showProjectPanel}
          </button>
        )}

        {!isInspectorVisible && (
          <button
            type="button"
            onClick={() => setIsInspectorVisible(true)}
            className="absolute right-5 top-5 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-medium text-white shadow-lg backdrop-blur transition hover:border-cyan-300/60 hover:bg-slate-950"
          >
            <ChevronLeft className="h-4 w-4" />
            {copy.showPanel}
          </button>
        )}

        {isInspectorVisible && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={copy.hideInspectorPanel}
              onPointerDown={handleInspectorResizeStart}
              className="group relative w-3 shrink-0 cursor-col-resize touch-none bg-[#3f3f3f]"
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10 transition group-hover:bg-cyan-400/70" />
              <div className="absolute left-1/2 top-1/2 flex h-12 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/30 text-slate-400 shadow-sm transition group-hover:border-cyan-300/60 group-hover:text-white">
                <GripVertical className="h-4 w-4" />
              </div>
            </div>

            <aside
              style={{ width: `${inspectorWidth}px` }}
              className={`shrink-0 bg-[#444444] text-slate-100 ${isInspectorResizing ? '' : 'transition-[width] duration-200 ease-out'}`}
            >
              <div className="flex h-full min-h-0 flex-col">
                <div className="border-b border-white/10 px-5 pt-4">
                  <div className="flex items-center gap-3">
                    <Tabs
                      value={inspectorTab}
                      onChange={(_, value) => setInspectorTab(value)}
                      textColor="inherit"
                      className="min-w-0 flex-1"
                      sx={{
                        minHeight: 48,
                        '& .MuiTabs-indicator': {
                          backgroundColor: '#38bdf8'
                        },
                        '& .MuiTab-root': {
                          color: 'rgba(226,232,240,0.72)',
                          minHeight: 48
                        },
                        '& .MuiTab-root.Mui-selected': {
                          color: '#ffffff'
                        }
                      }}
                    >
                      <Tab value="collection" label={copy.collectionDetails} />
                      <Tab value="relations" label={copy.relations} />
                    </Tabs>

                    <IconButton
                      size="small"
                      onClick={() => setIsInspectorVisible(false)}
                      aria-label={copy.hideInspectorPanel}
                      sx={PANEL_ACTION_ICON_SX}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
            {inspectorTab === 'collection' ? (
              selectedModel ? (
                <div className="space-y-5">
                  <section className="rounded-2xl border border-slate-500/20 bg-slate-900/35 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-300">{copy.collection}</div>
                        <div className="mt-2 text-lg font-semibold text-white">{selectedModel.name}</div>
                      </div>
                      <Button color="error" variant="outlined" onClick={handleDeleteSelectedCollection} sx={DARK_BUTTON_SX}>
                        {copy.delete}
                      </Button>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <TextField
                        label={copy.name}
                        value={collectionNameDraft}
                        onChange={(event) => setCollectionNameDraft(event.target.value)}
                        onBlur={handleCommitCollectionName}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleCommitCollectionName();
                          }
                        }}
                        fullWidth
                        sx={INPUT_SX}
                      />
                      <TextField
                        label={copy.indexes}
                        value={String(selectedModel.indexes?.length || 0)}
                        fullWidth
                        inputProps={{ readOnly: true }}
                        sx={INPUT_SX}
                      />
                    </div>

                    <div className="mt-3 text-xs leading-5 text-slate-300">
                      {copy.quickAddHelp}
                    </div>

                    {activeDiagramSheet && (
                      <div className="mt-4 rounded-xl border border-slate-500/20 bg-slate-900/30 px-3 py-2.5">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-300">{copy.currentDiagram}</div>
                        <div className="mt-1 text-sm font-semibold text-white">{activeDiagramSheet.name}</div>
                        <div className="mt-2 text-xs text-slate-300">
                          {isSelectedModelInActiveDiagram
                            ? copy.visibleInDiagram
                            : copy.hiddenInDiagram}
                        </div>
                        <div className="mt-3">
                          <Button variant="outlined" size="small" onClick={handleToggleSelectedModelInActiveDiagram} sx={DARK_BUTTON_SX}>
                            {isSelectedModelInActiveDiagram ? copy.removeFromDiagram : copy.addToDiagram}
                          </Button>
                        </div>
                        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                          <FormControl size="small" sx={INPUT_SX}>
                            <InputLabel>{language === 'es' ? 'Mover a hoja' : 'Move to sheet'}</InputLabel>
                            <Select
                              value={moveToSheetId}
                              label={language === 'es' ? 'Mover a hoja' : 'Move to sheet'}
                              onChange={(e) => setMoveToSheetId(e.target.value)}
                            >
                              {diagramSheets.map((sheet) => (
                                <MenuItem key={sheet.id} value={sheet.id}>
                                  {sheet.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={handleMoveSelectedModelToSheet}
                            disabled={!moveToSheetId || moveToSheetId === activeDiagramSheet.id}
                            sx={DARK_BUTTON_SX}
                          >
                            {language === 'es' ? 'Mover' : 'Move'}
                          </Button>
                        </div>
                      </div>
                    )}

                    {photoSheetConfig?.enabled && (
                      <div className="mt-4 rounded-xl border border-slate-500/20 bg-slate-900/30 px-3 py-2.5">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-300">{copy.photos}</div>

                        {selectedModel.photoSourceModelId ? (
                          <>
                            <div className="mt-1 text-sm font-semibold text-white">{copy.photoCollection}</div>
                            <div className="mt-2 text-xs text-slate-300">
                              {copy.photoBelongsTo}{' '}
                              <span className="font-semibold text-white">
                                {selectedModelPhotoSource?.name || copy.sourceCollection}
                              </span>{' '}
                              {copy.livesInFotos}
                            </div>
                            {selectedModelPhotoSource && (
                              <div className="mt-3">
                                <Button
                                  variant="outlined"
                                  size="small"
                                  onClick={() => {
                                    setSelectedModelId(selectedModelPhotoSource.id);
                                    setInspectorTab('collection');
                                    if (photoSheetConfig.mainSheetId) {
                                      onChangeActiveDiagramSheetId(photoSheetConfig.mainSheetId);
                                    }
                                  }}
                                  sx={DARK_BUTTON_SX}
                                >
                                  {copy.openSourceCollection}
                                </Button>
                              </div>
                            )}
                          </>
                        ) : canManageSelectedModelPhoto ? (
                          <>
                            <div className="mt-1 text-sm font-semibold text-white">
                              {selectedModelPhotoCollection ? selectedModelPhotoCollection.name : copy.noPhotoCollectionYet}
                            </div>
                            <div className="mt-2 text-xs text-slate-300">
                              {selectedModelPhotoCollection
                                ? copy.linkedPhotosExists
                                : copy.createLinkedPhotos}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                variant={selectedModelPhotoCollection ? 'outlined' : 'contained'}
                                size="small"
                                onClick={
                                  selectedModelPhotoCollection
                                    ? handleRemoveSelectedModelPhotoCollection
                                    : handleAddSelectedModelPhotoCollection
                                }
                                sx={DARK_BUTTON_SX}
                              >
                                {selectedModelPhotoCollection ? copy.removePhotoCollection : copy.addPhotoCollection}
                              </Button>
                              {selectedModelPhotoCollection && (
                                <Button
                                  variant="text"
                                  size="small"
                                  onClick={() => {
                                    setSelectedModelId(selectedModelPhotoCollection.id);
                                    setInspectorTab('collection');
                                    if (photoSheetConfig.photosSheetId) {
                                      onChangeActiveDiagramSheetId(photoSheetConfig.photosSheetId);
                                    }
                                  }}
                                  sx={DARK_BUTTON_SX}
                                >
                                  {copy.openPhotoCollection}
                                </Button>
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                    )}

                  </section>

                  <section className="rounded-2xl border border-slate-500/20 bg-slate-900/35 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.14em] text-slate-300">{copy.fieldsLegend}</div>
                        <div className="mt-1 text-sm text-slate-300">
                          {copy.fieldsInCollection(flattenModelFields(selectedModel).length)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 rounded-xl border border-white/10 bg-black/10 p-2">
                      <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,120px)_26px_26px_30px_34px_76px] gap-1 px-1.5 pb-1.5 text-[10px] uppercase tracking-[0.1em] text-slate-300">
                        <div>{copy.fieldName}</div>
                        <div>{copy.datatype}</div>
                        <div>ARR</div>
                        <div>NN</div>
                        <div>Null</div>
                        <div>Enum</div>
                        <div>ACTIONS</div>
                      </div>
                      <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,120px)_26px_26px_30px_34px_76px] items-center gap-1 border-b border-white/10 py-1">
                        <TextField
                          size="small"
                          value={quickFieldDraft.name}
                          onChange={(e) => setQuickFieldDraft((current) => ({ ...current, name: e.target.value }))}
                          placeholder={copy.fieldName}
                          sx={INPUT_SX}
                        />
                        <FormControl fullWidth size="small" sx={INPUT_SX}>
                          <Select
                            value={quickFieldDraft.type}
                            onChange={(e) =>
                              setQuickFieldDraft((current) => ({
                                ...current,
                                type: e.target.value,
                                bsonTypes: e.target.value === 'Mixed' ? current.bsonTypes : [],
                                arrayType: current.isArray ? current.arrayType : 'String',
                                ref: e.target.value === 'ObjectId' ? current.ref : '',
                                arrayRef: current.isArray ? current.arrayRef : ''
                              }))
                            }
                          >
                            {MONGO_TYPES.map((type) => (
                              <MenuItem key={type} value={type}>
                                {getMongoTypeOptionLabel(type)}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <div className="flex justify-center">
                        <Checkbox
                          checked={quickFieldDraft.isArray}
                          onChange={(e) =>
                            setQuickFieldDraft((current) => ({
                              ...current,
                              isArray: e.target.checked,
                              arrayType: e.target.checked ? (current.arrayType || 'String') : 'String'
                            }))
                          }
                          sx={DARK_CHECKBOX_SX}
                        />
                        </div>
                        <div className="flex justify-center">
                        <Checkbox
                          checked={quickFieldDraft.required}
                          onChange={(e) => setQuickFieldDraft((current) => ({ ...current, required: e.target.checked }))}
                          sx={DARK_CHECKBOX_SX}
                        />
                        </div>
                        <div className="flex justify-center">
                        <Checkbox
                          checked={quickFieldDraft.nullable}
                          onChange={(e) => setQuickFieldDraft((current) => ({ ...current, nullable: e.target.checked }))}
                          disabled={quickFieldDraft.type === 'Null'}
                          sx={DARK_CHECKBOX_SX}
                        />
                        </div>
                        <div className="flex justify-center">
                        <Checkbox
                          checked={quickFieldDraft.enumEnabled}
                          onChange={(e) => setQuickFieldDraft((current) => ({ ...current, enumEnabled: e.target.checked }))}
                          disabled={quickFieldDraft.isArray || quickFieldDraft.type === 'Document' || quickFieldDraft.type === 'Mixed'}
                          sx={DARK_CHECKBOX_SX}
                        />
                        </div>
                        <Button variant="contained" size="small" onClick={handleAddQuickField} sx={{ ...DARK_BUTTON_SX, minHeight: 30, px: 1.25, fontSize: '0.72rem' }}>
                          {language === 'es' ? 'Añadir' : 'Add'}
                        </Button>
                      </div>
                      {!quickFieldDraft.isArray && quickFieldDraft.type === 'Mixed' && (
                        <FormControl size="small" fullWidth sx={{ ...INPUT_SX, mt: 1 }}>
                          <InputLabel>Tipos BSON permitidos</InputLabel>
                          <Select
                            multiple
                            value={quickFieldDraft.bsonTypes}
                            label="Tipos BSON permitidos"
                            renderValue={(selected) => (selected as string[]).join(', ')}
                            onChange={(e) => setQuickFieldDraft((current) => {
                              const bsonTypes = e.target.value as string[];
                              return { ...current, bsonTypes, type: 'Mixed' };
                            })}
                          >
                            {MONGO_TYPES.filter((type) => !['Array', 'Document', 'Enum', 'Mixed', 'Null'].includes(type)).map((type) => (
                              <MenuItem key={type} value={type}>{getMongoTypeOptionLabel(type)}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                    </div>

                    <div className="mt-3">
                      {selectedFieldPaths.length > 0 && (
                        <div className="mb-3 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-[0.14em] text-cyan-100/90">
                            {copy.selectedAttributesSummary}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedFieldGroups.map((group) => (
                              <div
                                key={group.group}
                                className="rounded-full border border-cyan-200/20 bg-black/20 px-2.5 py-1 text-xs text-cyan-50"
                              >
                                {copy.selectedInGroup(group.count, group.group)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                      {filteredSelectedModelFields.map(({ field, index }) => (
                        <FieldEditor
                          key={index >= 0 ? `${selectedModel.id}-${index}` : `${selectedModel.id}-${selectedFieldPath || 'selected'}`}
                          field={field}
                          index={index}
                          depth={0}
                          models={models}
                          isIdField={index === 0 || Boolean(field.isId)}
                          layout="compact"
                          compactVariant="table"
                          onUpdate={(updates) => (index >= 0 ? handleUpdateField(index, updates) : handleUpdateSelectedField(updates))}
                          onDelete={() => (index >= 0 ? handleDeleteField(index) : handleDeleteSelectedField())}
                          onMoveUp={index > 1 ? () => handleMoveField(index, 'up') : undefined}
                          onMoveDown={
                            index > 0 &&
                            index < selectedModel.fields.length - 1 &&
                            !isMetadataField(selectedModel.fields[index + 1])
                              ? () => handleMoveField(index, 'down')
                              : undefined
                          }
                          forceExpand={Boolean(attributeSearch.trim())}
                          searchQuery={attributeSearch.trim()}
                          selectedPath={selectedFieldPath}
                          selectedPaths={selectedFieldPaths}
                          parentPath={index >= 0 ? '' : buildParentPathFromSelection(selectedFieldPath)}
                          onRenamePath={handleRenameSelectedPaths}
                        />
                      ))}
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 px-5 py-6 text-sm text-slate-300">
                  {copy.selectCollectionLeft}
                </div>
              )
            ) : (
              <div className="space-y-5">
                <section className="rounded-2xl border border-slate-500/20 bg-slate-900/35 p-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-300">{copy.createRelation}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-300">
                    {copy.createRelationHelp}
                  </div>

                  <div className="mt-3 space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <FormControl fullWidth size="small" sx={INPUT_SX}>
                        <InputLabel>{copy.fromCollection}</InputLabel>
                        <Select
                          value={relationDraft.fromModelId}
                          label={copy.fromCollection}
                          onChange={(e) => {
                            const nextModelId = e.target.value;
                            const nextFields = getFieldOptions(nextModelId, models);
                            setRelationDraft((currentDraft) => ({
                              ...currentDraft,
                              fromModelId: nextModelId,
                              fromFieldPath: nextFields[0]?.path || ''
                            }));
                          }}
                        >
                          {models.map((model) => (
                            <MenuItem key={model.id} value={model.id}>
                              {model.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <FormControl fullWidth size="small" sx={INPUT_SX}>
                        <InputLabel>{copy.fromField}</InputLabel>
                        <Select
                          value={relationDraft.fromFieldPath}
                          label={copy.fromField}
                          onChange={(e) =>
                            setRelationDraft((currentDraft) => ({
                              ...currentDraft,
                              fromFieldPath: e.target.value
                            }))
                          }
                        >
                          {fromFieldOptions.map((field) => (
                            <MenuItem key={field.path} value={field.path}>
                              {field.path}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <FormControl fullWidth size="small" sx={INPUT_SX}>
                        <InputLabel>{copy.toCollection}</InputLabel>
                        <Select
                          value={relationDraft.toModelId}
                          label={copy.toCollection}
                          onChange={(e) => {
                            const nextModelId = e.target.value;
                            const nextFields = getFieldOptions(nextModelId, models);
                            setRelationDraft((currentDraft) => ({
                              ...currentDraft,
                              toModelId: nextModelId,
                              toFieldPath: nextFields[0]?.path || ''
                            }));
                          }}
                        >
                          {models.map((model) => (
                            <MenuItem key={model.id} value={model.id}>
                              {model.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <FormControl fullWidth size="small" sx={INPUT_SX}>
                        <InputLabel>{copy.toField}</InputLabel>
                        <Select
                          value={relationDraft.toFieldPath}
                          label={copy.toField}
                          onChange={(e) =>
                            setRelationDraft((currentDraft) => ({
                              ...currentDraft,
                              toFieldPath: e.target.value
                            }))
                          }
                        >
                          {toFieldOptions.map((field) => (
                            <MenuItem key={field.path} value={field.path}>
                              {field.path}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <FormControl fullWidth size="small" sx={INPUT_SX}>
                        <InputLabel>{copy.relationType}</InputLabel>
                        <Select
                          value={relationDraft.type}
                          label={copy.relationType}
                          onChange={(e) =>
                            setRelationDraft((currentDraft) => ({
                              ...currentDraft,
                              type: e.target.value as Relation['type']
                            }))
                          }
                        >
                          <MenuItem value="one-to-one">{language === 'es' ? 'Uno a uno' : 'One to one'}</MenuItem>
                          <MenuItem value="one-to-many">{language === 'es' ? 'Uno a muchos' : 'One to many'}</MenuItem>
                          <MenuItem value="many-to-one">{language === 'es' ? 'Muchos a uno' : 'Many to one'}</MenuItem>
                          <MenuItem value="many-to-many">{language === 'es' ? 'Muchos a muchos' : 'Many to many'}</MenuItem>
                        </Select>
                      </FormControl>

                      <TextField
                        label={copy.label}
                        size="small"
                        fullWidth
                        value={relationDraft.label}
                        onChange={(e) =>
                          setRelationDraft((currentDraft) => ({
                            ...currentDraft,
                            label: e.target.value
                          }))
                        }
                        sx={INPUT_SX}
                      />
                    </div>

                    <Button
                      variant="contained"
                      startIcon={<Plus className="w-4 h-4" />}
                      onClick={handleAddRelation}
                      disabled={models.length < 2}
                      fullWidth
                      sx={DARK_BUTTON_SX}
                    >
                      {copy.addRelation}
                    </Button>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-500/20 bg-slate-900/35 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-slate-300">{copy.savedRelations}</div>
                      <div className="mt-1 text-sm text-slate-300">
                        {relations.length === 0
                          ? copy.noManualRelations
                          : copy.workspaceRelations(relations.length)}
                      </div>
                    </div>
                    <div className="rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-100">
                      {relations.length}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {relations.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-500/25 px-3 py-4 text-sm text-slate-400">
                        {copy.noManualRelations}
                      </div>
                    ) : (
                      relations.map((relation) => {
                        const sourceModelName =
                          models.find((model) => model.id === relation.fromModelId)?.name || copy.unknown;
                        const targetModelName =
                          models.find((model) => model.id === relation.toModelId)?.name || copy.unknown;

                        return (
                          <div
                            key={relation.id}
                            className="flex items-start justify-between gap-2 rounded-xl border border-slate-500/20 bg-slate-900/30 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-white">
                                {relation.label || buildDefaultRelationLabel(relation)}
                              </div>
                              <div className="mt-1 text-xs leading-5 text-slate-300">
                                {sourceModelName}.{relation.fromFieldPath || copy.fieldFallback} {'->'} {targetModelName}.
                                {relation.toFieldPath || copy.fieldFallback} ({RELATION_LABELS[relation.type]})
                              </div>
                            </div>
                            <IconButton size="small" onClick={() => handleDeleteRelation(relation.id)} sx={PANEL_DELETE_ICON_SX}>
                              <Trash2 className="w-4 h-4" />
                            </IconButton>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              </div>
            )}
                </div>
              </div>
            </aside>
          </>
        )}
      </div>

      <Menu
        open={Boolean(diagramContextMenu)}
        onClose={handleCloseDiagramContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          diagramContextMenu ? { top: diagramContextMenu.mouseY, left: diagramContextMenu.mouseX } : undefined
        }
      >
        {contextMenuHasCollectionTarget ? (
          [
            <MenuItem
              key="copy-collection"
              onClick={() => {
                handleCopySelectedCollection();
                handleCloseDiagramContextMenu();
              }}
              disabled={!selectedModel}
            >
              <Copy className="mr-2 h-4 w-4" />
              {copy.copyCollection}
            </MenuItem>,
            <MenuItem
              key="paste-attributes-at-root"
              onClick={() => {
                handlePasteCopiedAttribute();
                handleCloseDiagramContextMenu();
              }}
              disabled={!selectedModel || !copiedAttributes || copiedAttributes.fields.length === 0}
            >
              <ClipboardPaste className="mr-2 h-4 w-4" />
              {copy.pasteSelection}
            </MenuItem>,
            <MenuItem
              key="paste-collection"
              onClick={() => {
                handlePasteCopiedCollection();
                handleCloseDiagramContextMenu();
              }}
              disabled={!copiedCollection}
            >
              <ClipboardPaste className="mr-2 h-4 w-4" />
              {copy.pasteCollection}
            </MenuItem>,
            <MenuItem
              key="delete-collection"
              onClick={() => {
                handleDeleteSelectedCollection();
                handleCloseDiagramContextMenu();
              }}
              disabled={!selectedModel}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {copy.delete}
            </MenuItem>
          ]
        ) : contextMenuHasFieldTarget ? (
          [
            <MenuItem
              key="copy-attributes"
              onClick={() => {
                handleCopySelectedAttribute();
                handleCloseDiagramContextMenu();
              }}
              disabled={!selectedModel || selectedFieldPaths.length === 0}
            >
              <Copy className="mr-2 h-4 w-4" />
              {copy.copySelection}
            </MenuItem>,
            <MenuItem
              key="paste-attributes"
              onClick={() => {
                handlePasteCopiedAttribute();
                handleCloseDiagramContextMenu();
              }}
              disabled={!selectedModel || !copiedAttributes || copiedAttributes.fields.length === 0}
            >
              <ClipboardPaste className="mr-2 h-4 w-4" />
              {copy.pasteSelection}
            </MenuItem>,
            <MenuItem
              key="delete-attributes"
              onClick={() => {
                handleDeleteSelectedAttributes();
                handleCloseDiagramContextMenu();
              }}
              disabled={!selectedModel || selectedFieldPaths.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {copy.deleteSelection}
            </MenuItem>
          ]
        ) : contextMenuHasCanvasTarget ? (
          [
            <MenuItem
              key="paste-collection-canvas"
              onClick={() => {
                handlePasteCopiedCollection();
                handleCloseDiagramContextMenu();
              }}
              disabled={!copiedCollection}
            >
              <ClipboardPaste className="mr-2 h-4 w-4" />
              {copy.pasteCollection}
            </MenuItem>
          ]
        ) : null}
      </Menu>
    </div>
  );
}

function pruneFieldTreeToExactPath(field: Field, selectedPath: string, parentPath: string): Field | null {
  const currentPath = parentPath ? `${parentPath}.${field.name}` : field.name;
  const normalizedCurrentPath = currentPath.replace(/\[\]/g, '');

  if (normalizedCurrentPath === selectedPath) {
    return field;
  }

  if (!selectedPath.startsWith(`${normalizedCurrentPath}.`)) {
    return null;
  }

  if (!field.nestedFields || field.nestedFields.length === 0) {
    return null;
  }

  const nextNested = field.nestedFields
    .map((nestedField) => pruneFieldTreeToExactPath(nestedField, selectedPath, currentPath))
    .filter((nestedField): nestedField is Field => nestedField !== null);

  if (nextNested.length === 0) {
    return null;
  }

  return {
    ...field,
    nestedFields: nextNested
  };
}

function buildSelectedEditorFieldEntries(fields: Field[], selectedPaths: string[]) {
  const normalizedPaths = Array.from(new Set(selectedPaths.map((path) => path.replace(/\[\]/g, '')).filter(Boolean)));
  const mergedByTopLevelIndex = new Map<number, Field>();

  normalizedPaths.forEach((selectedPath) => {
    fields.forEach((field, index) => {
      const prunedField = pruneFieldTreeToExactPath(field, selectedPath, '');
      if (!prunedField) {
        return;
      }

      const existingField = mergedByTopLevelIndex.get(index);
      if (!existingField) {
        mergedByTopLevelIndex.set(index, cloneFieldTree(prunedField));
        return;
      }

      mergedByTopLevelIndex.set(index, mergeFieldTrees(existingField, prunedField));
    });
  });

  return Array.from(mergedByTopLevelIndex.entries())
    .sort(([leftIndex], [rightIndex]) => leftIndex - rightIndex)
    .map(([index, field]) => ({ index, field }));
}

function groupSelectedFieldPaths(selectedPaths: string[]) {
  const groups = new Map<string, number>();

  selectedPaths.forEach((path) => {
    const normalizedPath = path.replace(/\[\]/g, '');
    const segments = normalizedPath.split('.');
    const group = segments.length > 1 ? segments.slice(0, -1).join('.') : 'root';
    groups.set(group, (groups.get(group) || 0) + 1);
  });

  return Array.from(groups.entries()).map(([group, count]) => ({ group, count }));
}

function removeFieldsByPaths(fields: Field[], selectedPaths: string[], parentPath = ''): Field[] {
  const normalizedSelectedPaths = new Set(selectedPaths.map((path) => path.replace(/\[\]/g, '')));

  return fields.reduce<Field[]>((acc, field) => {
    const currentPath = parentPath ? `${parentPath}.${field.name}` : field.name || '';
    const normalizedCurrentPath = currentPath.replace(/\[\]/g, '');

    if (
      normalizedSelectedPaths.has(normalizedCurrentPath) ||
      Array.from(normalizedSelectedPaths).some((selectedPath) => selectedPath.startsWith(`${normalizedCurrentPath}.`))
    ) {
      if (normalizedSelectedPaths.has(normalizedCurrentPath)) {
        return acc;
      }
    }

    if (!field.nestedFields || field.nestedFields.length === 0) {
      acc.push(field);
      return acc;
    }

    const nextNestedFields = removeFieldsByPaths(field.nestedFields, selectedPaths, currentPath);
    acc.push({
      ...field,
      nestedFields: nextNestedFields
    });
    return acc;
  }, []);
}

function replaceFieldAtPath(fields: Field[], targetPath: string, nextField: Field, parentPath = ''): Field[] {
  return fields.map((field) => {
    const currentPath = parentPath ? `${parentPath}.${field.name}` : field.name || '';
    const normalizedCurrentPath = currentPath.replace(/\[\]/g, '');

    if (normalizedCurrentPath === targetPath) {
      return nextField;
    }

    if (!field.nestedFields || field.nestedFields.length === 0) {
      return field;
    }

    return {
      ...field,
      nestedFields: replaceFieldAtPath(field.nestedFields, targetPath, nextField, currentPath)
    };
  });
}

function removeFieldAtPath(fields: Field[], targetPath: string, parentPath = ''): Field[] {
  return fields.reduce<Field[]>((accumulator, field) => {
    const currentPath = parentPath ? `${parentPath}.${field.name}` : field.name || '';
    const normalizedCurrentPath = currentPath.replace(/\[\]/g, '');

    if (normalizedCurrentPath === targetPath) {
      return accumulator;
    }

    if (!field.nestedFields || field.nestedFields.length === 0) {
      accumulator.push(field);
      return accumulator;
    }

    accumulator.push({
      ...field,
      nestedFields: removeFieldAtPath(field.nestedFields, targetPath, currentPath)
    });
    return accumulator;
  }, []);
}

function renamePathPreservingSelection(path: string, previousPath: string, nextPath: string) {
  const normalizedPath = path.replace(/\[\]/g, '');
  const normalizedPreviousPath = previousPath.replace(/\[\]/g, '');
  const normalizedNextPath = nextPath.replace(/\[\]/g, '');

  if (normalizedPath === normalizedPreviousPath) {
    return normalizedNextPath;
  }

  if (normalizedPath.startsWith(`${normalizedPreviousPath}.`)) {
    return `${normalizedNextPath}${normalizedPath.slice(normalizedPreviousPath.length)}`;
  }

  return path;
}

function buildParentPathFromSelection(selectedPath: string) {
  const normalizedPath = (selectedPath || '').replace(/\[\]/g, '');
  const lastDotIndex = normalizedPath.lastIndexOf('.');
  return lastDotIndex >= 0 ? normalizedPath.slice(0, lastDotIndex) : '';
}

function buildDeleteAttributesConfirmationMessage(selectedCount: number, impactedIndexes: Index[]) {
  if (impactedIndexes.length === 0) {
    return `Se eliminar${selectedCount === 1 ? 'a' : 'án'} ${selectedCount} atributo${selectedCount === 1 ? '' : 's'}. ¿Quieres continuar?`;
  }

  const impactedNames = impactedIndexes.map((index) => index.name).join(', ');
  return `Se eliminar${selectedCount === 1 ? 'á' : 'án'} ${selectedCount} atributo${selectedCount === 1 ? '' : 's'} y se actualizar${impactedIndexes.length === 1 ? 'á' : 'án'} ${impactedIndexes.length} índice${impactedIndexes.length === 1 ? '' : 's'} (${impactedNames}). ¿Quieres continuar?`;
}

function getIndexesAffectedByFieldDeletion(indexes: Index[], deletedPaths: string[]) {
  return indexes.filter((index) => isIndexAffectedByDeletedPaths(index, deletedPaths));
}

function isIndexAffectedByDeletedPaths(index: Index, deletedPaths: string[]) {
  if (index.type === 'atlas_search') {
    return Boolean(index.searchDefinition && removeDeletedPathsFromAtlasSearchDefinition(index.searchDefinition, deletedPaths) !== index.searchDefinition);
  }

  if (index.type === 'wildcard') {
    const wildcardFieldPath = getNormalizedWildcardFieldPath(index);
    if (wildcardFieldPath && deletedPaths.some((path) => isPathEqualOrDescendant(path, wildcardFieldPath) || isPathEqualOrDescendant(wildcardFieldPath, path))) {
      return true;
    }
    return Boolean(index.wildcardProjection && removeDeletedPathsFromWildcardProjection(index.wildcardProjection, deletedPaths) !== index.wildcardProjection);
  }

  return index.fields.some((field) => deletedPaths.some((path) => isPathEqualOrDescendant(field.field, path)));
}

function removeDeletedFieldReferencesFromIndexes(indexes: Index[], deletedPaths: string[]) {
  return indexes.reduce<Index[]>((accumulator, index) => {
    if (index.type === 'atlas_search') {
      const nextSearchDefinition = removeDeletedPathsFromAtlasSearchDefinition(index.searchDefinition, deletedPaths);
      const parsed = safeParseJson(nextSearchDefinition);
      const mappingFields = parsed?.mappings?.fields;
      const hasMappings = Boolean(mappingFields && Object.keys(mappingFields).length > 0);
      const isDynamic = Boolean(parsed?.mappings?.dynamic);

      if (!hasMappings && !isDynamic) {
        return accumulator;
      }

      accumulator.push({
        ...index,
        searchDefinition: nextSearchDefinition
      });
      return accumulator;
    }

    const nextFields = index.fields.filter(
      (indexField) => !deletedPaths.some((deletedPath) => isPathEqualOrDescendant(indexField.field, deletedPath))
    );

    if (index.type === 'wildcard') {
      const nextWildcardProjection = removeDeletedPathsFromWildcardProjection(index.wildcardProjection, deletedPaths);
      const wildcardFieldPath = getNormalizedWildcardFieldPath(index);
      const wildcardFieldDeleted = wildcardFieldPath
        ? deletedPaths.some((deletedPath) => isPathEqualOrDescendant(wildcardFieldPath, deletedPath))
        : false;

      if (wildcardFieldDeleted) {
        return accumulator;
      }

      accumulator.push({
        ...index,
        fields: nextFields.length > 0 ? nextFields : index.fields,
        wildcardProjection: nextWildcardProjection
      });
      return accumulator;
    }

    if (nextFields.length === 0) {
      return accumulator;
    }

    accumulator.push({
      ...index,
      fields: nextFields
    });
    return accumulator;
  }, []);
}

function removeDeletedPathsFromWildcardProjection(value: string | undefined, deletedPaths: string[]) {
  if (!value) {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const nextEntries = Object.entries(parsed).filter(
      ([path]) => !deletedPaths.some((deletedPath) => isPathEqualOrDescendant(path, deletedPath))
    );
    if (nextEntries.length === 0) {
      return '';
    }
    return JSON.stringify(Object.fromEntries(nextEntries), null, 2);
  } catch {
    return value;
  }
}

function removeDeletedPathsFromAtlasSearchDefinition(value: string | undefined, deletedPaths: string[]) {
  if (!value) {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as { mappings?: { dynamic?: boolean; fields?: Record<string, unknown> } };
    const nextFields = removeDeletedPathsFromAtlasNode(parsed.mappings?.fields || {}, '', deletedPaths);
    return JSON.stringify(
      {
        mappings: {
          dynamic: Boolean(parsed.mappings?.dynamic),
          fields: nextFields
        }
      },
      null,
      2
    );
  } catch {
    return value;
  }
}

function removeDeletedPathsFromAtlasNode(
  node: Record<string, unknown>,
  parentPath: string,
  deletedPaths: string[]
): Record<string, unknown> {
  return Object.entries(node).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    const currentPath = parentPath ? `${parentPath}.${key}` : key;
    if (deletedPaths.some((deletedPath) => isPathEqualOrDescendant(currentPath, deletedPath))) {
      return accumulator;
    }

    if (Array.isArray(value)) {
      const nextArray = value
        .map((entry) => cleanAtlasSearchEntry(entry, currentPath, deletedPaths))
        .filter((entry) => entry !== null);
      if (nextArray.length === 1) {
        accumulator[key] = nextArray[0];
      } else if (nextArray.length > 1) {
        accumulator[key] = nextArray;
      }
      return accumulator;
    }

    const nextEntry = cleanAtlasSearchEntry(value, currentPath, deletedPaths);
    if (nextEntry !== null) {
      accumulator[key] = nextEntry;
    }
    return accumulator;
  }, {});
}

function cleanAtlasSearchEntry(entry: unknown, currentPath: string, deletedPaths: string[]) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return entry;
  }

  const nextEntry = { ...(entry as Record<string, unknown>) };
  if (nextEntry.fields && typeof nextEntry.fields === 'object' && !Array.isArray(nextEntry.fields)) {
    const cleanedFields = removeDeletedPathsFromAtlasNode(
      nextEntry.fields as Record<string, unknown>,
      currentPath,
      deletedPaths
    );
    if (Object.keys(cleanedFields).length > 0) {
      nextEntry.fields = cleanedFields;
    } else {
      delete nextEntry.fields;
    }
  }

  if (
    (nextEntry.type === 'document' || nextEntry.type === 'embeddedDocuments') &&
    !nextEntry.fields &&
    !nextEntry.dynamic
  ) {
    return null;
  }

  return nextEntry;
}

function getNormalizedWildcardFieldPath(index: Index) {
  const wildcardField = index.fields.find((field) => String(field.field || '').includes('$**'))?.field || '';
  return wildcardField.replace(/\.\$\*\*$/, '');
}

function isPathEqualOrDescendant(path: string, basePath: string) {
  const normalizedPath = path.replace(/\[\]/g, '').replace(/\.\$\*\*$/, '');
  const normalizedBasePath = basePath.replace(/\[\]/g, '').replace(/\.\$\*\*$/, '');
  return normalizedPath === normalizedBasePath || normalizedPath.startsWith(`${normalizedBasePath}.`);
}

function safeParseJson(value: string | undefined) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function mergeNestedFieldsPreservingSiblings(originalNested: Field[], updatedNested: Field[]): Field[] {
  const updatedByName = new Map(updatedNested.map((field) => [field.name, field]));
  const merged = originalNested.map((originalField) => {
    const updatedField = updatedByName.get(originalField.name);
    if (!updatedField) {
      return originalField;
    }

    const hasUpdatedNested = Array.isArray(updatedField.nestedFields);
    return {
      ...originalField,
      ...updatedField,
      nestedFields: hasUpdatedNested
        ? mergeNestedFieldsPreservingSiblings(originalField.nestedFields || [], updatedField.nestedFields || [])
        : originalField.nestedFields
    };
  });

  updatedNested.forEach((updatedField) => {
    const exists = originalNested.some((originalField) => originalField.name === updatedField.name);
    if (!exists) {
      merged.push(updatedField);
    }
  });

  return merged;
}

function mergeNestedFieldsForSelectedPath(
  originalNested: Field[],
  updatedNested: Field[],
  selectedPath: string,
  parentPath: string
): Field[] {
  const normalizedSelectedPath = selectedPath.replace(/\[\]/g, '');
  const isContainerSelected = normalizedSelectedPath === parentPath;

  if (isContainerSelected) {
    const originalByName = new Map(originalNested.map((field) => [field.name, field]));
    return updatedNested.map((updatedField) => {
      const originalField = updatedField.name ? originalByName.get(updatedField.name) : undefined;
      if (!originalField) {
        return updatedField;
      }

      const hasUpdatedNested = Array.isArray(updatedField.nestedFields);
      return {
        ...originalField,
        ...updatedField,
        nestedFields: hasUpdatedNested
          ? mergeNestedFieldsForSelectedPath(
              originalField.nestedFields || [],
              updatedField.nestedFields || [],
              normalizedSelectedPath,
              `${parentPath}.${originalField.name}`
            )
          : originalField.nestedFields
      };
    });
  }

  const updatedByName = new Map<string, { field: Field; index: number }>();
  updatedNested.forEach((field, index) => {
    if (field.name) {
      updatedByName.set(field.name, { field, index });
    }
  });
  const consumedUpdatedIndexes = new Set<number>();

  const selectedLeafName = normalizedSelectedPath.includes('.')
    ? normalizedSelectedPath.split('.').pop() || ''
    : normalizedSelectedPath;

  const merged = originalNested.reduce<Field[]>((acc, originalField, index) => {
    const currentPath = parentPath ? `${parentPath}.${originalField.name}` : originalField.name;
    const isOnSelectedBranch =
      isContainerSelected ||
      normalizedSelectedPath === currentPath ||
      normalizedSelectedPath.startsWith(`${currentPath}.`);

    if (!isOnSelectedBranch) {
      acc.push(originalField);
      return acc;
    }

    let updatedFieldEntry = originalField.name ? updatedByName.get(originalField.name) : undefined;
    if (!updatedFieldEntry && originalField.name === selectedLeafName && updatedNested[index]) {
      // Rename-in-place fallback: when selected field name changes, match by position first.
      updatedFieldEntry = { field: updatedNested[index], index };
    }
    if (!updatedFieldEntry && updatedNested[index]) {
      updatedFieldEntry = { field: updatedNested[index], index };
    }

    const updatedField = updatedFieldEntry?.field;
    if (!updatedField) {
      return acc;
    }
    consumedUpdatedIndexes.add(updatedFieldEntry!.index);

    const hasUpdatedNested = Array.isArray(updatedField.nestedFields);
    const nextNested = hasUpdatedNested
      ? mergeNestedFieldsForSelectedPath(
          originalField.nestedFields || [],
          updatedField.nestedFields || [],
          normalizedSelectedPath,
          currentPath
        )
      : originalField.nestedFields;

    acc.push({
      ...originalField,
      ...updatedField,
      nestedFields: nextNested
    });
    return acc;
  }, []);

  return merged;
}

function getFieldOptions(modelId: string, models: Model[]) {
  const model = models.find((candidate) => candidate.id === modelId);
  return model ? flattenModelFields(model) : [];
}

function filterFieldTreeByQuery(fields: Field[], query: string): Array<{ field: Field; index: number }> {
  const normalizedQuery = query.replace(/\[\]/g, '');

  const matchesField = (field: Field, parentPath = '') => {
    const currentPath = parentPath ? `${parentPath}.${field.name}` : field.name;
    const normalizedName = field.name.toLowerCase();
    const normalizedPath = currentPath.toLowerCase();
    const normalizedPathNoArrayToken = normalizedPath.replace(/\[\]/g, '');
    return (
      normalizedName.includes(query) ||
      normalizedPath.includes(query) ||
      normalizedName.includes(normalizedQuery) ||
      normalizedPathNoArrayToken.includes(normalizedQuery)
    );
  };

  const hasNestedMatch = (nestedFields: Field[] | undefined, parentPath = ''): boolean => {
    if (!nestedFields || nestedFields.length === 0) {
      return false;
    }

    return nestedFields.some((nestedField) => {
      if (matchesField(nestedField, parentPath)) {
        return true;
      }

      const nestedPath = parentPath ? `${parentPath}.${nestedField.name}` : nestedField.name;
      return hasNestedMatch(nestedField.nestedFields, nestedPath);
    });
  };

  return fields
    .map((field, index) => {
      const currentMatches = matchesField(field);
      const hasChildrenMatch = hasNestedMatch(field.nestedFields, field.name);

      if (currentMatches || hasChildrenMatch) {
        return {
          index,
          field
        };
      }
      return null;
    })
    .filter((entry): entry is { field: Field; index: number } => entry !== null);
}

function buildDefaultRelationLabel(relation: Relation) {
  if (relation.fromFieldPath && relation.toFieldPath) {
    return `${relation.fromFieldPath} to ${relation.toFieldPath}`;
  }
  return 'Field relation';
}

function buildDerivedPhotoRelations(
  relations: Relation[],
  models: Model[],
  visibleModelIdSet: Set<string>
): Relation[] {
  return relations.flatMap((relation) => {
    const sourceModel = models.find((model) => model.id === relation.fromModelId);
    const targetModel = models.find((model) => model.id === relation.toModelId);

    if (!sourceModel || !targetModel || sourceModel.photoSourceModelId || targetModel.photoSourceModelId) {
      return [];
    }

    const sourcePhotoModel =
      models.find(
        (model) => model.photoSourceModelId === sourceModel.id || model.id === buildPhotoCollectionId(sourceModel.id)
      ) || null;
    const targetPhotoModel =
      models.find(
        (model) => model.photoSourceModelId === targetModel.id || model.id === buildPhotoCollectionId(targetModel.id)
      ) || null;

    if (!sourcePhotoModel || !targetPhotoModel) {
      return [];
    }

    if (!visibleModelIdSet.has(sourcePhotoModel.id) || !visibleModelIdSet.has(targetPhotoModel.id)) {
      return [];
    }

    return [
      {
        id: `${relation.id}__photo`,
        fromModelId: sourcePhotoModel.id,
        fromFieldPath: buildPhotoRelationFieldPath(relation.fromFieldPath),
        toModelId: targetPhotoModel.id,
        toFieldPath: buildPhotoRelationFieldPath(relation.toFieldPath),
        label: relation.label,
        type: relation.type
      }
    ];
  });
}

function buildPhotoRelationFieldPath(fieldPath?: string) {
  return fieldPath ? `original_doc.${fieldPath}` : 'original_doc';
}

function buildRelationIdentityKey(relation: Relation) {
  return [
    relation.fromModelId,
    relation.fromFieldPath || '',
    relation.toModelId,
    relation.toFieldPath || '',
    relation.type
  ].join('::');
}

function areDiagramModelPositionRecordsEqual(
  left: Record<string, DiagramModelPosition> | undefined,
  right: Record<string, DiagramModelPosition> | undefined
) {
  const leftEntries = Object.entries(left || {});
  const rightEntries = Object.entries(right || {});

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([modelId, position]) => {
    const candidate = right?.[modelId];
    return Boolean(candidate) && candidate.x === position.x && candidate.y === position.y;
  });
}

function findFieldByPath(fields: Field[], targetPath: string, parentPath = ''): Field | null {
  for (const field of fields) {
    const fieldPath = parentPath ? `${parentPath}.${field.name}` : field.name || '';
    if (fieldPath === targetPath) {
      return field;
    }

    const nestedPath =
      field.type === 'Array' && field.arrayType === 'Document'
        ? fieldPath
        : fieldPath;
    const nestedMatch = findFieldByPath(field.nestedFields || [], targetPath, nestedPath);
    if (nestedMatch) {
      return nestedMatch;
    }
  }

  return null;
}

function appendCopiedFieldsToContainer(fields: Field[], copiedFields: Field[], keepMetadataLast: boolean) {
  let nextFields = [...fields];
  const usedNames = new Set(nextFields.map((field) => field.name));

  copiedFields.forEach((field) => {
    const clonedField = cloneFieldTree(field);
    if (keepMetadataLast && clonedField.name === '_id') {
      nextFields = replaceRootIdField(nextFields, clonedField);
      usedNames.add('_id');
      return;
    }

    if (keepMetadataLast && isMetadataField(clonedField)) {
      nextFields = replaceRootMetadataField(nextFields, clonedField);
      usedNames.add('metadata');
      return;
    }

    clonedField.name = buildUniqueFieldName(clonedField.name, usedNames);
    usedNames.add(clonedField.name);
    nextFields = keepMetadataLast ? appendFieldKeepingMetadataLast(nextFields, clonedField) : [...nextFields, clonedField];
  });

  return nextFields;
}

function replaceRootIdField(fields: Field[], nextIdField: Field) {
  const idField = {
    ...cloneFieldTree(nextIdField),
    name: '_id'
  };
  const withoutId = fields.filter((field) => field.name !== '_id');
  return [idField, ...withoutId];
}

function replaceRootMetadataField(fields: Field[], nextMetadataField: Field) {
  const metadataField = {
    ...cloneFieldTree(nextMetadataField),
    name: 'metadata'
  };
  const withoutMetadata = fields.filter((field) => !isMetadataField(field));
  return [...withoutMetadata, metadataField];
}

function appendCopiedFieldsToDocumentTarget(fields: Field[], targetPath: string, copiedFields: Field[]) {
  const result = appendCopiedFieldsToDocumentTargetRecursive(fields, '', targetPath, copiedFields);
  return result.inserted ? result.fields : appendCopiedFieldsToContainer(fields, copiedFields, true);
}

function appendCopiedFieldsToDocumentTargetRecursive(
  fields: Field[],
  parentPath: string,
  targetPath: string,
  copiedFields: Field[]
): { fields: Field[]; inserted: boolean } {
  let inserted = false;

  const nextFields = fields.map((field) => {
    if (!field.name) {
      return field;
    }

    const fieldPath = parentPath ? `${parentPath}.${field.name}` : field.name;

    if (field.type === 'Document') {
      if (fieldPath === targetPath) {
        inserted = true;
        return {
          ...field,
          nestedFields: appendCopiedFieldsToContainer(field.nestedFields || [], copiedFields, false)
        };
      }

      if (field.nestedFields && field.nestedFields.length > 0) {
        const nestedResult = appendCopiedFieldsToDocumentTargetRecursive(
          field.nestedFields,
          fieldPath,
          targetPath,
          copiedFields
        );

        if (nestedResult.inserted) {
          inserted = true;
          return {
            ...field,
            nestedFields: nestedResult.fields
          };
        }
      }
    }

    if (field.type === 'Array' && field.arrayType === 'Document') {
      const arrayPath = `${fieldPath}[]`;
      if (arrayPath === targetPath) {
        inserted = true;
        return {
          ...field,
          nestedFields: appendCopiedFieldsToContainer(field.nestedFields || [], copiedFields, false)
        };
      }

      if (field.nestedFields && field.nestedFields.length > 0) {
        const nestedResult = appendCopiedFieldsToDocumentTargetRecursive(
          field.nestedFields,
          arrayPath,
          targetPath,
          copiedFields
        );

        if (nestedResult.inserted) {
          inserted = true;
          return {
            ...field,
            nestedFields: nestedResult.fields
          };
        }
      }
    }

    return field;
  });

  return {
    fields: nextFields,
    inserted
  };
}

function buildCopiedFieldTrees(sourceFields: Field[], selectedPaths: string[]) {
  const normalizedPaths = Array.from(
    new Set(
      selectedPaths
        .map((path) => path.replace(/\[\]/g, ''))
        .filter(Boolean)
    )
  );

  const copiedRoots: Field[] = [];

  normalizedPaths.forEach((selectedPath) => {
    sourceFields.forEach((field) => {
      const prunedField = pruneFieldTreeToExactPath(field, selectedPath, '');
      if (!prunedField) {
        return;
      }

      const existingRootIndex = copiedRoots.findIndex((candidate) => candidate.name === prunedField.name);
      if (existingRootIndex === -1) {
        copiedRoots.push(cloneFieldTree(prunedField));
        return;
      }

      copiedRoots[existingRootIndex] = mergeFieldTrees(copiedRoots[existingRootIndex], prunedField);
    });
  });

  return copiedRoots;
}

function mergeFieldTrees(baseField: Field, incomingField: Field): Field {
  return {
    ...baseField,
    ...incomingField,
    nestedFields: mergeNestedFieldsPreservingSiblings(baseField.nestedFields || [], incomingField.nestedFields || [])
  };
}

function cloneFieldTree(field: Field): Field {
  return {
    ...field,
    enum: field.enum ? [...field.enum] : undefined,
    nestedFields: (field.nestedFields || []).map(cloneFieldTree)
  };
}

function cloneModel(model: Model): Model {
  return {
    ...model,
    fields: model.fields.map(cloneFieldTree),
    indexes: (model.indexes || []).map((index) => ({
      ...index,
      fields: index.fields.map((field) => ({ ...field }))
    }))
  };
}

function createUniqueId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildUniqueModelName(name: string, usedNames: Set<string>) {
  const baseName = (name || 'collection').trim() || 'collection';
  if (!usedNames.has(baseName)) {
    return baseName;
  }

  let counter = 1;
  let nextName = `${baseName}_copy`;
  while (usedNames.has(nextName)) {
    counter += 1;
    nextName = `${baseName}_copy_${counter}`;
  }

  return nextName;
}

function buildUniqueFieldName(name: string, usedNames: Set<string>) {
  const baseName = (name || 'field').trim() || 'field';
  if (!usedNames.has(baseName)) {
    return baseName;
  }

  let counter = 1;
  let nextName = `${baseName}_copy`;
  while (usedNames.has(nextName)) {
    counter += 1;
    nextName = `${baseName}_copy_${counter}`;
  }

  return nextName;
}
