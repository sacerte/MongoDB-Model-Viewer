import { useEffect, useState } from 'react';
import { IconButton } from '@mui/material';
import IndexManager from './IndexManager';
import { useAppLanguage } from '../i18n';

export interface Field {
  name: string;
  type: string;
  isArray?: boolean;
  enum?: string[];
  isId?: boolean;
  required: boolean;
  nullable?: boolean;
  description?: string;
  ref?: string;
  arrayType?: string;
  arrayRef?: string;
  nestedFields?: Field[];
}

export interface Index {
  id: string;
  name: string;
  type: 'regular' | 'compound' | 'wildcard' | 'atlas_search';
  fields: Array<{
    field: string;
    order?: 'asc' | 'desc';
    mode?: 'asc' | 'desc' | 'text' | 'hashed' | '2dsphere' | '2d';
  }>;
  unique?: boolean;
  sparse?: boolean;
  background?: boolean;
  hidden?: boolean;
  expireAfterSeconds?: number;
  partialFilterExpression?: string;
  collation?: string;
  wildcardProjection?: string;
  searchDefinition?: string;
}

export interface Model {
  id: string;
  name: string;
  fields: Field[];
  indexes: Index[];
  photoSourceModelId?: string;
}

interface Props {
  models: Model[];
  onUpdateModel: (model: Model) => void;
}

export default function MongoModelBuilder({ models, onUpdateModel }: Props) {
  const { language } = useAppLanguage();
  const copy =
    language === 'es'
      ? {
          collections: 'Colecciones',
          modelName: 'Nombre del modelo',
          indexesHelp: 'Gestiona los índices de la colección seleccionada.',
          empty: 'Selecciona una colección o crea una nueva para gestionar sus índices.'
        }
      : {
          collections: 'Collections',
          modelName: 'Model name',
          indexesHelp: 'Manage the indexes for the selected collection.',
          empty: 'Select a collection or create a new one to manage its indexes'
        };

  const [selectedModel, setSelectedModel] = useState<Model | null>(null);

  const ensureIndexes = (model: Model): Model => {
    return {
      ...model,
      indexes: model.indexes || []
    };
  };

  useEffect(() => {
    if (!selectedModel) {
      return;
    }

    const latestModel = models.find((model) => model.id === selectedModel.id);
    if (!latestModel) {
      setSelectedModel(null);
      return;
    }

    setSelectedModel(ensureIndexes(latestModel));
  }, [models, selectedModel?.id]);

  return (
    <div className="flex h-full min-h-0 bg-[#2e2e2e] text-slate-100">
      <div className="flex min-h-0 w-[300px] flex-col border-r border-slate-500/20 bg-slate-900/55 p-4">
        <h3 className="mb-3 text-slate-100">{copy.collections}</h3>

        <div className="flex-1 space-y-2.5 overflow-auto pr-1">
          {models.map((model) => (
            <div
              key={model.id}
              className={`flex cursor-pointer items-center justify-between rounded-2xl border px-3 py-3 transition-colors ${
                selectedModel?.id === model.id
                  ? 'border-cyan-300/70 bg-cyan-500/15 text-slate-100 shadow-[0_0_0_1px_rgba(56,189,248,0.35)]'
                  : 'border-slate-500/20 bg-slate-900/35 text-slate-200 hover:border-slate-300/40 hover:bg-slate-800/45'
              }`}
              onClick={() => setSelectedModel(ensureIndexes(model))}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{model.name}</div>
                <div className="mt-1 text-xs text-slate-300/90">
                  {(model.indexes?.length || 0)} idx
                </div>
              </div>
              <div className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-slate-100">
                {(model.indexes?.length || 0)} idx
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-[#2e2e2e] p-6">
        {selectedModel ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-slate-100">{selectedModel.name}</h2>
            </div>

            <div className="mb-4 text-sm text-slate-300">
              {copy.indexesHelp}
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              <IndexManager
                model={selectedModel}
                onUpdateModel={onUpdateModel}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-300">
            {copy.empty}
          </div>
        )}
      </div>
    </div>
  );
}
