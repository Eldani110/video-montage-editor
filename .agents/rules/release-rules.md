---
description: Activación del comando "lánzala" para publicar una nueva versión de Montage Studio
always_on: true
---

# Regla de Lanzamiento y Publicación Automática

Cuando el usuario escriba comandos cortos como:
- **"lánzala"**
- **"lanza la versión"**
- **"publica release"**
- **"lanzar actualización"**

El agente debe:
1. Activar de inmediato la habilidad `@skill:release-montage-studio`.
2. Verificar la compilación local con `npm run build`.
3. Determinar la versión a incrementar (por defecto `patch` si no se especifica otra).
4. Commitear los cambios pendientes y ejecutar el incremento de versión y tag (`npm version patch -m "chore(release): v%s"`).
5. Subir a GitHub (`git push origin <branch> --tags`) para que el workflow de GitHub Actions compile y distribuya los instaladores para Linux, Windows y macOS automáticamente a todos los usuarios.
