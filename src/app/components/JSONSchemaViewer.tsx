import { useEffect, useMemo, useRef, useState } from 'react';
import { Model } from './MongoModelBuilder';
import { generateIndexExportPayload, generateValidationSchema } from '../utils/mongoSchema';
import { flattenModelFields } from '../utils/dataDictionary';
import { useAppLanguage } from '../i18n';
import { ChevronDown, ChevronRight, ChevronUp, Copy, Search } from 'lucide-react';
import { IconButton, InputAdornment, TextField, Tooltip } from '@mui/material';

interface Props {
  models: Model[];
}

interface HighlightSegment {
  text: string;
  match: boolean;
  matchIndex?: number;
}

interface HighlightBlock {
  key: string;
  segments: HighlightSegment[];
  matchCount: number;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitHighlight(text: string, query: string, startIndex: number): { segments: HighlightSegment[]; matchCount: number } {
  if (!query) {
    return { segments: [{ text, match: false }], matchCount: 0 };
  }

  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  const segments: HighlightSegment[] = [];
  let matchCount = 0;
  let lastIndex = 0;
  let current: RegExpExecArray | null;

  while ((current = regex.exec(text)) !== null) {
    if (current.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, current.index), match: false });
    }
    segments.push({ text: current[0], match: true, matchIndex: startIndex + matchCount });
    matchCount += 1;
    lastIndex = current.index + current[0].length;
    if (current[0].length === 0) {
      regex.lastIndex += 1;
    }
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), match: false });
  }

  return { segments, matchCount };
}

export default function JSONSchemaViewer({ models }: Props) {
  const { language } = useAppLanguage();
  const copy =
    language === 'es'
      ? {
          empty: 'No hay colecciones para mostrar. Crea primero un modelo de MongoDB.',
          title: 'JSON Schema',
          subtitle: 'Esquemas de validación de MongoDB para cada colección.',
          validation: 'Esquema de validación',
          indexes: 'Índices',
          searchPlaceholder: 'Buscar colección o campo (nombre o tipo)…',
          noResults: 'Sin resultados para',
          matchCounter: (current: number, total: number) => `${total === 0 ? 0 : current + 1}/${total}`,
          previousMatch: 'Coincidencia anterior (Shift+Enter)',
          nextMatch: 'Coincidencia siguiente (Enter)'
        }
      : {
          empty: 'No models to display. Create a MongoDB model first.',
          title: 'JSON Schema Validation',
          subtitle: 'MongoDB validation schemas for each collection.',
          validation: 'Validation Schema',
          indexes: 'Indexes',
          searchPlaceholder: 'Search collection or field (name or type)…',
          noResults: 'No results for',
          matchCounter: (current: number, total: number) => `${total === 0 ? 0 : current + 1}/${total}`,
          previousMatch: 'Previous match (Shift+Enter)',
          nextMatch: 'Next match (Enter)'
        };

  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatch, setCurrentMatch] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const query = searchQuery.trim();

  const visibleModels = useMemo(() => {
    const lowerQuery = query.toLowerCase();
    if (!lowerQuery) {
      return models;
    }
    return models.filter(
      (model) =>
        model.name.toLowerCase().includes(lowerQuery) ||
        flattenModelFields(model).some(
          (field) =>
            field.path.toLowerCase().includes(lowerQuery) || (field.type || '').toLowerCase().includes(lowerQuery)
        )
    );
  }, [models, query]);

  // Bloques de JSON con las coincidencias resaltadas e índices globales estables.
  const { blocksByModel, totalMatches } = useMemo(() => {
    const byModel: Record<string, HighlightBlock[]> = {};
    let runningIndex = 0;

    visibleModels.forEach((model) => {
      const blocks: HighlightBlock[] = [];
      const schemaResult = splitHighlight(JSON.stringify(generateValidationSchema(model), null, 2), query, runningIndex);
      runningIndex += schemaResult.matchCount;
      blocks.push({ key: `${model.id}-schema`, segments: schemaResult.segments, matchCount: schemaResult.matchCount });

      (model.indexes || []).forEach((index) => {
        const indexResult = splitHighlight(JSON.stringify(generateIndexExportPayload(model, index), null, 2), query, runningIndex);
        runningIndex += indexResult.matchCount;
        blocks.push({
          key: `${model.id}-index-${index.id || index.name}`,
          segments: indexResult.segments,
          matchCount: indexResult.matchCount
        });
      });

      byModel[model.id] = blocks;
    });

    return { blocksByModel: byModel, totalMatches: runningIndex };
  }, [visibleModels, query]);

  // Reset del cursor de coincidencias al cambiar la búsqueda.
  useEffect(() => {
    setCurrentMatch(0);
  }, [query]);

  // Desplazar la vista hasta la coincidencia activa.
  useEffect(() => {
    if (!query || totalMatches === 0) {
      return;
    }
    const target = ((currentMatch % totalMatches) + totalMatches) % totalMatches;
    const element = rootRef.current?.querySelector(`[data-jsv-match="${target}"]`);
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentMatch, query, totalMatches]);

  const goToMatch = (direction: 1 | -1) => {
    if (totalMatches === 0) return;
    setCurrentMatch((current) => {
      const next = (current + direction) % totalMatches;
      return next < 0 ? next + totalMatches : next;
    });
  };

  const renderHighlighted = (block: HighlightBlock) => (
    <pre>
      {block.segments.map((segment, index) =>
        segment.match ? (
          <span
            key={index}
            data-jsv-match={segment.matchIndex}
            className={
              segment.matchIndex === currentMatch
                ? 'rounded bg-amber-300 px-0.5 font-bold text-slate-900'
                : 'rounded bg-amber-500/25 px-0.5 text-amber-200'
            }
          >
            {segment.text}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </pre>
  );

  return (
    <div ref={rootRef} className="h-full overflow-auto bg-[#2e2e2e] p-6 text-slate-100">
      <div className="space-y-6">
        <div>
          <h2 className="mb-4">{copy.title}</h2>
          <p className="mb-6 text-slate-300">{copy.subtitle}</p>
            <div className="sticky top-0 z-10 -mx-6 mb-4 border-b border-slate-500/10 bg-[#2e2e2e]/95 px-6 py-3 backdrop-blur-sm">
              <div className="flex items-center gap-2" style={{ maxWidth: 640 }}>
              <TextField
                size="small"
                fullWidth
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    goToMatch(event.shiftKey ? -1 : 1);
                  }
                }}
                placeholder={copy.searchPlaceholder}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search className="h-4 w-4 text-slate-400" />
                    </InputAdornment>
                  ),
                  sx: {
                    backgroundColor: 'rgba(15,23,42,0.35)',
                    borderRadius: '12px',
                    input: { color: '#e2e8f0' }
                  }
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': { borderColor: 'rgba(148,163,184,0.25)' },
                    '&:hover fieldset': { borderColor: 'rgba(148,163,184,0.45)' },
                    '&.Mui-focused fieldset': { borderColor: 'rgba(37,99,235,0.7)' }
                  }
                }}
              />
              {query && (
                <div className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-500/20 bg-slate-900/50 px-2 py-1">
                  <span className="min-w-[48px] text-center font-mono text-xs text-amber-300">
                    {copy.matchCounter(currentMatch, totalMatches)}
                  </span>
                  <Tooltip title={copy.previousMatch}>
                    <IconButton size="small" onClick={() => goToMatch(-1)} sx={{ color: '#e2e8f0' }}>
                      <ChevronUp className="h-4 w-4" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={copy.nextMatch}>
                    <IconButton size="small" onClick={() => goToMatch(1)} sx={{ color: '#e2e8f0' }}>
                      <ChevronDown className="h-4 w-4" />
                    </IconButton>
                  </Tooltip>
                </div>
              )}
              </div>
            </div>
        </div>

        {visibleModels.length === 0 ? (
          <div className="rounded-2xl border border-slate-500/20 bg-slate-900/30 p-6 text-center text-slate-300">
            {query ? `${copy.noResults} “${query}”` : copy.empty}
          </div>
        ) : (
        visibleModels.map((model) => {
            const modelBlocks = blocksByModel[model.id] || [];
            const hasMatches = query ? modelBlocks.some((block) => block.matchCount > 0) : false;
            // Con búsqueda activa se auto-expanden las colecciones con coincidencias.
            const isExpanded = query ? hasMatches : expandedModelId === model.id;
            return (
              <div key={model.id} className="rounded-2xl border border-slate-500/20 bg-slate-900/30 p-3">
                <button
                  type="button"
                  onClick={() => setExpandedModelId((current) => (current === model.id ? null : model.id))}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <h3 className="text-base font-semibold">{model.name}</h3>
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-300" /> : <ChevronRight className="h-4 w-4 text-slate-300" />}
                </button>

                {isExpanded && (
                  <div className="mt-3 space-y-3">
                    <div className="flex justify-end">
                      <Tooltip title={language === 'es' ? 'Copiar contenido de la colección' : 'Copy collection content'}>
                        <IconButton
                          size="small"
                          onClick={async () => {
                            const payload = {
                              collection: model.name,
                              validation: generateValidationSchema(model),
                              indexes: (model.indexes || []).map((index) => ({
                                name: index.name,
                                type: index.type,
                                definition: generateIndexExportPayload(model, index)
                              }))
                            };
                            await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                          }}
                          sx={{
                            color: '#e2e8f0',
                            border: '1px solid rgba(148,163,184,0.2)',
                            backgroundColor: 'rgba(15,23,42,0.2)',
                            '&:hover': {
                              backgroundColor: 'rgba(15,23,42,0.35)'
                            }
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                    </div>
                    <div>
                      <h4 className="mb-2 text-sm">{copy.validation}</h4>
                      <div className="overflow-x-auto rounded-xl border border-slate-500/20 bg-slate-950/75 p-4 font-mono text-sm text-emerald-300 shadow-sm">
                        {renderHighlighted(modelBlocks.find((block) => block.key === `${model.id}-schema`) || {
                          key: `${model.id}-schema`,
                          segments: [{ text: JSON.stringify(generateValidationSchema(model), null, 2), match: false }],
                          matchCount: 0
                        })}
                      </div>
                    </div>

                    {model.indexes && model.indexes.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-sm">{copy.indexes}</h4>
                        <div className="space-y-2">
                          {model.indexes.map((index) => (
                            <div key={index.id}>
                              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-300">
                                <span>{index.name} ({index.type})</span>
                                <Tooltip title={language === 'es' ? 'Copiar definición del índice' : 'Copy index definition'}>
                                  <IconButton
                                    size="small"
                                    onClick={() => void navigator.clipboard.writeText(JSON.stringify(generateIndexExportPayload(model, index), null, 2))}
                                    sx={{ color: '#fcd34d' }}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </IconButton>
                                </Tooltip>
                              </div>
                              <div className="overflow-x-auto rounded-xl border border-slate-500/20 bg-slate-950/75 p-4 font-mono text-sm text-amber-300 shadow-sm">
                                {renderHighlighted(
                                  modelBlocks.find((block) => block.key === `${model.id}-index-${index.id || index.name}`) || {
                                    key: `${model.id}-index-${index.id || index.name}`,
                                    segments: [{ text: JSON.stringify(generateIndexExportPayload(model, index), null, 2), match: false }],
                                    matchCount: 0
                                  }
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
          )}
        </div>
    </div>
  );
}
