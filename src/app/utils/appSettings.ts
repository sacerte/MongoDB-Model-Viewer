export type CloudProvider = 'none' | 'onedrive' | 'gdrive' | 'icloud' | 'local_folder';

export interface AppSettings {
  aiApiKey: string;
  aiBaseUrl: string;
  aiDefaultModel: string;
  aiCustomModels: string[];
  cloudProvider: CloudProvider;
  cloudPathOrBucket: string;
  autosaveEnabled: boolean;
  autosaveIntervalSec: number;
  enableDocumentation?: boolean;
}

const APP_SETTINGS_STORAGE_KEY = 'mongodb-model-viewer-app-settings';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  aiApiKey: '',
  aiBaseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  aiDefaultModel: 'openai/gpt-oss-120b:free',
  aiCustomModels: [],
  cloudProvider: 'none',
  cloudPathOrBucket: '',
  autosaveEnabled: true,
  autosaveIntervalSec: 60,
  enableDocumentation: false
};

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_APP_SETTINGS,
      ...parsed,
      aiCustomModels: Array.isArray(parsed.aiCustomModels) ? parsed.aiCustomModels : []
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveAppSettings(settings: AppSettings) {
  localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
