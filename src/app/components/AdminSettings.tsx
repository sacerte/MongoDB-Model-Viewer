import { useMemo, useState } from 'react';
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField } from '@mui/material';
import { AppSettings } from '../utils/appSettings';
import { useAppLanguage } from '../i18n';

interface Props {
  open: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (settings: AppSettings) => void;
}

export default function AdminSettings({ open, settings, onClose, onSave }: Props) {
  const { language } = useAppLanguage();
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [newModel, setNewModel] = useState('');

  const copy = useMemo(
    () =>
      language === 'es'
        ? {
            title: 'Admin / Configuración',
            aiTitle: 'IA',
            cloudTitle: 'Nube',
            appTitle: 'Parámetros',
            apiKey: 'API Key',
            baseUrl: 'URL API',
            defaultModel: 'Modelo por defecto',
            customModel: 'Agregar modelo personalizado',
            addModel: 'Agregar modelo',
            cloudProvider: 'Proveedor nube',
            cloudPath: 'Ruta / bucket / carpeta sync',
            autosave: 'Autosave',
            autosaveSec: 'Intervalo autosave (segundos)',
          enableDocs: 'Habilitar pestaña de documentación',
          cancel: 'Cancelar',
          save: 'Guardar'
          }
        : {
            title: 'Admin / Settings',
            aiTitle: 'AI',
            cloudTitle: 'Cloud',
            appTitle: 'Parameters',
            apiKey: 'API Key',
            baseUrl: 'API URL',
            defaultModel: 'Default model',
            customModel: 'Add custom model',
            addModel: 'Add model',
            cloudProvider: 'Cloud provider',
            cloudPath: 'Path / bucket / sync folder',
            autosave: 'Autosave',
            autosaveSec: 'Autosave interval (seconds)',
          enableDocs: 'Enable documentation tab',
          cancel: 'Cancel',
          save: 'Save'
          },
    [language]
  );

  const addCustomModel = () => {
    const next = newModel.trim();
    if (!next) return;
    if (draft.aiCustomModels.includes(next)) return;
    setDraft((current) => ({ ...current, aiCustomModels: [...current.aiCustomModels, next] }));
    setNewModel('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogContent>
        <div className="space-y-4 pt-2">
          <div className="text-sm font-semibold">{copy.aiTitle}</div>
          <TextField fullWidth label={copy.apiKey} value={draft.aiApiKey} onChange={(e) => setDraft({ ...draft, aiApiKey: e.target.value })} />
          <TextField fullWidth label={copy.baseUrl} value={draft.aiBaseUrl} onChange={(e) => setDraft({ ...draft, aiBaseUrl: e.target.value })} />
          <TextField fullWidth label={copy.defaultModel} value={draft.aiDefaultModel} onChange={(e) => setDraft({ ...draft, aiDefaultModel: e.target.value })} />
          <div className="flex gap-2">
            <TextField fullWidth label={copy.customModel} value={newModel} onChange={(e) => setNewModel(e.target.value)} />
            <Button variant="outlined" onClick={addCustomModel}>{copy.addModel}</Button>
          </div>
          {draft.aiCustomModels.length > 0 && (
            <div className="rounded border border-slate-500/30 p-2 text-xs">
              {draft.aiCustomModels.join(', ')}
            </div>
          )}

          <div className="text-sm font-semibold">{copy.cloudTitle}</div>
          <TextField
            select
            fullWidth
            label={copy.cloudProvider}
            value={draft.cloudProvider}
            onChange={(e) => setDraft({ ...draft, cloudProvider: e.target.value as AppSettings['cloudProvider'] })}
          >
            <MenuItem value="none">None</MenuItem>
            <MenuItem value="onedrive">OneDrive</MenuItem>
            <MenuItem value="gdrive">Google Drive</MenuItem>
            <MenuItem value="icloud">iCloud Drive</MenuItem>
            <MenuItem value="local_folder">Local folder</MenuItem>
          </TextField>
          <TextField fullWidth label={copy.cloudPath} value={draft.cloudPathOrBucket} onChange={(e) => setDraft({ ...draft, cloudPathOrBucket: e.target.value })} />

          <div className="text-sm font-semibold">{copy.appTitle}</div>
          <FormControlLabel
            control={<Checkbox checked={draft.autosaveEnabled} onChange={(e) => setDraft({ ...draft, autosaveEnabled: e.target.checked })} />}
            label={copy.autosave}
          />
          <TextField
            fullWidth
            type="number"
            label={copy.autosaveSec}
            value={draft.autosaveIntervalSec}
            onChange={(e) => setDraft({ ...draft, autosaveIntervalSec: Number(e.target.value) || 60 })}
          />
          <FormControlLabel
            control={<Checkbox checked={Boolean(draft.enableDocumentation)} onChange={(e) => setDraft({ ...draft, enableDocumentation: e.target.checked })} />}
            label={copy.enableDocs}
          />
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{copy.cancel}</Button>
        <Button variant="contained" onClick={() => onSave(draft)}>{copy.save}</Button>
      </DialogActions>
    </Dialog>
  );
}
