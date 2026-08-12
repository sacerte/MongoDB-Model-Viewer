export function normalizeMongoTypeLabel(value: string) {
  return value
    .replace(/\bDecimal128\b/g, 'decimal')
    .replace(/\bdecimal128\b/g, 'decimal')
    .replace(/\bMixed\b/g, 'any')
    .replace(/\bmixed\b/g, 'any')
    .replace(/\bBuffer\b/g, 'binData')
    .replace(/\bbuffer\b/g, 'binData')
    .replace(/\bJavaScriptWithScope\b/g, 'javascriptWithScope')
    .replace(/\bJavaScript\b/g, 'javascript')
    .replace(/\bDbPointer\b/g, 'dbPointer')
    .replace(/\bObjectId\b/g, 'objectId')
    .replace(/\bMinKey\b/g, 'minKey')
    .replace(/\bMaxKey\b/g, 'maxKey')
    .replace(/\bTimestamp\b/g, 'timestamp')
    .replace(/\bRegex\b/g, 'regex')
    .replace(/\bUndefined\b/g, 'undefined');
}

export function getMongoTypeOptionLabel(type: string) {
  if (type === 'Decimal128') return 'Decimal';
  if (type === 'Mixed') return 'Any';
  if (type === 'Buffer') return 'binData';
  if (type === 'DbPointer') return 'dbPointer';
  if (type === 'JavaScript') return 'javascript';
  if (type === 'JavaScriptWithScope') return 'javascriptWithScope';
  if (type === 'ObjectId') return 'objectId';
  if (type === 'MinKey') return 'minKey';
  if (type === 'MaxKey') return 'maxKey';
  if (type === 'Timestamp') return 'timestamp';
  if (type === 'Regex') return 'regex';
  if (type === 'Undefined') return 'undefined';
  return type;
}
