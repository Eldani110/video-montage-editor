# 🎬 Montage Studio — Video Montage & AI Director

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black&style=for-the-badge" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite&logoColor=white&style=for-the-badge" alt="Vite" />
  <img src="https://img.shields.io/badge/WebCodecs-Hardware_Accelerated-FF6F00?style=for-the-badge" alt="WebCodecs" />
  <img src="https://img.shields.io/badge/HuggingFace-Whisper_STT-FFD21E?logo=huggingface&logoColor=black&style=for-the-badge" alt="Hugging Face" />
  <img src="https://img.shields.io/badge/Firebase-Auth-FFCA28?logo=firebase&logoColor=black&style=for-the-badge" alt="Firebase" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License" />
</p>

**Montage Studio** es una estación de trabajo de edición de video no lineal (NLE) moderna y acelerada por hardware que corre directamente en el navegador web. Integra un **Director de Escenas por IA**, sincronización automática de B-Roll, transcripción de voz a texto en tiempo real con modelos Whisper / Gemini, overlays gráficos animados y exportación ultrarrápida MP4/WebM con WebCodecs.

---

## ✨ Características Principales

### 🎞️ Línea de Tiempo Multi-Pista Profesional (NLE)
- **Pistas Independientes:** Soporte para Pista Principal (V1), B-Roll (V2), Capas Gráficas y Títulos (V3), Audio/Música (A1, A2) y Subtítulos (SUB).
- **Herramientas de Edición:** Corte con cuchilla (`S`), eliminación con ripple delete, recorte en bordes, snapping magnético, selección múltiple (Marquee) y zoom interactivo.
- **Waveforms de Audio:** Representación visual de ondas sonoras en tiempo real y detección de beats para cortes sincronizados.

### 🤖 Director de Escenas & Storyboard Inteligente
- **Análisis de Narrativa:** Detección y desglose automático de escenas a partir de guiones o audio transcrito.
- **Auto B-Roll Batch Downloader:** Búsqueda y descarga por lotes de videos de stock en alta definición directamente al almacenamiento local (`projects_media/`).
- **Integración Stock Media:** Motores integrados para **Pexels**, **Pixabay** y **DuckDuckGo Media** con proxies de descarga optimizados en Vite.

### 🎙️ Transcripción por IA y Generación de Subtítulos
- **Whisper en el Navegador:** Transcripción local sin enviar audio a servidores externos mediante `@huggingface/transformers` en Web Workers.
- **Google Gemini STT:** Opción de transcripción de alta precisión en la nube con modelos Gemini.
- **Estilos de Subtítulos Dinámicos:** Animaciones de texto tipo karaoke, cajas de realce, fuentes personalizadas y sincronización exacta a la milésima de segundo.

### 🎨 Gráficos Animados y Overlays (Lower Thirds)
- Títulos cinematográficos, tercios inferiores animados, llamadas a la acción (CTA / Suscripciones) y transiciones fluidas.
- Inspector completo para posición, escala, rotación, opacidad y curvas de aceleración (ease-in-out).

### ⚡ Motor de Renderizado y Exportación Client-Side
- Renderizado de video acelerado por GPU utilizando **WebCodecs** y empaquetadores **`mp4-muxer`** y **`webm-muxer`**.
- Exportación en **1080p Full HD**, **4K Ultra HD**, **720p**, a 30 o 60 FPS con ajuste dinámico de bitrate.
- Exportación 100% en cliente sin colas de procesamiento en servidores pesados.

### ☁️ Proyectos y Autenticación Firebase
- Autenticación segura mediante Firebase Auth (Google y Email/Contraseña).
- Guardado y restauración de proyectos en la nube y persistencia en LocalStorage/IndexedDB.

---

## 🚀 Requisitos Previos

- [Node.js](https://nodejs.org/) (versión 18 o superior recomendada, Node 20+ ideal)
- [npm](https://www.npmjs.com/) o [pnpm](https://pnpm.io/)
- Navegador moderno con soporte para **WebCodecs API** (Google Chrome, Microsoft Edge, Brave u Opera)

---

## 🛠️ Instalación y Puesta en Marcha

1. **Clonar el repositorio:**
   ```bash
   git clone git@github.com:Eldani110/video-montage-editor.git
   cd video-montage-editor
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno (Opcional):**
   Copia el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```
   *Nota: El proyecto incluye configuración predeterminada lista para funcionar en desarrollo sin necesidad obligatoria de `.env`.*

4. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   Abre tu navegador en `http://localhost:5173` (o la URL indicada en la consola).

5. **Construir para producción:**
   ```bash
   npm run build
   ```

6. **Comprobar calidad de código (Linter):**
   ```bash
   npm run lint
   ```

---

## ⌨️ Atajos de Teclado Principales

| Atajo | Acción |
| :--- | :--- |
| `Espacio` | Reproducir / Pausar reproducción |
| `S` | Dividir clip seleccionado en la posición del cabezal (Split) |
| `Supr` / `Backspace` | Eliminar clip seleccionado |
| `Ctrl + Z` / `Cmd + Z` | Deshacer acción (Undo) |
| `Ctrl + Y` / `Cmd + Shift + Z` | Rehacer acción (Redo) |
| `I` / `O` | Marcar punto de entrada (In) / salida (Out) |
| `Flecha Izq` / `Der` | Avanzar / Retroceder un fotograma |
| `Shift + Scroll` | Desplazamiento horizontal por la línea de tiempo |
| `Ctrl + Scroll` | Zoom in / Zoom out en la línea de tiempo |

---

## 📂 Estructura del Proyecto

```plaintext
video-montage-editor/
├── .github/
│   └── workflows/
│       └── ci.yml               # Flujo de Integración Continua (CI)
├── projects_media/              # Almacenamiento local de videos B-roll descargados (ignorado en git)
├── public/                      # Assets estáticos y fuentes
├── src/
│   ├── assets/                  # Iconos, stickers y recursos gráficos
│   ├── components/              # Componentes de UI principales
│   │   ├── EditorPage.jsx       # Vista principal de la estación de trabajo
│   │   ├── Timeline.jsx         # Línea de tiempo interactiva multi-pista
│   │   ├── PreviewPlayer.jsx    # Reproductor canvas con composición de capas
│   │   ├── SceneDirectorModal.jsx # Director de escenas por IA
│   │   ├── SceneStoryboardPanel.jsx # Panel del Storyboard
│   │   ├── AutoBrollBatchModal.jsx  # Descarga por lotes de videos de stock
│   │   ├── TranscribeModal.jsx  # Modal de transcripción Whisper/Gemini
│   │   ├── ClipInspector.jsx    # Panel de propiedades y efectos de clips
│   │   ├── ExportModal.jsx      # Exportador WebCodecs MP4/WebM
│   │   └── ...
│   ├── firebase/                # Inicialización y configuración de Firebase
│   ├── utils/                   # Utilidades de audio, WebCodecs, media y IA
│   └── workers/                 # Web Workers (Whisper HuggingFace, etc.)
├── .env.example                 # Plantilla de variables de entorno
├── .gitignore                   # Exclusiones de archivos para Git
├── package.json                 # Dependencias y scripts de ejecución
├── vite.config.js               # Configuración de Vite y API proxy local para media
└── README.md                    # Documentación del proyecto
```

---

## 🔒 Privacidad y Almacenamiento

- **Archivos multimedia locales:** Los videos descargados por el servidor de desarrollo se almacenan en `projects_media/` y están excluidos del control de versiones por defecto en `.gitignore` para mantener el repositorio ligero y rápido.
- **Modelos IA en el cliente:** La transcripción Whisper se ejecuta en local mediante WebAssembly y WebGPU/CPU en un Web Worker en el navegador.

---

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas!
1. Haz un Fork del proyecto
2. Crea una rama para tu feature (`git checkout -b feature/NuevaFuncionalidad`)
3. Haz commit de tus cambios (`git commit -m 'feat: añadir nueva funcionalidad'`)
4. Haz push a la rama (`git push origin feature/NuevaFuncionalidad`)
5. Abre un Pull Request

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.
