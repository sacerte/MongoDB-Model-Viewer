import type { Field } from '../components/MongoModelBuilder';

const MEDICAL_METADATA_FIELD: Field = {
  name: 'metadata',
  type: 'Document',
  required: true,
  nullable: false,
  description: '',
  nestedFields: [
    {
      name: 'created_at',
      type: 'Date',
      required: true,
      nullable: false,
      description: '',
      nestedFields: []
    },
    {
      name: 'created_by_user',
      type: 'String',
      required: true,
      nullable: false,
      description: '',
      nestedFields: []
    },
    {
      name: 'created_by_system',
      type: 'String',
      required: true,
      nullable: false,
      description: '',
      nestedFields: []
    },
    {
      name: 'updated_at',
      type: 'Date',
      required: false,
      nullable: false,
      description: '',
      nestedFields: []
    },
    {
      name: 'updated_by_user',
      type: 'String',
      required: false,
      nullable: false,
      description: '',
      nestedFields: []
    },
    {
      name: 'updated_by_system',
      type: 'String',
      required: false,
      nullable: false,
      description: '',
      nestedFields: []
    }
  ]
};

const DEFAULT_ID_FIELD: Field = {
  name: '_id',
  type: 'ObjectId',
  required: true,
  nullable: false,
  description: '',
  nestedFields: []
};

export function buildDefaultCollectionFields(): Field[] {
  return [cloneField(DEFAULT_ID_FIELD), cloneField(MEDICAL_METADATA_FIELD)];
}

export function isMetadataField(field: Field) {
  return field.name === MEDICAL_METADATA_FIELD.name;
}

export function appendFieldKeepingMetadataLast(fields: Field[], newField: Field): Field[] {
  const metadataFields = fields.filter(isMetadataField);
  const regularFields = fields.filter((field) => !isMetadataField(field));
  return [...regularFields, newField, ...metadataFields];
}

function cloneField(field: Field): Field {
  return {
    ...field,
    nestedFields: field.nestedFields ? field.nestedFields.map(cloneField) : []
  };
}
