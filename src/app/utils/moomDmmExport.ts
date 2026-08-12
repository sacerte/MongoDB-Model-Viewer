import type { Field, Index, Model } from '../components/MongoModelBuilder';
import type { DiagramSheet, ProjectData, Relation } from './projectBundle';

interface DmmColumn {
  id: string;
  name: string;
  datatype: string;
  param: string;
  pk: boolean;
  nn: boolean;
  list: boolean;
  comment: string;
  data: string;
  enum: string;
  validation: string;
  pattern: boolean;
  estimatedSize: string;
  any: string;
  fk: boolean;
  collation: string;
}

interface DmmKeyColumn {
  id: string;
  colid: string;
}

interface DmmKey {
  id: string;
  name: string;
  isPk: boolean;
  cols: DmmKeyColumn[];
}

interface DmmIndex {
  id: string;
  name: string;
  unique: boolean;
  columns: Array<{
    id: string;
    colid: string;
    order: 'Ascending' | 'Descending';
  }>;
  sparse: boolean;
  type: string;
  code: string;
}

interface DmmTable {
  id: string;
  visible: boolean;
  name: string;
  desc: string;
  estimatedSize: string;
  cols: DmmColumn[];
  relations: string[];
  lines: string[];
  keys: DmmKey[];
  indexes: DmmIndex[];
  embeddable: boolean;
  generate: boolean;
  generateCustomCode: boolean;
  customCode: string;
  beforeScript: string;
  afterScript: string;
  validationLevel: string;
  validationAction: string;
  collation: string;
  others: string;
  size: string;
  max: string;
  validation: string;
  capped: boolean;
}

interface DmmDiagramItem {
  referencedItemId: string;
  x: number;
  y: number;
  gHeight: number;
  gWidth: number;
  color: string;
  background: string;
  resized: boolean;
  autoExpand: boolean;
  backgroundOpacity: string;
  collapsed: boolean;
}

interface DmmDiagram {
  name: string;
  description: string;
  id: string;
  keysgraphics: boolean;
  linegraphics: string;
  zoom: number;
  background: string;
  lineColor: string;
  isOpen: boolean;
  main: boolean;
  diagramItems: Record<string, DmmDiagramItem>;
  scroll: { x: number; y: number };
  type: 'erd';
  showHorizontal: boolean;
  showDescriptions: boolean;
  showIndicators: boolean;
  showProgress: boolean;
  lineWidth: string;
  boxSize: string;
  boxSpacing: string;
  boxAlign: string;
  showIndicatorCaptions: boolean;
  showEstimatedSize: boolean;
  showSchemaContainer: boolean;
  showEmbeddedInParents: boolean;
  showCardinalityCaptions: boolean;
  showRelationshipNames: boolean;
  showLineCaptions: boolean;
  showColumns: boolean;
  showColumnDataTypes: boolean;
  showSampleData: boolean;
  showTableIndexes: boolean;
  showTableDescriptions: boolean;
  showRelations: boolean;
  backgroundImage: string;
  descriptionsColor: string;
  embeddedSpacing: string;
  showMainIcon: boolean;
  showLabels: boolean;
  showCustomizations: boolean;
  embeddedDisplayMode: string;
}

interface DmmExport {
  tables: Record<string, DmmTable>;
  relations: Record<string, never>;
  notes: Record<string, never>;
  lines: Record<string, never>;
  model: {
    name: string;
    id: string;
    activeDiagram: string;
    desc: string;
    path: string;
    type: 'MONGODB';
    version: number;
    parentTableInFkCols: boolean;
    caseConvention: string;
    replaceSpace: string;
    color: string;
    sideSelections: boolean;
    isDirty: boolean;
    storedin: { major: number; minor: number; extra: number };
    laststoredin: { major: number; minor: number; extra: number };
    writeFileParam: boolean;
    authorName: string;
    companyDetails: string;
    companyUrl: string;
    def_coltopk: boolean;
    def_validationLevel: string;
    def_validationAction: string;
    def_collation: string;
    def_others: string;
    connectionVersion: string;
    modelPdfReportPath: string;
    modelScriptsDir: string;
    lastSaved: number;
  };
  otherObjects: Record<string, never>;
  diagrams: Record<string, DmmDiagram>;
  diagramsOrder: string[];
  order: string[];
  collapsedTreeItems: string[];
  reverseStats: Record<string, never>;
}

interface BuildContext {
  tables: Record<string, DmmTable>;
  tableIdsByPath: Map<string, string>;
}

const DMM_VERSION = { major: 9, minor: 0, extra: 0 };
const ROOT_TYPES = new Set([
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
  'Mixed',
  'Null'
]);

export function buildMoomDmmExport(
  projectName: string,
  models: Model[],
  relations: Relation[] = [],
  diagramSheets: DiagramSheet[] = [],
  currentProject?: ProjectData | null
) {
  const context: BuildContext = {
    tables: {},
    tableIdsByPath: new Map()
  };
  const modelIdToTableId = new Map<string, string>();

  models.forEach((model) => {
    const tableId = createId();
    modelIdToTableId.set(model.id, tableId);
    context.tableIdsByPath.set(`model:${model.id}`, tableId);
    context.tables[tableId] = buildTable(model.name, false, model.fields, `model:${model.id}`, context, model.indexes);
  });

  const diagrams = buildDiagrams(models, diagramSheets, modelIdToTableId, currentProject);
  const activeDiagram = diagrams[0]?.id || createId();
  const safeProjectName = projectName?.trim() || currentProject?.name?.trim() || 'Untitled';

  return {
    tables: context.tables,
    relations: buildRelationsPlaceholder(relations),
    notes: {},
    lines: {},
    model: {
      name: safeProjectName,
      id: currentProject?.id || createId(),
      activeDiagram,
      desc: '',
      path: '',
      type: 'MONGODB',
      version: 1,
      parentTableInFkCols: true,
      caseConvention: 'under',
      replaceSpace: '_',
      color: 'transparent',
      sideSelections: true,
      isDirty: true,
      storedin: DMM_VERSION,
      laststoredin: DMM_VERSION,
      writeFileParam: false,
      authorName: '',
      companyDetails: '',
      companyUrl: '',
      def_coltopk: true,
      def_validationLevel: 'na',
      def_validationAction: 'na',
      def_collation: '',
      def_others: '',
      connectionVersion: '',
      modelPdfReportPath: '',
      modelScriptsDir: '',
      lastSaved: Date.now()
    },
    otherObjects: {},
    diagrams: Object.fromEntries(diagrams.map((diagram) => [diagram.id, diagram])),
    diagramsOrder: diagrams.map((diagram) => diagram.id),
    order: [],
    collapsedTreeItems: [],
    reverseStats: {}
  } satisfies DmmExport;
}

function buildTable(
  name: string,
  embeddable: boolean,
  fields: Field[],
  pathKey: string,
  context: BuildContext,
  indexes: Index[] = []
): DmmTable {
  const existingId = context.tableIdsByPath.get(pathKey);
  if (existingId && context.tables[existingId]) {
    return context.tables[existingId];
  }

  const tableId = existingId || createId();
  context.tableIdsByPath.set(pathKey, tableId);

  const cols = fields.map((field, index) => buildColumn(field, `${pathKey}.${field.name || index}`, context));
  const pkCols = cols.filter((col) => col.pk);

  const table: DmmTable = {
    id: tableId,
    visible: !embeddable,
    name: name || 'object',
    desc: '',
    estimatedSize: '',
    cols,
    relations: [],
    lines: [],
    keys: buildKeys(pkCols, indexes, cols),
    indexes: buildIndexes(indexes, cols),
    embeddable,
    generate: true,
    generateCustomCode: true,
    customCode: '',
    beforeScript: '',
    afterScript: '',
    validationLevel: 'na',
    validationAction: 'na',
    collation: '',
    others: '',
    size: '',
    max: '',
    validation: '',
    capped: false
  };

  context.tables[tableId] = table;
  return table;
}

function buildColumn(field: Field, pathKey: string, context: BuildContext): DmmColumn {
  const isArray = Boolean(field.isArray) || field.type === 'Array';
  const scalarType = isArray ? field.arrayType || 'Mixed' : field.type;
  const isDocument = scalarType === 'Document';

  let datatype = mapScalarTypeToDmm(scalarType);
  if (isDocument) {
    const nestedTable = buildTable(
      'object',
      true,
      field.nestedFields || [],
      `${pathKey}:document`,
      context
    );
    datatype = nestedTable.id;
  }

  return {
    id: createId(),
    name: field.name || 'field',
    datatype,
    param: '',
    pk: Boolean(field.isId),
    nn: Boolean(field.required && !field.nullable),
    list: isArray,
    comment: field.description || '',
    data: '',
    enum: Array.isArray(field.enum) && field.enum.length > 0 ? field.enum.join(', ') : '',
    validation: '',
    pattern: false,
    estimatedSize: '',
    any: field.ref || field.arrayRef || '',
    fk: Boolean(field.ref || field.arrayRef),
    collation: ''
  };
}

function buildKeys(pkCols: DmmColumn[], indexes: Index[], cols: DmmColumn[]): DmmKey[] {
  const keys: DmmKey[] = [
    {
      id: createId(),
      name: 'Primary key',
      isPk: true,
      cols: pkCols.map((col) => ({
        id: createId(),
        colid: col.id
      }))
    }
  ];

  indexes
    .filter((index) => index.type !== 'atlas_search')
    .forEach((index) => {
      const mappedCols = index.fields
        .map((indexField) => findColumnByPath(cols, indexField.field))
        .filter((col): col is DmmColumn => Boolean(col));
      if (mappedCols.length === 0) {
        return;
      }
      keys.push({
        id: createId(),
        name: index.name || 'index',
        isPk: false,
        cols: mappedCols.map((col) => ({
          id: createId(),
          colid: col.id
        }))
      });
    });

  return keys;
}

function buildIndexes(indexes: Index[], cols: DmmColumn[]): DmmIndex[] {
  return indexes
    .filter((index) => index.type !== 'atlas_search')
    .map((index) => {
      const columns = index.fields
        .map((indexField) => {
          const col = findColumnByPath(cols, indexField.field);
          if (!col) {
            return null;
          }
          return {
            id: createId(),
            colid: col.id,
            order: indexField.order === 'desc' ? 'Descending' : 'Ascending'
          };
        })
        .filter((value): value is NonNullable<typeof value> => Boolean(value));

      return {
        id: createId(),
        name: index.name || 'index',
        unique: Boolean(index.unique),
        columns,
        sparse: Boolean(index.sparse),
        type: index.type || 'regular',
        code: ''
      };
    })
    .filter((index) => index.columns.length > 0);
}

function buildDiagrams(
  models: Model[],
  diagramSheets: DiagramSheet[],
  modelIdToTableId: Map<string, string>,
  currentProject?: ProjectData | null
): DmmDiagram[] {
  const sheets = diagramSheets.length
    ? diagramSheets
    : [
        {
          id: 'global',
          name: 'global',
          modelIds: models.map((model) => model.id),
          modelPositions: {}
        }
      ];

  return sheets.map((sheet, index) => {
    const modelIds = sheet.modelIds?.length ? sheet.modelIds : models.map((model) => model.id);
    const diagramItems = modelIds.reduce<Record<string, DmmDiagramItem>>((accumulator, modelId, itemIndex) => {
      const tableId = modelIdToTableId.get(modelId);
      if (!tableId) {
        return accumulator;
      }

      const position = sheet.modelPositions?.[modelId];
      accumulator[tableId] = {
        referencedItemId: tableId,
        x: position?.x ?? 45 + (itemIndex % 4) * 320,
        y: position?.y ?? 30 + Math.floor(itemIndex / 4) * 220,
        gHeight: -1,
        gWidth: -1,
        color: '#ffffff',
        background: index === 0 ? '#03a9f4' : 'transparent',
        resized: false,
        autoExpand: true,
        backgroundOpacity: '10',
        collapsed: false
      };
      return accumulator;
    }, {});

    return {
      name: sheet.name?.trim() || (index === 0 ? 'global' : `Diagram ${index + 1}`),
      description: '',
      id: createId(),
      keysgraphics: true,
      linegraphics: 'detailed',
      zoom: index === 0 && currentProject ? 1.1 : 1,
      background: index === 0 ? '#607d8b' : 'transparent',
      lineColor: 'transparent',
      isOpen: true,
      main: index === 0,
      diagramItems,
      scroll: { x: 0, y: 0 },
      type: 'erd',
      showHorizontal: true,
      showDescriptions: true,
      showIndicators: true,
      showProgress: true,
      lineWidth: '2',
      boxSize: '0',
      boxSpacing: '2',
      boxAlign: 'center',
      showIndicatorCaptions: true,
      showEstimatedSize: false,
      showSchemaContainer: true,
      showEmbeddedInParents: true,
      showCardinalityCaptions: true,
      showRelationshipNames: false,
      showLineCaptions: false,
      showColumns: true,
      showColumnDataTypes: true,
      showSampleData: false,
      showTableIndexes: true,
      showTableDescriptions: false,
      showRelations: true,
      backgroundImage: 'na',
      descriptionsColor: 'transparent',
      embeddedSpacing: '2',
      showMainIcon: true,
      showLabels: true,
      showCustomizations: false,
      embeddedDisplayMode: 'expansive'
    };
  });
}

function buildRelationsPlaceholder(relations: Relation[]) {
  const entries = relations.filter(() => false);
  return Object.fromEntries(entries) as Record<string, never>;
}

function mapScalarTypeToDmm(type: string) {
  if (!ROOT_TYPES.has(type)) {
    return 'string';
  }

  switch (type) {
    case 'String':
      return 'string';
    case 'Enum':
      return 'string';
    case 'Number':
      return 'double';
    case 'Int':
      return 'int';
    case 'Double':
      return 'double';
    case 'Long':
      return 'long';
    case 'Boolean':
      return 'bool';
    case 'Date':
      return 'date';
    case 'Timestamp':
      return 'timestamp';
    case 'ObjectId':
      return 'objectid';
    case 'Buffer':
      return 'bindata';
    case 'Undefined':
      return 'undefined';
    case 'DbPointer':
      return 'dbPointer';
    case 'JavaScript':
      return 'javascript';
    case 'JavaScriptWithScope':
      return 'javascriptWithScope';
    case 'Regex':
      return 'regex';
    case 'Symbol':
      return 'symbol';
    case 'MinKey':
      return 'minKey';
    case 'MaxKey':
      return 'maxKey';
    case 'Decimal128':
      return 'decimal';
    case 'Null':
      return 'null';
    case 'Mixed':
    default:
      return 'string';
  }
}

function findColumnByPath(cols: DmmColumn[], path: string) {
  const normalizedPath = path.split('.').filter(Boolean)[0];
  return cols.find((col) => col.name === normalizedPath) || null;
}

function createId() {
  return crypto.randomUUID();
}
