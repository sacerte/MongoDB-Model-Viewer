import { useMemo, useState } from 'react';
import { Model } from './MongoModelBuilder';
import { generateIndexExportPayload, generateValidationSchema } from '../utils/mongoSchema';
import { useAppLanguage } from '../i18n';
import { ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { IconButton, Tooltip } from '@mui/material';

interface Props {
  models: Model[];
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
          indexes: 'Índices'
        }
      : {
          empty: 'No models to display. Create a MongoDB model first.',
          title: 'JSON Schema Validation',
          subtitle: 'MongoDB validation schemas for each collection.',
          validation: 'Validation Schema',
          indexes: 'Indexes'
        };

  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const visibleModels = useMemo(() => models, [models]);

  return (
    <div className="h-full overflow-auto bg-[#2e2e2e] p-6 text-slate-100">
      {visibleModels.length === 0 ? (
        <div className="flex h-full items-center justify-center text-slate-300">
          {copy.empty}
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="mb-4">{copy.title}</h2>
            <p className="mb-6 text-slate-300">{copy.subtitle}</p>
          </div>

          {visibleModels.map((model) => {
            const isExpanded = expandedModelId === model.id;
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
                        <pre>{JSON.stringify(generateValidationSchema(model), null, 2)}</pre>
                      </div>
                    </div>

                    {model.indexes && model.indexes.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-sm">{copy.indexes}</h4>
                        <div className="space-y-2">
                          {model.indexes.map((index) => (
                            <div key={index.id}>
                              <div className="mb-1 text-xs text-slate-300">
                                {index.name} ({index.type})
                              </div>
                              <div className="overflow-x-auto rounded-xl border border-slate-500/20 bg-slate-950/75 p-4 font-mono text-sm text-amber-300 shadow-sm">
                                <pre>{JSON.stringify(generateIndexExportPayload(model, index), null, 2)}</pre>
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
          })}
        </div>
      )}
    </div>
  );
}
