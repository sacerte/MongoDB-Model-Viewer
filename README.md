# MongoDB Model Viewer

**MongoDB Model Viewer** (nombre de escritorio: **MongoDBModeler**) es una aplicación de escritorio para diseñar y documentar modelos de datos de MongoDB. Permite definir colecciones y campos, visualizar diagramas y relaciones, gestionar índices, consultar el diccionario de datos e importar o exportar proyectos.

Está construida con React, Vite y Electron.

## Requisitos

- Node.js 20 o superior (se recomienda la versión LTS).
- npm (incluido con Node.js).
- Git, si se clona el repositorio.

Instala las dependencias desde la raíz del proyecto:

```bash
npm ci
```

Para ejecutar la versión web durante el desarrollo:

```bash
npm run dev
```

Para abrir la aplicación de escritorio en modo desarrollo:

```bash
npm run desktop:dev
```

## Compilar la aplicación

Los artefactos generados se guardan en `release/`. Esta carpeta no se versiona: los instaladores se publican como adjuntos de GitHub Releases.

Antes de crear una distribución, verifica que las dependencias estén instaladas:

```bash
npm ci
```

### Windows (x64)

Genera un ejecutable portable:

```bash
npm run desktop:dist:win
```

Para generar un instalador NSIS, usa:

```bash
npm run desktop:dist:win:installer
```

El resultado principal se crea en `release/` con extensión `.exe`.

### Linux (x64 y ARM64)

Para generar AppImage y paquetes Debian para ambas arquitecturas:

```bash
npm run desktop:dist:linux
```

También puedes compilar una arquitectura concreta:

```bash
npm run desktop:dist:linux:x64
npm run desktop:dist:linux:arm64
```

Los resultados se crean en `release/` como `.AppImage` y `.deb`.

### macOS (Apple Silicon y Intel)

Para generar imágenes DMG y archivos ZIP:

```bash
npm run desktop:dist:mac
```

Para una sola arquitectura:

```bash
npm run desktop:dist:mac:arm64
npm run desktop:dist:mac:x64
```

Los resultados se crean en `release/` como `.dmg` y `.zip`.

> La compilación y firma de aplicaciones macOS debe hacerse en un equipo macOS. Para publicar fuera de pruebas, configura la firma y notarización de Apple; de lo contrario macOS puede mostrar advertencias de seguridad.

### Compilación web y empaquetado de prueba

```bash
npm run build
npm run desktop:pack
```

`npm run build` genera los archivos web en `dist/`. `npm run desktop:pack` crea una aplicación sin instalador dentro de `release/`.

## Publicar una versión

1. Actualiza `version` en `package.json`.
2. Genera los instaladores de las plataformas que vayas a distribuir.
3. Crea una GitHub Release con una etiqueta como `v1.0.6`.
4. Adjunta los archivos de `release/` correspondientes (`.exe`, `.AppImage`, `.deb`, `.dmg` o `.zip`).

No añadas `release/`, `node_modules/`, `dist/` ni `tmp/` al repositorio: se generan localmente y están incluidos en `.gitignore`.

## Licencia

Consulta [LICENSE.md](LICENSE.md).
