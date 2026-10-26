---
name: release-montage-studio
description: >-
  Lanza, compila y distribuye una nueva versión y release oficial de Montage Studio
  en GitHub Releases para Windows (.exe), Linux (.AppImage, .deb) y macOS (.dmg, .zip).
  Activar automáticamente cada vez que el usuario diga "lánzala", "lanza una versión",
  "publica la release", "haz un release", o solicite publicar una nueva versión del editor.
---

# Procedimiento de Lanzamiento y Publicación (Release) de Montage Studio

Este procedimiento automatiza la creación de una nueva versión empaquetada y su distribución automática a todos los usuarios a través del pipeline de GitHub Actions y GitHub Releases.

## Pasos de Ejecución

### 1. Verificación previa de compilación
Antes de generar una etiqueta de versión, verificar que el proyecto compila sin errores:
```bash
npm run build
```

### 2. Determinar el tipo de versión
Preguntar o deducir el incremento según los cambios realizados:
- **`patch`** (por defecto, ej: `1.0.0` -> `1.0.1`): Correcciones de errores, ajustes de interfaz, optimizaciones.
- **`minor`** (ej: `1.0.0` -> `1.1.0`): Nuevas herramientas (pistas nuevas, nuevos paneles, funciones de IA).
- **`major`** (ej: `1.0.0` -> `2.0.0`): Cambios estructurales completos o incompatibles con proyectos anteriores.

### 3. Asegurar que los cambios están commiteados
Revisar el estado de git:
```bash
git status --short
```
Si hay cambios pendientes relevantes, hacer commit:
```bash
git add -A
git commit -m "feat: mejoras y ajustes para lanzamiento"
```

### 4. Incrementar versión y crear tag
Ejecutar el comando de versionado de npm, que actualiza `package.json`, crea el commit y genera el tag git anotado con prefijo `v`:
```bash
npm version patch -m "chore(release): v%s"
```
*(o `npm version minor` si corresponde)*

### 5. Enviar a GitHub para disparo de CI/CD
Subir los commits y tags a la rama principal:
```bash
git push origin main --tags
```

### 6. Seguimiento y notificación al usuario
Una vez hecho el push:
1. GitHub Actions activará el workflow `.github/workflows/build-desktop.yml`.
2. Compilará en paralelo en Ubuntu (`.AppImage`, `.deb`), Windows (`.exe` NSIS) y macOS (`.dmg`, `.zip`).
3. Creará la Release en: `https://github.com/Eldani110/video-montage-editor/releases`.
4. Informar al usuario el enlace directo a la release y que los usuarios instalados recibirán la actualización automáticamente al abrir la aplicación.
