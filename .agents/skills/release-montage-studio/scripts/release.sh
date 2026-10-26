#!/usr/bin/env bash
set -e

BUMP_TYPE="${1:-patch}"

echo "🚀 Iniciando proceso de release de Montage Studio ($BUMP_TYPE)..."

# 1. Comprobación de compilación
echo "📦 Verificando compilación de Vite..."
npm run build

# 2. Comprobación de git
if [ -n "$(git status --porcelain)" ]; then
  echo "📝 Hay cambios locales pendientes. Creando commit de preparación..."
  git add -A
  git commit -m "chore: preparar archivos para lanzamiento de versión"
fi

# 3. Bump de versión
echo "🏷️  Incrementando versión ($BUMP_TYPE)..."
npm version "$BUMP_TYPE" -m "chore(release): v%s"

# 4. Push a GitHub
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "📤 Subiendo cambios y tags a GitHub ($CURRENT_BRANCH)..."
git push origin "$CURRENT_BRANCH" --tags

NEW_VERSION=$(node -p "require('./package.json').version")
echo ""
echo "✅ ¡Lanzamiento v$NEW_VERSION enviado con éxito a GitHub!"
echo "🔗 GitHub Actions: https://github.com/Eldani110/video-montage-editor/actions"
echo "📦 GitHub Releases: https://github.com/Eldani110/video-montage-editor/releases"
