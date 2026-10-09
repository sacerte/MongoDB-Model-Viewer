import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Tooltip
} from '@mui/material';
import { ZoomIn, ZoomOut, Download, RotateCcw, Plus, Trash2, ChevronLeft, ChevronRight, Hand, MousePointer2, Move, Maximize } from 'lucide-react';
import jsPDF from 'jspdf';
import { Model, Field } from './MongoModelBuilder';
import { DiagramModelPosition, Relation } from '../utils/projectBundle';
import { flattenModelFields } from '../utils/dataDictionary';
import { normalizeMongoTypeLabel } from '../utils/mongoTypeLabels';
import { useAppLanguage } from '../i18n';

interface Props {
  projectName?: string;
  diagramSheetName?: string;
  diagramSheetId?: string;
  models: Model[];
  relations: Relation[];
  onUpdateRelations: (relations: Relation[]) => void;
  panelMode?: 'relations' | 'none';
  selectedModelId?: string;
  selectedModelIds?: string[];
  selectedFieldPath?: string;
  selectedFieldPaths?: string[];
  onSelectModel?: (modelId: string, options?: { append?: boolean; toggle?: boolean }) => void;
  onSelectField?: (modelId: string, fieldPath: string, options?: { append?: boolean; toggle?: boolean }) => void;
  onOpenContextMenu?: (payload: { clientX: number; clientY: number; modelId: string | null; fieldPath: string | null }) => void;
  emptyStateMessage?: string;
  initialModelPositions?: Record<string, DiagramModelPosition>;
  onModelPositionsChange?: (positions: Record<string, DiagramModelPosition>) => void;
  fieldSearchQuery?: string;
  activeSearchMatch?: { modelId: string; fieldPath: string; sequence: number } | null;
  canUndo?: boolean;
  onUndo?: () => void;
  onExportPdfReady?: (exporter: ((format: 'pdf' | 'png') => Promise<{ base64: string; fileName: string }> | null) | null) => void;
}

interface Position {
  x: number;
  y: number;
}

interface BoxPosition extends Position {
  width: number;
  height: number;
}

interface FieldAnchor {
  leftX: number;
  rightX: number;
  y: number;
}

interface FieldDisplay {
  field: Field;
  depth: number;
  isNested: boolean;
  path: string;
}

interface RelationDraft {
  fromModelId: string;
  fromFieldPath: string;
  toModelId: string;
  toFieldPath: string;
  label: string;
  type: Relation['type'];
}

type InteractionMode = 'select' | 'move' | 'pan';

const RELATION_COLORS: Record<Relation['type'], string> = {
  'one-to-one': '#38bdf8',
  'one-to-many': '#a78bfa',
  'many-to-one': '#34d399',
  'many-to-many': '#f59e0b'
};

const RELATION_LABELS: Record<Relation['type'], string> = {
  'one-to-one': '1:1',
  'one-to-many': '1:N',
  'many-to-one': 'N:1',
  'many-to-many': 'N:N'
};

const MODEL_WIDTH = 320;
const MODEL_HEADER_HEIGHT = 40;
const MODEL_ROW_HEIGHT = 24;
const MODEL_BASE_PADDING = 10;
const MODEL_COLUMN_GAP = 120;
const MODEL_ROW_GAP = 84;
const MODEL_OVERLAP_X_GAP = 52;
const MODEL_OVERLAP_Y_GAP = 64;
const DIAGRAM_VIEW_PADDING = 120;
const DIAGRAM_VIEW_EDGE_PADDING = 40;
const DIAGRAM_EXPORT_TIGHT_PADDING = 36;
const DIAGRAM_EXPORT_SCALE = 2;
const PDF_MAX_PAGE_SIZE_PT = 14400;
const PDF_PT_PER_PX = 96 / 72;

export default function DiagramViewer({
  projectName = 'diagram',
  diagramSheetName = '',
  diagramSheetId,
  models,
  relations,
  onUpdateRelations,
  panelMode = 'relations',
  selectedModelId,
  selectedModelIds = [],
  selectedFieldPath,
  selectedFieldPaths = [],
  onSelectModel,
  onSelectField,
  onOpenContextMenu,
  emptyStateMessage,
  initialModelPositions,
  onModelPositionsChange,
  fieldSearchQuery = '',
  activeSearchMatch = null,
  canUndo = false,
  onUndo,
  onExportPdfReady
}: Props) {
  const { language } = useAppLanguage();
  const copy =
    language === 'es'
      ? {
          indexes: 'Índices',
          selectCollections: 'Seleccionar colecciones',
          moveCollections: 'Mover colecciones',
          panCanvas: 'Mover lienzo',
          zoomIn: 'Acercar',
          zoomOut: 'Alejar',
          resetView: 'Restablecer vista',
          exportImage: 'Exportar como imagen',
          exportPdf: 'Exportar como PDF',
          empty: 'No hay colecciones para mostrar. Crea primero un modelo de MongoDB.',
          mode: 'Modo',
          select: 'Seleccionar',
          move: 'Mover',
          pan: 'Mano',
          clickCollection: 'Haz clic en una colección para seleccionarla.',
          dragCollections: 'Arrastra las colecciones para colocarlas donde quieras.',
          dragCanvas: 'Arrastra para moverte por el lienzo sin mover colecciones.',
          selectBothCollections: 'Selecciona las dos colecciones para crear la relación.',
          selectBothFields: 'Selecciona los dos campos de la relación.',
          differentEndpoints: 'Elige dos extremos distintos para la relación.',
          relationsTitle: 'Relaciones entre colecciones',
          relationsDescription: 'Elige exactamente los campos que quieres conectar y el diagrama dibujará la línea sobre esos atributos.',
          hideRelations: 'Ocultar panel de relaciones',
          createRelation: 'Crear relación',
          createRelationDescription: 'Selecciona ambos extremos y el tipo de relación. La línea quedará anclada a esos campos.',
          fromCollection: 'Colección origen',
          fromField: 'Campo origen',
          toCollection: 'Colección destino',
          toField: 'Campo destino',
          relationType: 'Tipo de relación',
          relationLabel: 'Etiqueta',
          relationPlaceholder: 'Etiqueta opcional para la relación',
          addRelation: 'Añadir relación',
          savedRelations: 'Relaciones guardadas',
          noManualRelations: 'Todavía no hay relaciones manuales.',
          manualRelationsCount: (count: number, scope: 'diagram' | 'workspace') =>
            `${count} relación${count === 1 ? '' : 'es'} manual${count === 1 ? '' : 'es'} en ${scope === 'diagram' ? 'este diagrama' : 'este espacio'}.`,
          unknown: 'Desconocido',
          fieldFallback: '(campo)',
          showRelations: 'Mostrar panel de relaciones',
          relationsShort: 'Relaciones',
          undo: 'Deshacer'
        }
      : {
          indexes: 'Indexes',
          selectCollections: 'Select collections',
          moveCollections: 'Move collections',
          panCanvas: 'Pan canvas',
          zoomIn: 'Zoom In',
          zoomOut: 'Zoom Out',
          resetView: 'Reset View',
          exportImage: 'Export as Image',
          exportPdf: 'Export as PDF',
          empty: 'No models to display. Create a MongoDB model first.',
          mode: 'Mode',
          select: 'Select',
          move: 'Move',
          pan: 'Pan',
          clickCollection: 'Click a collection to select it.',
          dragCollections: 'Drag collections to place them where you want.',
          dragCanvas: 'Drag to move across the canvas without moving collections.',
          selectBothCollections: 'Select both collections to create a relation.',
          selectBothFields: 'Select both fields for the relation.',
          differentEndpoints: 'Choose two different relation endpoints.',
          relationsTitle: 'Collection Relations',
          relationsDescription: 'Choose the exact fields you want to connect and the diagram will paint the line on those attributes.',
          hideRelations: 'Hide relations panel',
          createRelation: 'Create Relation',
          createRelationDescription: 'Select both endpoints and the relation type. The line will be anchored to those exact fields.',
          fromCollection: 'From Collection',
          fromField: 'From Field',
          toCollection: 'To Collection',
          toField: 'To Field',
          relationType: 'Relation Type',
          relationLabel: 'Label',
          relationPlaceholder: 'Optional label for the relation',
          addRelation: 'Add relation',
          savedRelations: 'Saved Relations',
          noManualRelations: 'No manual relations yet.',
          manualRelationsCount: (count: number, scope: 'diagram' | 'workspace') =>
            `${count} manual relation${count === 1 ? '' : 's'} in this ${scope}.`,
          unknown: 'Unknown',
          fieldFallback: '(field)',
          showRelations: 'Show relations panel',
          relationsShort: 'Relations',
          undo: 'Undo'
        };
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const viewportSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const fieldAnchorsRef = useRef<Map<string, FieldAnchor>>(new Map());
  const [modelPositions, setModelPositions] = useState<Map<string, BoxPosition>>(() =>
    buildResolvedModelPositions(models, initialModelPositions)
  );
  const modelPositionsRef = useRef<Map<string, BoxPosition>>(new Map());
  const [dragging, setDragging] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Position>({ x: 0, y: 0 });
  const [panScrollOrigin, setPanScrollOrigin] = useState<Position>({ x: 0, y: 0 });
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  const [viewportVersion, setViewportVersion] = useState(0);
  const [forcePaintVersion, setForcePaintVersion] = useState(0);
  const [relationDraft, setRelationDraft] = useState<RelationDraft>({
    fromModelId: '',
    fromFieldPath: '',
    toModelId: '',
    toFieldPath: '',
    label: '',
    type: 'one-to-many'
  });
  const [isRelationsPanelOpen, setIsRelationsPanelOpen] = useState(false);
  const pointerDragRef = useRef<{
    draggingModelIds: string[];
    pointerId: number | null;
    originCanvasPoint: Position | null;
    originPositions: Map<string, BoxPosition>;
  }>({ draggingModelIds: [], pointerId: null, originCanvasPoint: null, originPositions: new Map() });
  const floatingButtonSx = {
    bgcolor: 'rgba(255,255,255,0.96)',
    color: '#0f172a',
    border: '1px solid rgba(148,163,184,0.35)',
    boxShadow: '0 10px 25px rgba(15,23,42,0.18)',
    '&:hover': {
      bgcolor: '#ffffff'
    }
  };
  const activeFloatingButtonSx = {
    ...floatingButtonSx,
    bgcolor: '#0f172a',
    color: '#f8fafc',
    border: '1px solid rgba(56,189,248,0.55)',
    boxShadow: '0 10px 25px rgba(8,145,178,0.28)',
    '&:hover': {
      bgcolor: '#0f172a'
    }
  };
  const selectedModelIdSet = new Set(selectedModelIds);
  const selectedFieldPathSet = new Set(selectedFieldPaths);

  const getRenderableBoxes = () => {
    const boxes = new Map<string, BoxPosition>();
    const fallbackLayout = buildAutoLayoutPositions(models);

    models.forEach((model) => {
      const pos = modelPositions.get(model.id);
      const fallbackPos = fallbackLayout.get(model.id);

      const nextPos = pos || {
        x: fallbackPos?.x ?? DIAGRAM_VIEW_EDGE_PADDING,
        y: fallbackPos?.y ?? DIAGRAM_VIEW_EDGE_PADDING,
        width: MODEL_WIDTH,
        height: getModelHeight(model)
      };

      boxes.set(model.id, {
        ...nextPos,
        width: nextPos.width || MODEL_WIDTH,
        height: getModelHeight(model)
      });
    });

    return boxes;
  };

  const getDiagramLayout = () => {
    const renderBoxes = getRenderableBoxes();
    const bounds = getInteractiveDiagramBounds(renderBoxes, DIAGRAM_VIEW_PADDING);
    const viewportWidth = scrollContainerRef.current?.clientWidth || 0;
    const viewportHeight = scrollContainerRef.current?.clientHeight || 0;

    return {
      renderBoxes,
      bounds,
      stageWidth: Math.max(Math.ceil(bounds.width * zoom), viewportWidth),
      stageHeight: Math.max(Math.ceil(bounds.height * zoom), viewportHeight)
    };
  };

  const { renderBoxes, bounds, stageWidth, stageHeight } = getDiagramLayout();

  useEffect(() => {
    if (!diagramSheetId || models.length === 0) {
      return;
    }
    requestAnimationFrame(() => {
      handleResetView(true);
      setViewportVersion((currentVersion) => currentVersion + 1);
      setForcePaintVersion((currentVersion) => currentVersion + 1);
    });
  }, [diagramSheetId, models.length]);

  useEffect(() => {
    if (!diagramSheetId || models.length === 0) {
      return;
    }

    const timers: number[] = [];
    [0, 50, 120, 220].forEach((delayMs) => {
      timers.push(
        window.setTimeout(() => {
          setViewportVersion((currentVersion) => currentVersion + 1);
          setForcePaintVersion((currentVersion) => currentVersion + 1);
        }, delayMs)
      );
    });

    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [diagramSheetId, models.length]);

  useLayoutEffect(() => {
    const nextPositions = buildResolvedModelPositions(models, initialModelPositions);
    modelPositionsRef.current = nextPositions;
    setModelPositions((currentPositions) =>
      areBoxPositionMapsEqual(currentPositions, nextPositions) ? currentPositions : nextPositions
    );
  }, [models, initialModelPositions]);

  useEffect(() => {
    if (!diagramSheetId) {
      return;
    }
    setZoom(1);
  }, [diagramSheetId]);

  useEffect(() => {
    if (!onModelPositionsChange || dragging || isPanning) {
      return;
    }

    onModelPositionsChange(serializeModelPositions(modelPositions, models));
  }, [dragging, isPanning, modelPositions, models, onModelPositionsChange]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      const nextWidth = container.clientWidth;
      const nextHeight = container.clientHeight;
      const prev = viewportSizeRef.current;
      if (Math.abs(prev.width - nextWidth) <= 1 && Math.abs(prev.height - nextHeight) <= 1) {
        return;
      }

      viewportSizeRef.current = { width: nextWidth, height: nextHeight };
      if (!dragging && !isPanning) {
        setViewportVersion((currentVersion) => currentVersion + 1);
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [dragging, isPanning]);


  useEffect(() => {
    if (dragging || isPanning) {
      return;
    }

    setViewportVersion((currentVersion) => currentVersion + 1);
  }, [dragging, isPanning]);

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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderScale = Math.max(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(stageWidth * renderScale);
    canvas.height = Math.floor(stageHeight * renderScale);
    canvas.style.width = `${stageWidth}px`;
    canvas.style.height = `${stageHeight}px`;
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    ctx.clearRect(0, 0, stageWidth, stageHeight);
    paintDiagramBackground(ctx, stageWidth, stageHeight);

    fieldAnchorsRef.current = new Map();

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-Math.round(bounds.minX), -Math.round(bounds.minY));
    models.forEach((model) => {
      drawModel(ctx, model, renderBoxes, fieldAnchorsRef.current);
    });

    drawConnections(ctx, renderBoxes, fieldAnchorsRef.current);

    ctx.restore();
  }, [
    models,
    modelPositions,
    zoom,
    relations,
    selectedModelId,
    selectedModelIds,
    selectedFieldPath,
    selectedFieldPaths,
    fieldSearchQuery,
    stageWidth,
    stageHeight,
    bounds.minX,
    bounds.minY,
    viewportVersion,
    forcePaintVersion
  ]);

  useEffect(() => {
    if (!activeSearchMatch) {
      return;
    }

    const timer = window.setTimeout(() => {
      focusFieldInViewport(activeSearchMatch.modelId, activeSearchMatch.fieldPath);
    }, 30);

    return () => window.clearTimeout(timer);
  }, [activeSearchMatch, bounds.minX, bounds.minY, zoom, viewportVersion]);

  const drawModel = (
    ctx: CanvasRenderingContext2D,
    model: Model,
    renderBoxes: Map<string, BoxPosition>,
    anchorStore: Map<string, FieldAnchor>
  ) => {
    const pos = renderBoxes.get(model.id);
    if (!pos) return;
    const px = (value: number) => Math.round(value);
    const linePx = (value: number) => Math.round(value) + 0.5;
    const x = px(pos.x);
    const yBase = px(pos.y);
    const width = px(pos.width);

    const expandedFields = expandFields(model.fields);
    const headerHeight = MODEL_HEADER_HEIGHT;
    const rowHeight = MODEL_ROW_HEIGHT;
    const indexSectionHeight = model.indexes && model.indexes.length > 0 ? 30 + model.indexes.length * 20 : 0;
    const height = headerHeight + expandedFields.length * rowHeight + MODEL_BASE_PADDING + indexSectionHeight;
    const isSelected = selectedModelIdSet.size > 0 ? selectedModelIdSet.has(model.id) : selectedModelId === model.id;

    ctx.fillStyle = isSelected ? '#555a66' : '#4a4a4a';
    ctx.fillRect(x, yBase, width, height);

    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 2;
    ctx.strokeRect(linePx(x), linePx(yBase), width, height);

    if (isSelected) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.strokeRect(linePx(x - 2), linePx(yBase - 2), width + 3, height + 3);
    }

    ctx.fillStyle = isSelected ? '#0891b2' : '#3b82f6';
    ctx.fillRect(x, yBase, width, headerHeight);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(model.name, x + 12, yBase + 25);

    expandedFields.forEach(({ field, depth, isNested, path }, index) => {
      const y = px(yBase + headerHeight + index * rowHeight + 17);
      const indent = depth * 20;
      const anchorKey = buildFieldKey(model.id, path);
      const highlightColors = getHighlightColorsForField(relations, model.id, path);
      const isSelectedField = isSelected && (selectedFieldPathSet.size > 0 ? selectedFieldPathSet.has(path) : selectedFieldPath === path);
      const normalizedQuery = fieldSearchQuery.trim().toLowerCase();
      const isSearchMatch =
        normalizedQuery.length > 0 &&
        (path.toLowerCase().includes(normalizedQuery) || (field.name || '').toLowerCase().includes(normalizedQuery));

      anchorStore.set(anchorKey, {
        leftX: x + 4,
        rightX: x + width - 4,
        y
      });

      if (isSelectedField) {
        ctx.fillStyle = 'rgba(14, 165, 233, 0.45)';
        ctx.fillRect(x + 1, y - 14, width - 2, rowHeight - 2);
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.98)';
        ctx.lineWidth = 2;
        ctx.strokeRect(linePx(x + 1), linePx(y - 14), width - 3, rowHeight - 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 1, y - 14, 5, rowHeight - 2);
      }
      if (isSearchMatch && !isSelectedField) {
        ctx.fillStyle = 'rgba(250, 204, 21, 0.32)';
        ctx.fillRect(x + 2, y - 14, width - 4, rowHeight - 2);
      }

      if (highlightColors.length > 0) {
        highlightColors.slice(0, 3).forEach((color, colorIndex) => {
          ctx.fillStyle = color;
          ctx.fillRect(x + 4 + colorIndex * 5, y - 11, 4, rowHeight - 4);
        });
      }

      if (isNested) {
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(linePx(x + 10 + indent - 12), linePx(y - 10));
        ctx.lineTo(linePx(x + 10 + indent - 12), linePx(y - 2));
        ctx.lineTo(linePx(x + 10 + indent - 4), linePx(y - 2));
        ctx.stroke();
      }

      ctx.fillStyle = '#e5e7eb';
      ctx.font = '12px monospace';
      ctx.fillText(field.name || '(unnamed)', x + 12 + indent, y);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(getDiagramFieldTypeLabel(field), x + width - (field.required ? 42 : 12), y);
      ctx.textAlign = 'left';

      if (field.required) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('NN', x + width - 32, y);
      }
    });

    if (model.indexes && model.indexes.length > 0) {
      const indexY = px(yBase + headerHeight + expandedFields.length * rowHeight + 15);

      ctx.strokeStyle = '#666666';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(linePx(x + 12), linePx(indexY));
      ctx.lineTo(linePx(x + width - 12), linePx(indexY));
      ctx.stroke();

      ctx.fillStyle = '#9ca3af';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(copy.indexes, x + 12, indexY + 15);

      model.indexes.forEach((index, indexNumber) => {
        const idxY = indexY + 30 + indexNumber * 20;
        ctx.fillStyle = '#a78bfa';
        ctx.font = '10px monospace';

        let indexLabel = index.name;
        if (index.type === 'wildcard') indexLabel += ' [W]';
        if (index.type === 'atlas_search') indexLabel += ' [S]';
        if (index.unique) indexLabel += ' [U]';

        ctx.fillText(indexLabel, x + 12, px(idxY));
      });
    }
  };

  const drawConnections = (
    ctx: CanvasRenderingContext2D,
    renderBoxes: Map<string, BoxPosition>,
    anchorStore: Map<string, FieldAnchor>
  ) => {
    drawAutomaticConnections(ctx, renderBoxes, anchorStore);
    drawManualRelations(ctx, renderBoxes, anchorStore);
  };

  const drawAutomaticConnections = (
    ctx: CanvasRenderingContext2D,
    renderBoxes: Map<string, BoxPosition>,
    anchorStore: Map<string, FieldAnchor>
  ) => {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    models.forEach((model) => {
      const references = findAllReferences(model.fields);

      references.forEach(({ ref, fieldPath }) => {
        const targetModel = models.find((candidate) => candidate.name === ref);
        if (!targetModel) return;

        const sourceAnchor = getFieldAnchor(model.id, fieldPath, anchorStore);
        const targetAnchor = getFieldAnchor(targetModel.id, '_id', anchorStore);
        const sourceBox = renderBoxes.get(model.id);
        const targetBox = renderBoxes.get(targetModel.id);
        if (!sourceBox || !targetBox) return;

        const startX = sourceAnchor?.rightX ?? sourceBox.x + sourceBox.width;
        const startY = sourceAnchor?.y ?? sourceBox.y + sourceBox.height / 2;
        const endX = targetAnchor?.leftX ?? targetBox.x;
        const endY = targetAnchor?.y ?? targetBox.y + targetBox.height / 2;
        const midX = (startX + endX) / 2;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.bezierCurveTo(midX, startY, midX, endY, endX, endY);
        ctx.stroke();

        drawArrowHead(ctx, midX, endY, endX, endY, '#94a3b8');
      });
    });

    ctx.setLineDash([]);
  };

  const drawManualRelations = (
    ctx: CanvasRenderingContext2D,
    renderBoxes: Map<string, BoxPosition>,
    anchorStore: Map<string, FieldAnchor>
  ) => {
    relations.forEach((relation, index) => {
      const sourceBox = renderBoxes.get(relation.fromModelId);
      const targetBox = renderBoxes.get(relation.toModelId);
      if (!sourceBox || !targetBox) return;

      const sourceAnchor = relation.fromFieldPath
        ? getFieldAnchor(relation.fromModelId, relation.fromFieldPath, anchorStore)
        : null;
      const targetAnchor = relation.toFieldPath
        ? getFieldAnchor(relation.toModelId, relation.toFieldPath, anchorStore)
        : null;
      const startX = sourceAnchor?.rightX ?? sourceBox.x + sourceBox.width;
      const startY = sourceAnchor?.y ?? sourceBox.y + sourceBox.height / 2;
      const endX = targetAnchor?.leftX ?? targetBox.x;
      const endY = targetAnchor?.y ?? targetBox.y + targetBox.height / 2;
      const offset = ((index % 5) - 2) * 26;
      const midX = (startX + endX) / 2;
      const labelX = midX;
      const labelY = (startY + endY) / 2 + offset;
      const color = RELATION_COLORS[relation.type];
      const label = `${relation.label || buildDefaultRelationLabel(relation)} (${RELATION_LABELS[relation.type]})`;

      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(midX, startY + offset, midX, endY + offset, endX, endY);
      ctx.stroke();

      drawArrowHead(ctx, midX, endY + offset, endX, endY, color);
      drawRelationLabel(ctx, label, labelX, labelY, color);
    });
  };

  const getFieldAnchor = (modelId: string, fieldPath: string, anchorStore: Map<string, FieldAnchor>) => {
    return anchorStore.get(buildFieldKey(modelId, fieldPath)) || null;
  };

  const focusFieldInViewport = (modelId: string, fieldPath: string) => {
    const container = scrollContainerRef.current;
    const box = renderBoxes.get(modelId);
    const anchor = getFieldAnchor(modelId, fieldPath, fieldAnchorsRef.current);
    if (!container || !box || !anchor) {
      return;
    }

    const anchorX = (anchor.leftX - bounds.minX) * zoom;
    const anchorY = (anchor.y - bounds.minY) * zoom;
    const targetLeft = Math.max(0, anchorX - container.clientWidth / 2 + box.width * zoom * 0.3);
    const targetTop = Math.max(0, anchorY - container.clientHeight / 2);
    container.scrollTo({ left: targetLeft, top: targetTop, behavior: 'smooth' });
  };

  const screenToCanvas = (screenX: number, screenY: number, minX: number, minY: number): Position => {
    return {
      x: screenX / zoom + minX,
      y: screenY / zoom + minY
    };
  };

  const getModelAtCanvasPoint = (x: number, y: number) => {
    for (let index = models.length - 1; index >= 0; index -= 1) {
      const modelId = models[index].id;
      const pos = renderBoxes.get(modelId);
      if (!pos) {
        continue;
      }

      if (x >= pos.x && x <= pos.x + pos.width && y >= pos.y && y <= pos.y + pos.height) {
        return modelId;
      }
    }

    return null;
  };

  const getFieldPathAtCanvasPoint = (modelId: string, x: number, y: number) => {
    const model = models.find((candidate) => candidate.id === modelId);
    const modelBox = renderBoxes.get(modelId);
    if (!model || !modelBox) {
      return null;
    }

    const expandedFields = expandFields(model.fields);
    const fieldRegionTop = modelBox.y + MODEL_HEADER_HEIGHT;
    const fieldRegionBottom = fieldRegionTop + expandedFields.length * MODEL_ROW_HEIGHT;
    if (y < fieldRegionTop || y > fieldRegionBottom) {
      return null;
    }

    if (x < modelBox.x || x > modelBox.x + modelBox.width) {
      return null;
    }

    const rowIndex = Math.floor((y - fieldRegionTop) / MODEL_ROW_HEIGHT);
    if (rowIndex < 0 || rowIndex >= expandedFields.length) {
      return null;
    }

    return expandedFields[rowIndex].path || null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (e.button === 2) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (interactionMode === 'pan' || e.shiftKey || e.button === 1) {
      const container = scrollContainerRef.current;
      setIsPanning(true);
      setPanStart({ x: screenX, y: screenY });
      setPanScrollOrigin({
        x: container?.scrollLeft || 0,
        y: container?.scrollTop || 0
      });
      return;
    }

    const { x, y } = screenToCanvas(screenX, screenY, bounds.minX, bounds.minY);
    const targetModelId = getModelAtCanvasPoint(x, y);
    if (!targetModelId) {
      if (interactionMode === 'select') {
        onSelectModel?.('');
      }
      return;
    }

    const isMultiSelectModifier = e.ctrlKey || e.metaKey;
    const targetFieldPath = getFieldPathAtCanvasPoint(targetModelId, x, y);
    const isFieldInteraction = Boolean(targetFieldPath);

    if (!isFieldInteraction) {
      onSelectModel?.(targetModelId, {
        append: isMultiSelectModifier && !selectedModelIdSet.has(targetModelId),
        toggle: isMultiSelectModifier
      });
    }
    if (targetFieldPath && !isMultiSelectModifier) {
      onSelectField?.(targetModelId, targetFieldPath, {
        append: isMultiSelectModifier && !selectedFieldPathSet.has(targetFieldPath),
        toggle: isMultiSelectModifier
      });
    }
    if (targetFieldPath && isMultiSelectModifier) {
      onSelectField?.(targetModelId, targetFieldPath, {
        append: !selectedFieldPathSet.has(targetFieldPath),
        toggle: true
      });
    }

    const pos = renderBoxes.get(targetModelId);
    if (interactionMode === 'move' && pos) {
      const draggingModelIds =
        selectedModelIdSet.size > 0 && selectedModelIdSet.has(targetModelId) ? Array.from(selectedModelIdSet) : [targetModelId];
      canvas.setPointerCapture(e.pointerId);
      pointerDragRef.current = {
        draggingModelIds,
        pointerId: e.pointerId,
        originCanvasPoint: { x, y },
        originPositions: new Map(
          draggingModelIds
            .map((modelId) => {
              const modelPosition = renderBoxes.get(modelId);
              return modelPosition ? [modelId, { ...modelPosition }] : null;
            })
            .filter((entry): entry is [string, BoxPosition] => entry !== null)
        )
      };
      setDragging(targetModelId);
      e.preventDefault();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (isPanning) {
      const container = scrollContainerRef.current;
      if (container) {
        container.scrollLeft = panScrollOrigin.x - (screenX - panStart.x);
        container.scrollTop = panScrollOrigin.y - (screenY - panStart.y);
      }
      return;
    }

    const activeDraggingModelIds = pointerDragRef.current.draggingModelIds;
    if (activeDraggingModelIds.length === 0 && !dragging) return;

    const { x, y } = screenToCanvas(screenX, screenY, bounds.minX, bounds.minY);
    const originCanvasPoint = pointerDragRef.current.originCanvasPoint;
    if (!originCanvasPoint || pointerDragRef.current.originPositions.size === 0) return;
    const deltaX = x - originCanvasPoint.x;
    const deltaY = y - originCanvasPoint.y;

    setModelPositions((currentPositions) => {
      const nextPositions = new Map(currentPositions);
      pointerDragRef.current.originPositions.forEach((originPosition, modelId) => {
        nextPositions.set(modelId, {
          ...originPosition,
          x: Math.round(Math.max(DIAGRAM_VIEW_EDGE_PADDING, originPosition.x + deltaX)),
          y: Math.round(Math.max(DIAGRAM_VIEW_EDGE_PADDING, originPosition.y + deltaY))
        });
      });
      modelPositionsRef.current = nextPositions;
      return nextPositions;
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && pointerDragRef.current.pointerId !== null && canvas.hasPointerCapture(pointerDragRef.current.pointerId)) {
      canvas.releasePointerCapture(pointerDragRef.current.pointerId);
    }

    pointerDragRef.current = { draggingModelIds: [], pointerId: null, originCanvasPoint: null, originPositions: new Map() };
    setDragging(null);
    setIsPanning(false);

    if (onModelPositionsChange) {
      onModelPositionsChange(serializeModelPositions(modelPositionsRef.current, models));
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!(e.ctrlKey || e.metaKey)) {
      return;
    }

    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((currentZoom) => Math.min(Math.max(currentZoom * delta, 0.1), 3));
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    const canvas = canvasRef.current;
    if (!canvas) {
      onOpenContextMenu?.({ clientX: e.clientX, clientY: e.clientY, modelId: null, fieldPath: null });
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const { x, y } = screenToCanvas(screenX, screenY, bounds.minX, bounds.minY);
    const targetModelId = getModelAtCanvasPoint(x, y);
    const targetFieldPath = targetModelId ? getFieldPathAtCanvasPoint(targetModelId, x, y) : null;

    if (targetModelId && !selectedModelIdSet.has(targetModelId)) {
      onSelectModel?.(targetModelId);
    }

    onOpenContextMenu?.({
      clientX: e.clientX,
      clientY: e.clientY,
      modelId: targetModelId,
      fieldPath: targetFieldPath
    });
  };

  const handleZoomIn = () => {
    setZoom((currentZoom) => Math.min(currentZoom * 1.2, 3));
  };

  const handleZoomOut = () => {
    setZoom((currentZoom) => Math.max(currentZoom / 1.2, 0.1));
  };

  const handleResetView = (immediate = false) => {
    const container = scrollContainerRef.current;
    const boxes = Array.from(renderBoxes.values());

    setZoom(1);

    if (!container || boxes.length === 0) {
      container?.scrollTo({ left: 0, top: 0, behavior: immediate ? 'auto' : 'smooth' });
      return;
    }

    const minX = Math.min(...boxes.map((box) => box.x));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxX = Math.max(...boxes.map((box) => box.x + box.width));
    const maxY = Math.max(...boxes.map((box) => box.y + box.height));
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    const targetLeft = Math.max(0, minX - Math.max(40, (container.clientWidth - contentWidth) / 2));
    const targetTop = Math.max(0, minY - Math.max(40, (container.clientHeight - contentHeight) / 2));

    container.scrollTo({ left: targetLeft, top: targetTop, behavior: immediate ? 'auto' : 'smooth' });
  };

  const buildTightExportCanvas = () => {
    const exportBoxes = getRenderableBoxes();
    if (exportBoxes.size === 0) {
      return null;
    }

    const exportBounds = getDiagramBounds(exportBoxes, DIAGRAM_EXPORT_TIGHT_PADDING);
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = Math.ceil(exportBounds.width * DIAGRAM_EXPORT_SCALE);
    exportCanvas.height = Math.ceil(exportBounds.height * DIAGRAM_EXPORT_SCALE);

    const exportCtx = exportCanvas.getContext('2d');
    if (!exportCtx) {
      return null;
    }

    exportCtx.scale(DIAGRAM_EXPORT_SCALE, DIAGRAM_EXPORT_SCALE);
    paintDiagramBackground(exportCtx, exportBounds.width, exportBounds.height);

    const exportAnchors = new Map<string, FieldAnchor>();

    exportCtx.save();
    exportCtx.translate(-exportBounds.minX, -exportBounds.minY);

    models.forEach((model) => {
      drawModel(exportCtx, model, exportBoxes, exportAnchors);
    });

    drawConnections(exportCtx, exportBoxes, exportAnchors);
    exportCtx.restore();

    return {
      canvas: exportCanvas,
      bounds: exportBounds,
      renderBoxes: exportBoxes
    };
  };

  const exportToImage = () => {
    const exportAsset = buildTightExportCanvas();
    if (!exportAsset) return;

    const link = document.createElement('a');
    link.download = `${buildExportBaseName(projectName, diagramSheetName)}.png`;
    exportAsset.canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }, 'image/png');
  };

  const exportToPDF = () => {
    const exportAsset = buildTightExportCanvas();
    if (!exportAsset) return;
    const exportCanvas = exportAsset.canvas;

    const largestLogicalSide = Math.max(exportAsset.bounds.width, exportAsset.bounds.height);
    const maxPageScale = PDF_MAX_PAGE_SIZE_PT / (PDF_PT_PER_PX * largestLogicalSide);
    const pdfScale = Math.min(DIAGRAM_EXPORT_SCALE, maxPageScale);
    const pageWidth = Math.ceil(exportAsset.bounds.width * pdfScale);
    const pageHeight = Math.ceil(exportAsset.bounds.height * pdfScale);

    const pdf = new jsPDF({
      orientation: pageWidth >= pageHeight ? 'landscape' : 'portrait',
      unit: 'px',
      format: [pageWidth, pageHeight],
      compress: true
    });
    writeSearchableDiagramTextToPdf(pdf, {
      models,
      renderBoxes: exportAsset.renderBoxes,
      bounds: exportAsset.bounds,
      scale: pdfScale
    });
    pdf.addImage(exportCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');

    pdf.save(`${buildExportBaseName(projectName, diagramSheetName)}.pdf`);
  };

  useEffect(() => {
    if (!onExportPdfReady) return;
    const exporter = async (format: 'pdf' | 'png'): Promise<{ base64: string; fileName: string } | null> => {
      const exportAsset = buildTightExportCanvas();
      if (!exportAsset) return null;
      const exportCanvas = exportAsset.canvas;
      const fileName = `${buildExportBaseName(projectName, diagramSheetName)}.${format}`;

      if (format === 'png') {
        const base64 = exportCanvas.toDataURL('image/png').split(',')[1] || '';
        return { base64, fileName };
      }

      const largestLogicalSide = Math.max(exportAsset.bounds.width, exportAsset.bounds.height);
      const maxPageScale = PDF_MAX_PAGE_SIZE_PT / (PDF_PT_PER_PX * largestLogicalSide);
      const pdfScale = Math.min(DIAGRAM_EXPORT_SCALE, maxPageScale);
      const pageWidth = Math.ceil(exportAsset.bounds.width * pdfScale);
      const pageHeight = Math.ceil(exportAsset.bounds.height * pdfScale);

      const pdf = new jsPDF({
        orientation: pageWidth >= pageHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [pageWidth, pageHeight],
        compress: true
      });
      writeSearchableDiagramTextToPdf(pdf, {
        models,
        renderBoxes: exportAsset.renderBoxes,
        bounds: exportAsset.bounds,
        scale: pdfScale
      });
      pdf.addImage(exportCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');

      const base64 = pdf.output('datauristring').split(',')[1] || '';
      return { base64, fileName };
    };
    onExportPdfReady((format) => exporter(format));
    return () => onExportPdfReady(null);
  }, [onExportPdfReady, models, projectName, diagramSheetName]);

  const handleAddRelation = () => {
    if (!relationDraft.fromModelId || !relationDraft.toModelId) {
      alert(copy.selectBothCollections);
      return;
    }

    if (!relationDraft.fromFieldPath || !relationDraft.toFieldPath) {
      alert(copy.selectBothFields);
      return;
    }

    if (relationDraft.fromModelId === relationDraft.toModelId && relationDraft.fromFieldPath === relationDraft.toFieldPath) {
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

  const fromFieldOptions = getFieldOptions(relationDraft.fromModelId, models);
  const toFieldOptions = getFieldOptions(relationDraft.toModelId, models);
  const showRelationsPanel = panelMode === 'relations';
  const canvasCursorClass = isPanning
    ? 'cursor-grabbing'
    : interactionMode === 'pan'
      ? 'cursor-grab'
      : interactionMode === 'move'
        ? dragging
          ? 'cursor-grabbing'
          : 'cursor-move'
        : interactionMode === 'select'
          ? 'cursor-pointer'
          : 'cursor-default';

  return (
    <div className="h-full w-full bg-gradient-to-br from-gray-800 via-gray-700 to-gray-900 overflow-hidden flex">
      {showRelationsPanel && (
        <div
          className={`shrink-0 border-r border-white/10 bg-slate-950/45 backdrop-blur transition-[width] duration-200 ${
            isRelationsPanelOpen ? 'w-[27rem]' : 'w-20'
          }`}
        >
          {isRelationsPanelOpen ? (
            <div className="h-full overflow-auto p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">{copy.relationsTitle}</h3>
                  <p className="text-xs text-slate-300 mt-1 leading-5">
                    {copy.relationsDescription}
                  </p>
                </div>
                <Tooltip title={copy.hideRelations}>
                  <IconButton onClick={() => setIsRelationsPanelOpen(false)} size="small" sx={floatingButtonSx}>
                    <ChevronLeft className="w-5 h-5" />
                  </IconButton>
                </Tooltip>
              </div>

              <Paper className="!rounded-2xl !bg-white/95 !shadow-2xl">
                <div className="p-4 space-y-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {copy.createRelation}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      {copy.createRelationDescription}
                    </div>
                  </div>

                  <FormControl fullWidth size="small">
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

                  <FormControl fullWidth size="small">
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

                  <FormControl fullWidth size="small">
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

                  <FormControl fullWidth size="small">
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

                  <FormControl fullWidth size="small">
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
                    label={copy.relationLabel}
                    size="small"
                    fullWidth
                    value={relationDraft.label}
                    onChange={(e) =>
                      setRelationDraft((currentDraft) => ({
                        ...currentDraft,
                        label: e.target.value
                      }))
                    }
                    placeholder={copy.relationPlaceholder}
                  />

                  <Button
                    variant="contained"
                    startIcon={<Plus className="w-4 h-4" />}
                    onClick={handleAddRelation}
                    disabled={models.length < 2}
                    fullWidth
                  >
                    {copy.addRelation}
                  </Button>
                </div>
              </Paper>

              <Paper className="!rounded-2xl !bg-white/95 !shadow-2xl">
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {copy.savedRelations}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">
                        {relations.length === 0
                          ? copy.noManualRelations
                          : copy.manualRelationsCount(relations.length, 'diagram')}
                      </div>
                    </div>
                    <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                      {relations.length}
                    </div>
                  </div>

                  {relations.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                      {copy.noManualRelations}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {relations.map((relation) => {
                        const sourceModelName =
                          models.find((model) => model.id === relation.fromModelId)?.name || copy.unknown;
                        const targetModelName =
                          models.find((model) => model.id === relation.toModelId)?.name || copy.unknown;

                        return (
                          <div
                            key={relation.id}
                            className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-slate-900">
                                {relation.label || buildDefaultRelationLabel(relation)}
                              </div>
                              <div className="text-xs text-slate-600 break-words mt-1 leading-5">
                                {sourceModelName}.{relation.fromFieldPath || copy.fieldFallback} {'->'} {targetModelName}.
                                {relation.toFieldPath || copy.fieldFallback} ({RELATION_LABELS[relation.type]})
                              </div>
                            </div>
                            <IconButton size="small" color="error" onClick={() => handleDeleteRelation(relation.id)}>
                              <Trash2 className="w-4 h-4" />
                            </IconButton>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Paper>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center gap-3 py-4 px-2">
              <Tooltip title={copy.showRelations}>
                <IconButton onClick={() => setIsRelationsPanelOpen(true)} size="small" sx={floatingButtonSx}>
                  <ChevronRight className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <div className="text-[11px] uppercase tracking-wide text-slate-300 text-center leading-4">
                {copy.relationsShort}
              </div>
              <div className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-900">
                {relations.length}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-w-0 relative">
        {models.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            {emptyStateMessage || copy.empty}
          </div>
        ) : (
          <>
            <div className="absolute top-4 right-4 z-10 flex gap-2 rounded-2xl border border-white/20 bg-white/10 p-2 shadow-2xl backdrop-blur-md">
              <Tooltip title={copy.selectCollections}>
                <IconButton
                  onClick={() => {
                    setInteractionMode('select');
                    setDragging(null);
                  }}
                  size="small"
                  sx={interactionMode === 'select' ? activeFloatingButtonSx : floatingButtonSx}
                >
                  <MousePointer2 className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copy.moveCollections}>
                <IconButton
                  onClick={() => {
                    setInteractionMode('move');
                    setIsPanning(false);
                  }}
                  size="small"
                  sx={interactionMode === 'move' ? activeFloatingButtonSx : floatingButtonSx}
                >
                  <Move className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copy.panCanvas}>
                <IconButton
                  onClick={() => {
                    setInteractionMode('pan');
                    setDragging(null);
                  }}
                  size="small"
                  sx={interactionMode === 'pan' ? activeFloatingButtonSx : floatingButtonSx}
                >
                  <Hand className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <div className="w-px bg-gray-600 mx-1" />
              <Tooltip title={copy.zoomIn}>
                <IconButton onClick={handleZoomIn} size="small" sx={floatingButtonSx}>
                  <ZoomIn className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copy.zoomOut}>
                <IconButton onClick={handleZoomOut} size="small" sx={floatingButtonSx}>
                  <ZoomOut className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copy.resetView}>
                <IconButton onClick={handleResetView} size="small" sx={floatingButtonSx}>
                  <Maximize className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copy.undo}>
                <span>
                  <IconButton onClick={onUndo} disabled={!canUndo} size="small" sx={floatingButtonSx}>
                    <RotateCcw className="w-5 h-5" />
                  </IconButton>
                </span>
              </Tooltip>
              <div className="w-px bg-gray-600 mx-1" />
              <Tooltip title={copy.exportImage}>
                <IconButton onClick={exportToImage} size="small" sx={floatingButtonSx}>
                  <Download className="w-5 h-5" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copy.exportPdf}>
                <IconButton onClick={exportToPDF} size="small" sx={floatingButtonSx}>
                  <span className="text-xs font-bold">PDF</span>
                </IconButton>
              </Tooltip>
            </div>

            <div className="absolute bottom-4 left-4 z-10 bg-gray-800 px-3 py-2 rounded text-white text-sm">
              {copy.mode}:{' '}
              {interactionMode === 'select' ? copy.select : interactionMode === 'move' ? copy.move : copy.pan} | Zoom:{' '}
              {Math.round(zoom * 100)}% |{' '}
              {interactionMode === 'select'
                ? copy.clickCollection
                : interactionMode === 'move'
                  ? copy.dragCollections
                  : copy.dragCanvas}
            </div>

            <div
              ref={scrollContainerRef}
              className="absolute inset-0 overflow-auto"
              style={{ overflowAnchor: 'none' }}
            >
              <div
                style={{
                  width: `${stageWidth}px`,
                  height: `${stageHeight}px`,
                  minWidth: '100%',
                  minHeight: '100%'
                }}
              >
                <canvas
                  ref={canvasRef}
                  className={`block ${canvasCursorClass}`}
                  style={{
                    width: `${stageWidth}px`,
                    height: `${stageHeight}px`
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onContextMenu={handleContextMenu}
                  onWheel={handleWheel}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function expandFields(fields: Field[], depth = 0, prefix = ''): FieldDisplay[] {
  const result: FieldDisplay[] = [];

  fields.forEach((field) => {
    const isArrayField = Boolean((field as any).isArray) || field.type === 'Array';
    const effectiveType = isArrayField ? field.arrayType || field.type : field.type;
    const path = prefix ? `${prefix}.${field.name}` : field.name;

    result.push({
      field,
      depth,
      isNested: depth > 0,
      path
    });

    if (effectiveType === 'Document' && field.nestedFields && field.nestedFields.length > 0) {
      const nextPrefix = isArrayField ? `${path}[]` : path;
      result.push(...expandFields(field.nestedFields, depth + 1, nextPrefix));
    } else if (field.type === 'Document' && field.nestedFields && field.nestedFields.length > 0) {
      result.push(...expandFields(field.nestedFields, depth + 1, path));
    } else if (field.type === 'Array' && field.arrayType === 'Document' && field.nestedFields && field.nestedFields.length > 0) {
      result.push(...expandFields(field.nestedFields, depth + 1, `${path}[]`));
    }
  });

  return result;
}

function getModelHeight(model: Model) {
  const expandedFields = expandFields(model.fields);
  const indexSectionHeight = model.indexes && model.indexes.length > 0 ? 30 + model.indexes.length * 20 : 0;
  return MODEL_HEADER_HEIGHT + expandedFields.length * MODEL_ROW_HEIGHT + MODEL_BASE_PADDING + indexSectionHeight;
}

function buildAutoLayoutPositions(models: Model[]) {
  const positions = new Map<string, BoxPosition>();
  const cols = Math.max(1, Math.ceil(Math.sqrt(models.length || 1)));
  const rowHeights: number[] = [];

  models.forEach((model, index) => {
    const row = Math.floor(index / cols);
    rowHeights[row] = Math.max(rowHeights[row] || 0, getModelHeight(model));
  });

  const rowOffsets: number[] = [];
  let nextRowY = 100;
  rowHeights.forEach((rowHeight, row) => {
    rowOffsets[row] = nextRowY;
    nextRowY += rowHeight + MODEL_ROW_GAP;
  });

  models.forEach((model, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    positions.set(model.id, {
      x: 100 + col * (MODEL_WIDTH + MODEL_COLUMN_GAP),
      y: rowOffsets[row] || 100,
      width: MODEL_WIDTH,
      height: getModelHeight(model)
    });
  });

  return positions;
}

function buildResolvedModelPositions(
  models: Model[],
  initialModelPositions?: Record<string, DiagramModelPosition>
) {
  const autoLayoutPositions = buildAutoLayoutPositions(models);
  const nextPositions = new Map<string, BoxPosition>();
  const savedModelIds = new Set(Object.keys(initialModelPositions || {}));

  models.forEach((model) => {
    if (!savedModelIds.has(model.id)) {
      return;
    }

    const savedPosition = initialModelPositions?.[model.id];
    if (!savedPosition) {
      return;
    }

    const safeX = Number.isFinite(savedPosition.x) ? savedPosition.x : DIAGRAM_VIEW_EDGE_PADDING;
    const safeY = Number.isFinite(savedPosition.y) ? savedPosition.y : DIAGRAM_VIEW_EDGE_PADDING;

    nextPositions.set(model.id, {
      x: Math.max(DIAGRAM_VIEW_EDGE_PADDING, safeX),
      y: Math.max(DIAGRAM_VIEW_EDGE_PADDING, safeY),
      width: MODEL_WIDTH,
      height: getModelHeight(model)
    });
  });

  models.forEach((model) => {
    if (nextPositions.has(model.id)) {
      return;
    }

    const autoPosition = autoLayoutPositions.get(model.id);
    const candidateBox: BoxPosition = {
      x: autoPosition?.x ?? 100,
      y: autoPosition?.y ?? 100,
      width: MODEL_WIDTH,
      height: getModelHeight(model)
    };

    nextPositions.set(model.id, resolveBoxAgainstExistingBoxes(candidateBox, nextPositions.values()));
  });

  return savedModelIds.size > 0 ? nextPositions : resolveModelPositionOverlaps(models, nextPositions);
}

function areBoxPositionMapsEqual(left: Map<string, BoxPosition>, right: Map<string, BoxPosition>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const [key, leftPosition] of left.entries()) {
    const rightPosition = right.get(key);
    if (
      !rightPosition ||
      leftPosition.x !== rightPosition.x ||
      leftPosition.y !== rightPosition.y ||
      leftPosition.width !== rightPosition.width ||
      leftPosition.height !== rightPosition.height
    ) {
      return false;
    }
  }

  return true;
}

function serializeModelPositions(
  modelPositions: Map<string, BoxPosition>,
  models: Model[]
): Record<string, DiagramModelPosition> {
  const validModelIds = new Set(models.map((model) => model.id));

  return Array.from(modelPositions.entries()).reduce<Record<string, DiagramModelPosition>>((accumulator, [modelId, position]) => {
    if (!validModelIds.has(modelId)) {
      return accumulator;
    }

    accumulator[modelId] = {
      x: position.x,
      y: position.y
    };
    return accumulator;
  }, {});
}

function resolveModelPositionOverlaps(models: Model[], currentPositions: Map<string, BoxPosition>) {
  const autoLayoutPositions = buildAutoLayoutPositions(models);
  const resolved = new Map<string, BoxPosition>();

  const orderedBoxes = models
    .map((model, order) => {
      const current = currentPositions.get(model.id);
      const fallback = autoLayoutPositions.get(model.id);
      const height = getModelHeight(model);

      return {
        id: model.id,
        order,
        box: {
          x: current?.x ?? fallback?.x ?? 100,
          y: current?.y ?? fallback?.y ?? 100,
          width: current?.width ?? MODEL_WIDTH,
          height
        }
      };
    })
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x || a.order - b.order);

  orderedBoxes.forEach(({ id, box }) => {
    resolved.set(id, resolveBoxAgainstExistingBoxes(box, resolved.values()));
  });

  return resolved;
}

function resolveBoxAgainstExistingBoxes(box: BoxPosition, existingBoxes: Iterable<BoxPosition>) {
  const lockedBoxes = Array.from(existingBoxes);
  let nextBox = { ...box };
  let overlaps = true;

  while (overlaps) {
    overlaps = false;

    for (const existingBox of lockedBoxes) {
      if (!boxesOverlapWithGap(nextBox, existingBox)) {
        continue;
      }

      nextBox = {
        ...nextBox,
        y: existingBox.y + existingBox.height + MODEL_ROW_GAP
      };
      overlaps = true;
    }
  }

  return nextBox;
}

function boxesOverlapWithGap(a: BoxPosition, b: BoxPosition) {
  const horizontalOverlap =
    a.x < b.x + b.width + MODEL_OVERLAP_X_GAP && a.x + a.width + MODEL_OVERLAP_X_GAP > b.x;
  const verticalOverlap =
    a.y < b.y + b.height + MODEL_OVERLAP_Y_GAP && a.y + a.height + MODEL_OVERLAP_Y_GAP > b.y;

  return horizontalOverlap && verticalOverlap;
}

function getInteractiveDiagramBounds(renderBoxes: Map<string, BoxPosition>, padding: number) {
  const boxes = Array.from(renderBoxes.values());

  if (boxes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: padding * 2,
      height: padding * 2
    };
  }

  const maxX = Math.max(...boxes.map((box) => box.x + box.width)) + padding;
  const maxY = Math.max(...boxes.map((box) => box.y + box.height)) + padding;
  const minX = 0;
  const minY = 0;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function getDiagramBounds(renderBoxes: Map<string, BoxPosition>, padding: number) {
  const boxes = Array.from(renderBoxes.values());

  if (boxes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: padding * 2,
      height: padding * 2
    };
  }

  const minX = Math.min(...boxes.map((box) => box.x)) - padding;
  const minY = Math.min(...boxes.map((box) => box.y)) - padding;
  const maxX = Math.max(...boxes.map((box) => box.x + box.width)) + padding;
  const maxY = Math.max(...boxes.map((box) => box.y + box.height)) + padding;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function paintDiagramBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1f2937');
  gradient.addColorStop(0.5, '#374151');
  gradient.addColorStop(1, '#111827');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function getFieldOptions(modelId: string, models: Model[]) {
  const model = models.find((candidate) => candidate.id === modelId);
  return model ? flattenModelFields(model) : [];
}

function sanitizeExportName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'diagram';
}

function buildExportBaseName(projectName: string, diagramSheetName: string) {
  const cleanProject = sanitizeExportName(projectName || 'diagram');
  const cleanSheet = sanitizeExportName(diagramSheetName || '');
  const isMainSheet =
    cleanSheet.toLowerCase() === 'main' ||
    cleanSheet.toLowerCase() === 'main diagram' ||
    cleanSheet.toLowerCase() === 'main-diagram' ||
    cleanSheet.toLowerCase() === 'main_diagram';

  return cleanSheet && !isMainSheet ? `${cleanProject}_${cleanSheet}` : cleanProject;
}

function writeSearchableDiagramTextToPdf(
  pdf: jsPDF,
  payload: {
    models: Model[];
    renderBoxes: Map<string, BoxPosition>;
    bounds: { minX: number; minY: number };
    scale: number;
  }
) {
  const scale = payload.scale;

  pdf.setTextColor(255, 255, 255);

  payload.models.forEach((model) => {
    const pos = payload.renderBoxes.get(model.id);
    if (!pos) return;

    const x = (pos.x - payload.bounds.minX) * scale;
    const yBase = (pos.y - payload.bounds.minY) * scale;
    const width = pos.width * scale;
    const expandedFields = expandFields(model.fields);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14 * scale);
    pdf.text(model.name, x + 12 * scale, yBase + 25 * scale, {
      baseline: 'alphabetic'
    });

    expandedFields.forEach(({ field, depth }, index) => {
      const rowY = yBase + (MODEL_HEADER_HEIGHT + index * MODEL_ROW_HEIGHT + 17) * scale;
      const indent = depth * 20 * scale;

      pdf.setFont('courier', 'normal');
      pdf.setFontSize(12 * scale);
      pdf.text(field.name || '(unnamed)', x + 12 * scale + indent, rowY, {
        baseline: 'alphabetic'
      });

      const typeLabel = getDiagramFieldTypeLabel(field);
      const typeX = x + width - (field.required ? 42 * scale : 12 * scale);
      pdf.text(typeLabel, typeX, rowY, {
        align: 'right',
        baseline: 'alphabetic'
      });

      if (field.required) {
        pdf.setFont('courier', 'bold');
        pdf.setFontSize(11 * scale);
        pdf.text('NN', x + width - 32 * scale, rowY, {
          baseline: 'alphabetic'
        });
      }
    });

    if (model.indexes && model.indexes.length > 0) {
      const indexY = yBase + (MODEL_HEADER_HEIGHT + expandedFields.length * MODEL_ROW_HEIGHT + 15) * scale;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11 * scale);
      pdf.text('Indexes', x + 12 * scale, indexY + 15 * scale, {
        baseline: 'alphabetic'
      });

      model.indexes.forEach((index, indexNumber) => {
        const idxY = indexY + (30 + indexNumber * 20) * scale;
        let indexLabel = index.name;
        if (index.type === 'wildcard') indexLabel += ' [W]';
        if (index.type === 'atlas_search') indexLabel += ' [S]';
        if (index.unique) indexLabel += ' [U]';

        pdf.setFont('courier', 'normal');
        pdf.setFontSize(10 * scale);
        pdf.text(indexLabel, x + 12 * scale, idxY, {
          baseline: 'alphabetic'
        });
      });
    }
  });
}

function buildFieldKey(modelId: string, fieldPath: string) {
  return `${modelId}::${fieldPath}`;
}

function findAllReferences(fields: Field[], prefix = ''): Array<{ ref: string; fieldPath: string }> {
  const refs: Array<{ ref: string; fieldPath: string }> = [];

  fields.forEach((field) => {
    const isArrayField = Boolean((field as any).isArray) || field.type === 'Array';
    const effectiveType = isArrayField ? field.arrayType || field.type : field.type;
    const currentPath = prefix ? `${prefix}.${field.name}` : field.name;

    if (field.ref) {
      refs.push({ ref: field.ref, fieldPath: currentPath });
    }
    if (field.arrayRef) {
      refs.push({ ref: field.arrayRef, fieldPath: currentPath });
    }

    if (effectiveType === 'Document' && field.nestedFields) {
      refs.push(...findAllReferences(field.nestedFields, isArrayField ? `${currentPath}[]` : currentPath));
    } else if (field.type === 'Array' && field.arrayType === 'Document' && field.nestedFields) {
      refs.push(...findAllReferences(field.nestedFields, `${currentPath}[]`));
    }
  });

  return refs;
}

function getHighlightColorsForField(relations: Relation[], modelId: string, fieldPath: string) {
  return relations.reduce<string[]>((colors, relation) => {
    const matchesSource = relation.fromModelId === modelId && relation.fromFieldPath === fieldPath;
    const matchesTarget = relation.toModelId === modelId && relation.toFieldPath === fieldPath;

    if (matchesSource || matchesTarget) {
      colors.push(RELATION_COLORS[relation.type]);
    }

    return colors;
  }, []);
}

function buildDefaultRelationLabel(relation: Relation) {
  if (relation.fromFieldPath && relation.toFieldPath) {
    return `${relation.fromFieldPath} to ${relation.toFieldPath}`;
  }
  return 'Field relation';
}

function getDiagramFieldTypeLabel(field: Field) {
  const isArrayField = Boolean((field as any).isArray) || field.type === 'Array';
  const effectiveType = isArrayField ? field.arrayType || field.type : field.type;
  let typeLabel = effectiveType.toLowerCase();

  if (!isArrayField && effectiveType === 'Mixed' && field.bsonTypes?.length) {
    typeLabel = field.bsonTypes.map((type) => type.toLowerCase()).join('|');
  }

  if (isArrayField) {
    typeLabel = effectiveType === 'Document' ? 'object[]' : `${effectiveType.toLowerCase()}[]`;
  } else if (effectiveType === 'Document') {
    typeLabel = 'object';
  }

  if (field.nullable && field.type !== 'Null') {
    typeLabel += '|null';
  }

  return normalizeMongoTypeLabel(typeLabel);
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  color: string
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const arrowSize = 8;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - arrowSize * Math.cos(angle - Math.PI / 6),
    toY - arrowSize * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - arrowSize * Math.cos(angle + Math.PI / 6),
    toY - arrowSize * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

function drawRelationLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  color: string
) {
  ctx.font = '11px sans-serif';
  const textWidth = ctx.measureText(label).width;
  const paddingX = 8;

  ctx.fillStyle = 'rgba(17, 24, 39, 0.92)';
  ctx.fillRect(x - textWidth / 2 - paddingX, y - 12, textWidth + paddingX * 2, 22);

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - textWidth / 2 - paddingX, y - 12, textWidth + paddingX * 2, 22);

  ctx.fillStyle = '#f9fafb';
  ctx.fillText(label, x - textWidth / 2, y + 3);
}
