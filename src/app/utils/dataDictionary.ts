import type { Field, Index, Model } from '../components/MongoModelBuilder';
import { normalizeMongoTypeLabel } from './mongoTypeLabels';

export interface FlatField {
  path: string;
  name: string;
  type: string;
  required: boolean;
  isArray: boolean;
  isDocumentGroup: boolean;
  description: string;
  customDescription: string;
  generatedDescription: string;
  ref?: string;
  depth: number;
}

const HEALTHCARE_TERMS: Array<{ keywords: string[]; description: string }> = [
  {
    keywords: ['patient', 'insured', 'beneficiary', 'person', 'member'],
    description:
      'Dato vinculado a la persona atendida o asegurada dentro del circuito asistencial y administrativo sanitario en Espana.'
  },
  {
    keywords: ['reference', 'referral', 'authorization', 'approval'],
    description:
      'Dato de referencia o autorizacion usado para coordinar la asistencia, la derivacion o la validacion administrativa del acto sanitario.'
  },
  {
    keywords: ['invoice', 'billing', 'amount', 'copay', 'claim', 'payment', 'payer', 'insurer', 'policy'],
    description:
      'Dato economico o de facturacion sanitaria empleado para la liquidacion, conciliacion o seguimiento con la entidad pagadora.'
  },
  {
    keywords: ['provider', 'doctor', 'physician', 'nurse', 'professional', 'speciality', 'specialty', 'service'],
    description:
      'Dato relacionado con el profesional, servicio o especialidad responsable de la asistencia sanitaria prestada.'
  },
  {
    keywords: ['diagnosis', 'procedure', 'act', 'treatment', 'medication', 'dose', 'allergy', 'clinical'],
    description:
      'Dato clinico o asistencial necesario para describir el acto sanitario, el procedimiento o la informacion clinica asociada.'
  },
  {
    keywords: ['admission', 'discharge', 'episode', 'stay', 'appointment', 'visit'],
    description:
      'Dato temporal o funcional del episodio asistencial, la cita o la estancia vinculada al proceso sanitario.'
  },
  {
    keywords: ['status', 'state', 'result', 'outcome'],
    description:
      'Dato de estado o resultado que permite seguir la situacion funcional, clinica o administrativa del proceso sanitario.'
  },
  {
    keywords: ['center', 'hospital', 'clinic', 'facility', 'location', 'region'],
    description:
      'Dato de centro o localizacion sanitaria utilizado para identificar el ambito organizativo de la prestacion en Espana.'
  },
  {
    keywords: ['date', 'time', 'created', 'updated'],
    description:
      'Dato temporal relevante para la trazabilidad clinica, operativa o administrativa del registro sanitario.'
  }
];

export function normalizeFieldArray(fields?: Field[] | null): Field[] {
  return Array.isArray(fields) ? fields.filter((field): field is Field => Boolean(field)) : [];
}

export function flattenModelFields(model: Model): FlatField[] {
  return flattenFields(normalizeFieldArray(model?.fields), model?.name || 'Model');
}

function flattenFields(fields: Field[] | null | undefined, modelName: string, prefix = '', depth = 0): FlatField[] {
  const result: FlatField[] = [];
  const safeFields = normalizeFieldArray(fields);

  safeFields.forEach((field) => {
    const isArrayField = Boolean((field as any).isArray) || field.type === 'Array';
    const effectiveType = isArrayField ? field.arrayType || field.type : field.type;
    const fieldPath = prefix ? `${prefix}.${field.name}` : field.name;
    const typeDisplay = formatFieldType(field);
    const generatedDescription = buildHealthcareDescription(modelName, fieldPath, field);

    result.push({
      path: fieldPath,
      name: field.name,
      type: typeDisplay,
      required: field.required,
      isArray: isArrayField,
      isDocumentGroup: effectiveType === 'Document',
      description: resolveFieldDescription(modelName, fieldPath, field),
      customDescription: field.description?.trim() || '',
      generatedDescription,
      ref: field.ref || field.arrayRef,
      depth
    });

    if (effectiveType === 'Document' && field.nestedFields) {
      result.push(...flattenFields(field.nestedFields, modelName, isArrayField ? `${fieldPath}[]` : fieldPath, depth + 1));
    } else if (field.type === 'Array' && field.arrayType === 'Document' && field.nestedFields) {
      result.push(...flattenFields(field.nestedFields, modelName, `${fieldPath}[]`, depth + 1));
    }
  });

  return result;
}

export function formatFieldType(field: Field): string {
  const isArrayField = Boolean((field as any).isArray) || field.type === 'Array';
  const effectiveType = isArrayField ? field.arrayType || field.type : field.type;
  const nullableSuffix = field.nullable && effectiveType !== 'Null' ? ' | null' : '';

  if (isArrayField && effectiveType) {
    return normalizeMongoTypeLabel(
      (effectiveType === 'Document' ? 'Array<Document>' : `Array<${effectiveType}>`) + nullableSuffix
    );
  }
  if (effectiveType === 'Document') {
    return normalizeMongoTypeLabel(`Document${nullableSuffix}`);
  }
  if (!isArrayField && effectiveType === 'Mixed' && field.bsonTypes?.length) {
    return normalizeMongoTypeLabel(`${field.bsonTypes.join(' | ')}${nullableSuffix}`);
  }
  return normalizeMongoTypeLabel(`${effectiveType}${nullableSuffix}`);
}

export function formatDisplayFieldPath(path: string): string {
  return path.replace(/\[\]/g, '');
}

export function formatDisplayFieldType(type: string): string {
  const displayType = type.startsWith('Array<Document>') ? type.replace('Array<Document>', 'Document') : type;
  return normalizeMongoTypeLabel(displayType);
}

export function buildHealthcareDescription(modelName: string, fieldPath: string, field: Field): string {
  const normalizedPath = fieldPath.toLowerCase();
  const lastToken = normalizedPath.split('.').pop() || normalizedPath;
  const cleanLastToken = lastToken.replace(/\[\]/g, '');
  const label = humanizeToken(cleanLastToken);
  const collectionLabel = humanizeToken(modelName);

  if (cleanLastToken === '_id') {
    return `Identificador tecnico unico del documento en la coleccion ${collectionLabel}, usado para su trazabilidad interna.`;
  }

  if (field.type === 'Document') {
    return `Subdocumento que agrupa la informacion de ${label.toLowerCase()} dentro del contexto asistencial o administrativo sanitario en Espana.`;
  }

  if (field.type === 'Array') {
    if (field.arrayType === 'Document') {
      return `Listado de registros de ${label.toLowerCase()} asociados al proceso asistencial o administrativo de la coleccion ${collectionLabel}.`;
    }
    return `Listado de valores de ${label.toLowerCase()} utilizados en el seguimiento funcional o clinico del registro sanitario.`;
  }

  if (field.type === 'ObjectId' && field.ref) {
    return `Identificador de relacion con la coleccion ${field.ref}, empleado para mantener la trazabilidad clinica o administrativa del dato.`;
  }

  if (field.type === 'ObjectId') {
    return `Identificador tecnico de ${label.toLowerCase()} dentro del circuito asistencial o administrativo del sistema sanitario.`;
  }

  for (const term of HEALTHCARE_TERMS) {
    if (term.keywords.some((keyword) => normalizedPath.includes(keyword))) {
      return `${term.description} Campo: ${label.toLowerCase()}.`;
    }
  }

  switch (field.type) {
    case 'Date':
      return `Fecha u hora de ${label.toLowerCase()} relevante para la trazabilidad sanitaria y administrativa del registro.`;
    case 'Boolean':
      return `Indicador logico que informa si ${label.toLowerCase()} aplica dentro del flujo asistencial o de gestion sanitaria.`;
    case 'Number':
    case 'Int':
    case 'Decimal128':
      return `Valor numerico de ${label.toLowerCase()} utilizado en la operativa clinica, economica o administrativa sanitaria.`;
    case 'Buffer':
      return `Dato binario asociado a ${label.toLowerCase()} para interoperabilidad o soporte documental del registro.`;
    case 'Mixed':
      return `Campo flexible de ${label.toLowerCase()} para informacion sanitaria o administrativa con estructura variable.`;
    case 'Null':
      return `Campo reservado para ${label.toLowerCase()} cuando el dato puede no estar informado en el proceso sanitario.`;
    default:
      return `Dato de ${label.toLowerCase()} empleado en la gestion asistencial, clinica o administrativa de la coleccion ${collectionLabel}.`;
  }
}

export function resolveFieldDescription(modelName: string, fieldPath: string, field: Field): string {
  if (field.description && field.description.trim()) {
    return field.description.trim();
  }
  return buildHealthcareDescription(modelName, fieldPath, field);
}

export function updateFieldDescription(model: Model, fieldPath: string, description: string): Model {
  return {
    ...model,
    fields: updateFieldDescriptionInFields(model?.fields, fieldPath, description.trim())
  };
}

function updateFieldDescriptionInFields(
  fields: Field[] | null | undefined,
  targetPath: string,
  description: string,
  prefix = ''
): Field[] {
  return normalizeFieldArray(fields).map((field) => {
    const isArrayField = Boolean((field as any).isArray) || field.type === 'Array';
    const currentPath = prefix ? `${prefix}.${field.name}` : field.name;
    const nextField: Field = {
      ...field,
      description: currentPath === targetPath ? description : field.description,
      nestedFields: field.nestedFields ? [...field.nestedFields] : []
    };

    if ((field.type === 'Document' || (isArrayField && field.arrayType === 'Document')) && field.nestedFields) {
      nextField.nestedFields = updateFieldDescriptionInFields(
        field.nestedFields,
        targetPath,
        description,
        isArrayField ? `${currentPath}[]` : currentPath
      );
    } else if (field.type === 'Array' && field.arrayType === 'Document' && field.nestedFields) {
      nextField.nestedFields = updateFieldDescriptionInFields(
        field.nestedFields,
        targetPath,
        description,
        `${currentPath}[]`
      );
    }

    return nextField;
  });
}

/*export async function buildDataDictionaryWorkbookBuffer(models: Model[]) {
  const workbook = new ExcelJS.Workbook();

  models.forEach((model, index) => {
    const worksheetName = worksheetNameForModel(model, index);
    const worksheetConfig = buildWorksheetRows(model);
    const worksheet = workbook.addWorksheet(worksheetName);

    worksheet.columns = [
      { width: 42 },
      { width: 24 },
      { width: 18 },
      { width: 12 },
      { width: 12 },
      { width: 70 }
    ];

    worksheetConfig.rows.forEach((row) => {
      worksheet.addRow(row);
    });

    applyWorksheetStyles(worksheet, worksheetConfig);
  });

  return workbook.xlsx.writeBuffer();
}*/

export async function buildDataDictionaryWorkbookBuffer(models: Model[]) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  const usedSheetNames = new Set<string>();

  function getUniqueWorksheetName(name: string): string {
    // Elimina caracteres inválidos para Excel
    const sanitized = name.replace(/[:\\/?*\[\]]/g, '');

    // Excel limita a 31 caracteres
    const maxLength = 31;

    let baseName = sanitized.substring(0, maxLength);
    let finalName = baseName;

    let counter = 1;

    while (usedSheetNames.has(finalName)) {
      const suffix = `_${counter}`;

      finalName =
        baseName.substring(0, maxLength - suffix.length) + suffix;

      counter++;
    }

    usedSheetNames.add(finalName);

    return finalName;
  }

  models
    .filter((model) => {
      return !model.name.toLowerCase().endsWith('photo');
    })
    .forEach((model, index) => {
      const originalWorksheetName = worksheetNameForModel(model, index);

      const worksheetName =
        getUniqueWorksheetName(originalWorksheetName);

      const worksheetConfig = buildWorksheetRows(model);

      const worksheet = workbook.addWorksheet(worksheetName);

      worksheet.columns = [
        { width: 42 },
        { width: 24 },
        { width: 18 },
        { width: 12 },
        { width: 12 },
        { width: 70 }
      ];

      worksheetConfig.rows.forEach((row) => {
        worksheet.addRow(row);
      });

      applyWorksheetStyles(worksheet, worksheetConfig);
    });

  return workbook.xlsx.writeBuffer();
}


interface WorksheetConfig {
  rows: Array<Array<string | number>>;
  fieldHeaderRowNumber: number;
  indexHeaderRowNumber: number;
  documentGroupRowNumbers: number[];
  documentChildRowNumbers: number[];
}

function buildWorksheetRows(model: Model): WorksheetConfig {
  const flatFields = flattenModelFields(model);
  const documentGroupPaths = flatFields
    .filter((field) => isDocumentGroupField(field))
    .map((field) => field.path);
  const fieldRows = flatFields.length
    ? flatFields.map((field) => [
        qualifyFieldPath(model.name, field.path),
        field.name,
        formatWorkbookFieldType(field),
        field.required ? 'Si' : 'No',
        field.isArray ? 'Si' : 'No',
        field.description
      ])
    : [['No fields defined', '', '', '', '', '']];

  const indexRows = model.indexes?.length
    ? model.indexes.map((index) => [
        index.name,
        index.type,
        formatIndexFields(index),
        formatIndexProperties(index)
      ])
    : [['No indexes defined', '', '', '']];

  return {
    rows: [
      ['Path', 'Field Name', 'Type', 'Required', 'Array', 'Description'],
      ...fieldRows,
      [''],
      ['Indexes'],
      ['Index Name', 'Type', 'Fields', 'Properties'],
      ...indexRows
    ],
    fieldHeaderRowNumber: 1,
    indexHeaderRowNumber: fieldRows.length + 4,
    documentGroupRowNumbers: flatFields
      .map((field, index) => (isDocumentGroupField(field) ? index + 2 : null))
      .filter((rowNumber): rowNumber is number => rowNumber !== null),
    documentChildRowNumbers: flatFields
      .map((field, index) => (isDocumentChildField(field.path, documentGroupPaths) ? index + 2 : null))
      .filter((rowNumber): rowNumber is number => rowNumber !== null)
  };
}

function worksheetNameForModel(model: Model, index: number): string {
  const safeName = model.name.replace(/[\\\/\?\*\[\]:]/g, '_').trim();
  return (safeName || `Collection_${index + 1}`).slice(0, 31);
}

function formatIndexFields(index: Index): string {
  if (index.type === 'atlas_search') {
    return 'Atlas Search definition';
  }
  return index.fields.map((field) => `${field.field} (${field.order || 'asc'})`).join(', ');
}

function formatIndexProperties(index: Index): string {
  const properties: string[] = [];
  if (index.unique) properties.push('Unique');
  if (index.sparse) properties.push('Sparse');
  if (index.wildcardProjection) properties.push(`Wildcard: ${index.wildcardProjection}`);
  return properties.length ? properties.join(' | ') : '-';
}

function applyWorksheetStyles(worksheet: ExcelJS.Worksheet, config: WorksheetConfig) {
  applyBordersToUsedCells(worksheet);

  styleRow(worksheet, config.fieldHeaderRowNumber, 6, {
    font: { bold: true, color: { argb: 'FF1F2937' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
  });

  styleRow(worksheet, config.indexHeaderRowNumber, 4, {
    font: { bold: true, color: { argb: 'FF1F2937' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
  });

  const sectionTitleRow = worksheet.getRow(config.indexHeaderRowNumber - 1);
  sectionTitleRow.getCell(1).font = { bold: true, color: { argb: 'FF111827' } };

  config.documentGroupRowNumbers.forEach((rowNumber) => {
    styleRow(worksheet, rowNumber, 6, {
      font: { bold: true, color: { argb: 'FF14532D' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBF7D0' } }
    });
  });

  config.documentChildRowNumbers.forEach((rowNumber) => {
    styleRow(worksheet, rowNumber, 6, {
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }
    });
  });
}

function styleRow(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  columnCount: number,
  style: Partial<ExcelJS.Style>
) {
  const row = worksheet.getRow(rowNumber);

  for (let columnIndex = 1; columnIndex <= columnCount; columnIndex += 1) {
    const cell = row.getCell(columnIndex);
    cell.style = {
      ...cell.style,
      ...style
    };
  }
}

function applyBordersToUsedCells(worksheet: ExcelJS.Worksheet) {
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);

    for (let columnIndex = 1; columnIndex <= row.cellCount; columnIndex += 1) {
      const cell = row.getCell(columnIndex);
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    }
  }
}

function isDocumentRelatedField(fieldPath: string, documentGroupPaths: string[]) {
  return documentGroupPaths.some(
    (groupPath) =>
      fieldPath === groupPath ||
      fieldPath.startsWith(`${groupPath}.`) ||
      fieldPath.startsWith(`${groupPath}[].`)
  );
}

function isDocumentGroupField(field: FlatField) {
  return field.type === 'Document' || field.type === 'Array<Document>';
}

function isDocumentChildField(fieldPath: string, documentGroupPaths: string[]) {
  return isDocumentRelatedField(fieldPath, documentGroupPaths) && !documentGroupPaths.includes(fieldPath);
}

function formatWorkbookFieldType(field: FlatField) {
  if (field.type.startsWith('Array<Document>')) {
    return normalizeMongoTypeLabel(field.type.replace('Array<Document>', 'Document'));
  }
  return normalizeMongoTypeLabel(field.type);
}

function qualifyFieldPath(modelName: string, fieldPath: string) {
  return `${modelName}.${stripArrayMarkers(fieldPath)}`;
}

function stripArrayMarkers(fieldPath: string) {
  return fieldPath.replace(/\[\]/g, '');
}

function humanizeToken(value: string): string {
  return value
    .replace(/\[\]/g, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
