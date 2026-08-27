import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import {
  BookOpen,
  Database,
  Download,
  FileJson,
  FolderOpen,
  Image,
  Network,
  Save,
  Upload
} from 'lucide-react';
import { AppLanguage } from '../i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  projectName?: string;
  language: AppLanguage;
  onChangeLanguage: (language: AppLanguage) => void;
  appVersion: string;
}

interface TutorialSection {
  title: string;
  description: string;
  bullets: string[];
  icon: typeof Network;
}

const TUTORIAL_COPY: Record<
  AppLanguage,
  {
    title: string;
    subtitle: (projectName?: string) => string;
    quickStartTitle: string;
    quickStartSteps: string[];
    quickStartChips: string[];
    toolbarTitle: string;
    toolbarItems: string[];
    closeLabel: string;
    sections: TutorialSection[];
  }
> = {
  es: {
    title: 'Guia de usuario',
    subtitle: (projectName) =>
      projectName ? `Guia rapida para ${projectName}.` : 'Guia rapida para el flujo completo de la aplicacion.',
    quickStartTitle: 'Inicio rapido',
    quickStartSteps: [
      'Empieza en Diagram Studio para crear colecciones, campos, hojas y relaciones.',
      'Abre Indexes cuando quieras construir indices normales, wildcard o Atlas Search.',
      'Revisa la documentacion en Data Dictionary y la salida tecnica en JSON Schema.',
      'Guarda, importa o exporta desde la barra superior derecha cuando necesites conservar o compartir el trabajo.'
    ],
    quickStartChips: [
      'Flujo centrado en diagramas',
      'Hoja Fotos opcional',
      'Preparado para importar y exportar'
    ],
    toolbarTitle: 'Barra superior',
    toolbarItems: [
      'Crea un proyecto nuevo.',
      'Guarda el proyecto actual.',
      'Importa esquemas o archivos de proyecto.',
      'Exporta esquemas, indices o el proyecto completo.'
    ],
    closeLabel: 'Cerrar',
    sections: [
      {
        title: 'Diagram Studio',
        description: 'Este es el espacio principal para construir y revisar tu modelo de forma visual.',
        bullets: [
          'Crea colecciones desde el panel izquierdo y cambia entre hojas del diagrama desde las pestanas de la parte inferior.',
          'Usa las herramientas del lienzo para seleccionar colecciones, moverlas libremente o desplazarte por todo el espacio.',
          'Edita detalles de la coleccion, campos, relaciones, transferencia de atributos y comportamiento de fotos desde el inspector derecho.'
        ],
        icon: Network
      },
      {
        title: 'Indexes',
        description: 'Usa esta pantalla para gestionar los indices de una coleccion cada vez.',
        bullets: [
          'Selecciona una coleccion en la lista izquierda para crear indices normales, compuestos, wildcard o Atlas Search.',
          'Los asistentes de Wildcard y Atlas Search te ayudan a elegir campos sin tener que escribir todo el JSON a mano.',
          'Las exportaciones de Atlas Search ya salen limpias para poder copiar la definicion directamente.'
        ],
        icon: Database
      },
      {
        title: 'Data Dictionary',
        description: 'Revisa la estructura y las descripciones de los campos de una forma mas plana y orientada a documentacion.',
        bullets: [
          'Usalo para inspeccionar campos anidados, nombres y descripciones en todas las colecciones.',
          'Es util cuando quieres un inventario legible del modelo sin depender siempre del diagrama.',
          'Los cambios que hagas aqui en las descripciones se reflejan de vuelta en el proyecto.'
        ],
        icon: BookOpen
      },
      {
        title: 'JSON Schema',
        description: 'Genera y revisa los esquemas de validacion y las exportaciones de indices a partir de tus colecciones.',
        bullets: [
          'Usa esta pantalla para inspeccionar el esquema de validacion de MongoDB generado para cada coleccion.',
          'Tambien puedes revisar desde aqui la vista previa de exportacion de los indices de cada coleccion.',
          'Esto ayuda antes de exportar o compartir la definicion tecnica con otros equipos.'
        ],
        icon: FileJson
      },
      {
        title: 'Flujo de Fotos',
        description: 'Soporte opcional para colecciones espejo de fotos vinculadas a tus colecciones principales.',
        bullets: [
          'Al crear un proyecto, puedes activar la hoja Fotos para que las colecciones _photo se creen automaticamente.',
          'Las colecciones existentes tambien pueden anadir o quitar su coleccion de fotos mas adelante desde Collection Details.',
          'Las colecciones de fotos incluyen campos de fecha, metadata, original_doc y relaciones espejo basadas en el diagrama principal.'
        ],
        icon: Image
      },
      {
        title: 'Proyectos, Importacion y Exportacion',
        description: 'La barra superior controla el ciclo de vida del proyecto y el intercambio de archivos.',
        bullets: [
          'Usa New Project, Save y Project Manager para organizar tus espacios de trabajo locales.',
          'Import te permite cargar esquemas JSON o archivos de proyecto dentro de la app.',
          'Export te permite descargar esquemas, indices o el paquete completo del proyecto para reutilizarlo.'
        ],
        icon: Download
      }
    ]
  },
  en: {
    title: 'User Guide',
    subtitle: (projectName) => (projectName ? `Quick guide for ${projectName}.` : 'Quick guide for the full app workflow.'),
    quickStartTitle: 'Quick Start',
    quickStartSteps: [
      'Start in Diagram Studio to create collections, fields, sheets and relations.',
      'Open Indexes when you want to build regular, wildcard or Atlas Search indexes.',
      'Review documentation in Data Dictionary and technical schema output in JSON Schema.',
      'Save, import or export from the top-right toolbar whenever you need to persist or share work.'
    ],
    quickStartChips: ['Diagram-first workflow', 'Optional Fotos sheet', 'Import / Export ready'],
    toolbarTitle: 'Toolbar reference',
    toolbarItems: [
      'Create a new project.',
      'Save the current project.',
      'Import schema or project files.',
      'Export schemas, indexes or the full project.'
    ],
    closeLabel: 'Close',
    sections: [
      {
        title: 'Diagram Studio',
        description: 'This is the main workspace for building and reviewing your model visually.',
        bullets: [
          'Create collections from the left panel and switch between diagram sheets from the tabs at the bottom.',
          'Use the canvas tools to select collections, move them freely or pan the full workspace.',
          'Edit collection details, fields, relations, attribute transfer and photos behavior from the right inspector.'
        ],
        icon: Network
      },
      {
        title: 'Indexes',
        description: 'Use this screen to manage indexes for one collection at a time.',
        bullets: [
          'Select a collection from the left list to create regular, compound, wildcard or Atlas Search indexes.',
          'Wildcard and Atlas Search builders help you choose fields without writing all the JSON by hand.',
          'Exports for Atlas Search are already cleaned so the definition can be copied directly.'
        ],
        icon: Database
      },
      {
        title: 'Data Dictionary',
        description: 'Review field structure and descriptions in a flatter, documentation-friendly way.',
        bullets: [
          'Use it to inspect nested fields, naming and descriptions across all collections.',
          'This is useful when you want a readable inventory of your model without staying in the diagram.',
          'Changes made to field descriptions here are reflected back in the project.'
        ],
        icon: BookOpen
      },
      {
        title: 'JSON Schema',
        description: 'Generate and review validation schemas and index export payloads from your collections.',
        bullets: [
          'Use this screen to inspect the MongoDB validation schema generated from each collection.',
          'You can also review the export preview for collection indexes from the same area.',
          'This helps before exporting or sharing the technical definition with other teams.'
        ],
        icon: FileJson
      },
      {
        title: 'Photos Workflow',
        description: 'Optional support for mirrored photo collections linked to your main collections.',
        bullets: [
          'When creating a project, you can enable the Fotos sheet so linked _photo collections are created automatically.',
          'Existing collections can also add or remove their photo collection later from Collection Details.',
          'Photo collections include date fields, metadata, original_doc and mirrored relations based on the main diagram.'
        ],
        icon: Image
      },
      {
        title: 'Projects, Import and Export',
        description: 'The top bar controls project lifecycle and file exchange.',
        bullets: [
          'Use New Project, Save and Project Manager to organize your local workspaces.',
          'Import lets you bring JSON schema or project files into the app.',
          'Export lets you download schemas, indexes or the full project bundle for reuse.'
        ],
        icon: Download
      }
    ]
  }
};

export default function TutorialDialog({ open, onClose, projectName, language, onChangeLanguage, appVersion }: Props) {
  const copy = TUTORIAL_COPY[language];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
      sx={{
        '& .MuiDialog-paper': { backgroundColor: '#202938', color: '#f8fafc' },
        '& .MuiDialogTitle-root, & .MuiDialogContent-root, & .MuiDialogActions-root': { color: '#f8fafc' },
        '& .MuiChip-root': { backgroundColor: 'rgba(34, 211, 238, 0.14)', color: '#cffafe', border: '1px solid rgba(34, 211, 238, 0.26)' },
        '& .MuiButton-root': { color: '#e2e8f0' }
      }}
    >
      <DialogTitle>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10">
              <BookOpen className="h-5 w-5 text-cyan-600 dark:text-cyan-300" />
            </div>
            <div>
              <div className="text-xl font-semibold text-slate-50">{copy.title}</div>
              <div className="mt-1 text-sm text-slate-300">{copy.subtitle(projectName)}</div>
              <div className="mt-1 text-xs font-medium text-cyan-200">MongoDB Modeler · v{appVersion}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 p-1">
            <Button
              size="small"
              variant={language === 'es' ? 'contained' : 'text'}
              onClick={() => onChangeLanguage('es')}
            >
              ES
            </Button>
            <Button
              size="small"
              variant={language === 'en' ? 'contained' : 'text'}
              onClick={() => onChangeLanguage('en')}
            >
              EN
            </Button>
          </div>
        </div>
      </DialogTitle>

      <DialogContent dividers>
        <div className="space-y-5 py-2">
          <div className="rounded-3xl border border-slate-600/70 bg-slate-900/60 p-4">
            <div className="text-sm font-semibold text-slate-50">{copy.quickStartTitle}</div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-200">
              {copy.quickStartSteps.map((step, index) => (
                <div key={`${language}-quick-${index}`}>
                  {index + 1}. {step}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {copy.quickStartChips.map((chip) => (
                <Chip key={`${language}-${chip}`} size="small" label={chip} />
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            {copy.sections.map((section) => {
              const SectionIcon = section.icon;

              return (
                <section key={`${language}-${section.title}`} className="rounded-3xl border border-slate-600/70 bg-slate-800/75 p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15">
                      <SectionIcon className="h-5 w-5 text-cyan-200" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-base font-semibold text-slate-50">{section.title}</div>
                      <div className="mt-1 text-sm leading-6 text-slate-200">{section.description}</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm leading-6 text-slate-200">
                    {section.bullets.map((bullet, index) => (
                      <div key={`${language}-${section.title}-${index}`} className="flex gap-2">
                        <span className="font-semibold text-cyan-200">{index + 1}.</span>
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="rounded-3xl border border-dashed border-slate-500/80 bg-slate-900/45 p-4 text-sm leading-6 text-slate-200">
            <div className="font-semibold text-slate-50">{copy.toolbarTitle}</div>
            <div className="mt-3 grid gap-2">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                <span>{copy.toolbarItems[0]}</span>
              </div>
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4" />
                <span>{copy.toolbarItems[1]}</span>
              </div>
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                <span>{copy.toolbarItems[2]}</span>
              </div>
              <div className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                <span>{copy.toolbarItems[3]}</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{copy.closeLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}
