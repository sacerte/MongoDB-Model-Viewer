# Instalador para Arch Linux

Este proyecto ya incluye la target de Electron Builder para generar un paquete nativo de Arch Linux en formato pacman (`.pkg.tar.zst`).

## Generar el paquete

Desde la raíz del proyecto:

```bash
chmod +x arch/build-arch.sh
./arch/build-arch.sh
```

Esto ejecuta la compilación y genera el archivo en la carpeta `release/`.

## Instalación manual

```bash
sudo pacman -U ./release/MongoDBModeler-1.1.1-linux-x64.pkg.tar.zst
```

## Script directo

También puedes usar el comando de npm:

```bash
npm run desktop:dist:linux:arch
```

Si prefieres, puedes apuntar a la construcción específica para x64 o arm64:

```bash
npm run desktop:dist:linux:x64
npm run desktop:dist:linux:arm64
```

> En Arch, el paquete se instala con `pacman` y queda disponible desde el menú de aplicaciones.
