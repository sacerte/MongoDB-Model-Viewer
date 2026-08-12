import type { Field, Index, Model } from '../components/MongoModelBuilder';

export function generateValidationSchema(model: Model) {
  return {
    $jsonSchema: buildObjectSchema(model.fields, model.name, model.name, {
      includeBsonType: true,
      title: model.name
    })
  };
}

function buildObjectSchema(
  fields: Field[],
  modelName: string,
  currentPath: string,
  options: {
    includeBsonType: boolean;
    title: string;
  },
  field?: Field
) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  fields.forEach((childField) => {
    if (!childField.name) {
      return;
    }
    const childPath = currentPath ? `${currentPath}.${childField.name}` : childField.name;
    properties[childField.name] = buildFieldSchema(modelName, childPath, childField);
    if (childField.required) {
      required.push(childField.name);
    }
  });

  const schema: Record<string, unknown> = {
    title: options.title
  };

  if (options.includeBsonType) {
    schema.bsonType = withNullableBsonType('object', field);
  }

  if (required.length) {
    schema.required = required;
  }

  schema.properties = properties;

  return schema;
}

function buildFieldSchema(modelName: string, fieldPath: string, field: Field): Record<string, unknown> {
  const schema: Record<string, unknown> = {};
  const isArrayField = Boolean((field as any).isArray) || field.type === 'Array';
  const effectiveType = isArrayField ? field.arrayType || field.type : field.type;

  if (isArrayField) {
    schema.bsonType = withNullableBsonType('array', field);
    const itemsSchema = buildArrayItemsSchema(modelName, fieldPath, field);
    if (itemsSchema !== undefined && itemsSchema !== null) {
      schema.items = itemsSchema;
    }
    if (field.arrayType !== 'Enum' && field.enum && field.enum.length > 0) {
      schema.enum = field.enum;
    }
    return schema;
  }

  switch (effectiveType) {
    case 'String':
      schema.bsonType = withNullableBsonType('string', field);
      break;
    case 'Enum':
      if (field.enum && field.enum.length > 0) {
        schema.enum = field.enum;
      }
      if (field.nullable) {
        schema.bsonType = ['null'];
      }
      break;
    case 'Number':
      schema.bsonType = withNullableBsonType('number', field);
      break;
    case 'Int':
      schema.bsonType = withNullableBsonType('int', field);
      break;
    case 'Double':
      schema.bsonType = withNullableBsonType('double', field);
      break;
    case 'Long':
      schema.bsonType = withNullableBsonType('long', field);
      break;
    case 'Boolean':
      schema.bsonType = withNullableBsonType('bool', field);
      break;
    case 'Date':
      schema.bsonType = withNullableBsonType('date', field);
      break;
    case 'Timestamp':
      schema.bsonType = withNullableBsonType('timestamp', field);
      break;
    case 'ObjectId':
      schema.bsonType = withNullableBsonType('objectId', field);
      break;
    case 'Document':
      return buildObjectSchema(
        field.nestedFields || [],
        modelName,
        fieldPath,
        {
          includeBsonType: true,
          title: 'object'
        },
        field
      );
    case 'Mixed':
      schema.bsonType = withNullableBsonType(['object', 'string', 'number', 'bool', 'array'], field);
      break;
    case 'Buffer':
      schema.bsonType = withNullableBsonType('binData', field);
      break;
    case 'Undefined':
      schema.bsonType = withNullableBsonType('undefined', field);
      break;
    case 'DbPointer':
      schema.bsonType = withNullableBsonType('dbPointer', field);
      break;
    case 'JavaScript':
      schema.bsonType = withNullableBsonType('javascript', field);
      break;
    case 'JavaScriptWithScope':
      schema.bsonType = withNullableBsonType('javascriptWithScope', field);
      break;
    case 'Regex':
      schema.bsonType = withNullableBsonType('regex', field);
      break;
    case 'Symbol':
      schema.bsonType = withNullableBsonType('symbol', field);
      break;
    case 'MinKey':
      schema.bsonType = withNullableBsonType('minKey', field);
      break;
    case 'MaxKey':
      schema.bsonType = withNullableBsonType('maxKey', field);
      break;
    case 'Decimal128':
      schema.bsonType = withNullableBsonType('decimal', field);
      break;
    case 'Null':
      schema.bsonType = 'null';
      break;
    default:
      schema.bsonType = 'string';
      break;
  }

  if (field.enum && field.enum.length > 0) {
    schema.enum = field.enum;
  }
  return schema;
}

function buildArrayItemsSchema(modelName: string, fieldPath: string, field: Field) {
  // If no explicit arrayType was selected, return undefined to omit `items`.
  if (!field.arrayType && field.type === 'Array') {
    return undefined;
  }

  if (field.arrayType === 'Document') {
    return buildObjectSchema(field.nestedFields || [], modelName, fieldPath, {
      includeBsonType: false,
      title: 'object'
    });
  }

  if (field.arrayType === 'Enum') {
    const enumOnlySchema: Record<string, unknown> = {};
    if (field.enum && field.enum.length > 0) {
      enumOnlySchema.enum = field.enum;
    }
    return enumOnlySchema;
  }

  if (field.arrayType === 'Array') {
    return { bsonType: 'array' };
  }

  const itemField: Field = {
    name: `${field.name}_item`,
    type: field.arrayType || 'Mixed',
    required: false,
    ref: field.arrayRef,
    nestedFields: []
  };

  const schema = buildFieldSchema(modelName, `${fieldPath}[]`, itemField);
  return schema;
}

export function generateSchemaExportPayload(models: Model[]) {
  if (models.length === 1) {
    return generateValidationSchema(models[0]);
  }

  return models.reduce<Record<string, unknown>>((accumulator, model) => {
    accumulator[model.name] = generateValidationSchema(model);
    return accumulator;
  }, {});
}

export function generateIndexDefinition(index: Index): Record<string, unknown> {
  if (index.type === 'atlas_search') {
    try {
      return index.searchDefinition ? JSON.parse(index.searchDefinition) : {};
    } catch {
      return { definition: index.searchDefinition };
    }
  }

  const indexDefinition: Record<string, unknown> = {
    key: {}
  };

  const key = indexDefinition.key as Record<string, unknown>;
  index.fields.forEach((field) => {
    key[field.field] = getMongoIndexKeyValue(field);
  });

  if (index.unique) indexDefinition.unique = true;
  if (index.sparse) indexDefinition.sparse = true;
  if (index.background) indexDefinition.background = true;
  if (index.hidden) indexDefinition.hidden = true;
  if (typeof index.expireAfterSeconds === 'number' && Number.isFinite(index.expireAfterSeconds)) {
    indexDefinition.expireAfterSeconds = index.expireAfterSeconds;
  }
  if (index.partialFilterExpression) {
    try {
      indexDefinition.partialFilterExpression = JSON.parse(index.partialFilterExpression);
    } catch {
      indexDefinition.partialFilterExpression = index.partialFilterExpression;
    }
  }
  if (index.collation) {
    try {
      indexDefinition.collation = JSON.parse(index.collation);
    } catch {
      indexDefinition.collation = index.collation;
    }
  }

  if (index.type === 'wildcard') {
    const wildcardFields = index.fields.filter((field) => field.field);
    const wildcardFieldIndex = wildcardFields.findIndex((field) => String(field.field).includes('$**'));
    if (wildcardFieldIndex >= 0) {
      const wildcardField = wildcardFields[wildcardFieldIndex];
      key[wildcardField.field] = getMongoIndexKeyValue(wildcardField);
    } else {
      key['$**'] = 1;
    }
    if (index.wildcardProjection) {
      try {
        indexDefinition.wildcardProjection = JSON.parse(index.wildcardProjection);
      } catch {
        indexDefinition.wildcardProjection = index.wildcardProjection;
      }
    }
  }

  return indexDefinition;
}

function getMongoIndexKeyValue(field: Index['fields'][number]) {
  switch (field.mode) {
    case 'text':
      return 'text';
    case 'hashed':
      return 'hashed';
    case '2dsphere':
      return '2dsphere';
    case '2d':
      return '2d';
    default:
      return field.order === 'desc' ? -1 : 1;
  }
}

export function generateIndexExportPayload(_: Model, index: Index) {
  if (index.type === 'atlas_search') {
    return generateIndexDefinition(index);
  }

  const indexDefinition = generateIndexDefinition(index);
  const { key = {}, ...options } = indexDefinition;

  return [
    key,
    {
      name: index.name,
      ...options
    }
  ];
}

export function sanitizeExportName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'export';
}

function withNullableBsonType(bsonType: string | string[], field?: Field) {
  if (!field?.nullable) {
    return bsonType;
  }

  const bsonTypes = Array.isArray(bsonType) ? bsonType : [bsonType];
  if (bsonTypes.includes('null')) {
    return bsonTypes;
  }

  return [...bsonTypes, 'null'];
}
