# IT Toolkit - Diagnóstico y Mantenimiento (Electron)

Aplicación de escritorio para el departamento de IT, compilada como `.exe` de
Windows portable (un único archivo, sin instalación).

## Utilidades incluidas

1. Test de Velocidad (descarga/subida/ping propios).
2. Diagnóstico del PC (RAM, CPU, GPU, disco).
3. Activar Alto Rendimiento (plan de energía).
4. Ejecutar SFC /SCANNOW.
5. Reparar Windows (DISM).
6. Actualizar Drivers de la GPU.
7. **Analizar Visor de Eventos**: consulta automática del registro de
   eventos de Windows (log System) buscando apagados inesperados, BugCheck,
   errores WHEA (hardware), errores de disco/NTFS y errores de servicios.
   Genera un informe con interpretación en lenguaje sencillo, recomendaciones
   automáticas, tabla ordenable de los últimos 20 eventos críticos, y
   exportación a PDF, HTML o TXT.
8. **Evaluar Estado del Equipo** (nueva): agrega los datos de Diagnóstico del
   PC, Visor de Eventos, drivers de GPU y (si se han ejecutado en la misma
   sesión) SFC/DISM, y calcula una puntuación global de 1 a 10 por categoría
   (CPU, RAM, GPU, Disco, Drivers, Sistema, Eventos críticos, Rendimiento),
   con clasificación visual (Excelente/Bueno/Aceptable/Deficiente/Crítico),
   barra de "índice de salud" con color, resumen ejecutivo en lenguaje natural
   y recomendaciones priorizadas (alta/media/baja). Exportable a PDF/HTML/TXT.

## Cómo volver a compilar el .exe

```
npm install
npm run dist
```

El ejecutable aparece en `dist/ITToolkit.exe`. Este mismo comando se ejecutó
en el entorno de Anthropic usando Wine para generar el .exe que se te entrega.

## Corrección importante: la ventana de credenciales de administrador no aparecía

**Causa del problema:** PowerShell no permite combinar `Start-Process -Verb RunAs`
(que es lo que dispara el aviso de UAC) con `-RedirectStandardOutput` /
`-RedirectStandardError` en la misma llamada — son parámetros mutuamente
excluyentes. La primera versión de SFC y DISM intentaba elevar permisos y
capturar la salida al mismo tiempo con esa combinación, así que PowerShell
lanzaba un error inmediato y el aviso de UAC **nunca llegaba a mostrarse**.

**Solución aplicada:**
- Para SFC y DISM: el comando y su redirección de salida (`> archivo 2>&1`)
  ahora se ejecutan dentro de un `.bat` temporal, y solo se eleva la ejecución
  de ese `.bat` (`Start-Process -Verb RunAs` sin parámetros de redirección).
  Así el UAC aparece siempre correctamente.
- Para **Analizar Visor de Eventos**: ahora también solicita permisos de
  administrador (mismo mecanismo, con un script de PowerShell temporal en
  vez de un `.bat`), tal como pediste. Esto además evita fallos silenciosos
  en entornos donde la lectura del registro de eventos esté restringida por
  política de grupo.
- Si el técnico cancela el aviso de UAC (pulsa "No"), la aplicación lo
  detecta y lo indica claramente en el resultado, en vez de fallar sin
  explicación.

## Notas técnicas sobre la Utilidad 8

- **No relanza SFC ni DISM automáticamente** (son operaciones de varios
  minutos que requieren UAC); reutiliza el resultado si el técnico ya las
  ejecutó en la misma sesión de la aplicación. Si no se han ejecutado, la
  categoría "Sistema" recibe una puntuación neutra (7/10) con una nota
  explicándolo, en vez de penalizar o inventar un resultado.
- Cada categoría se puntúa de forma independiente con umbrales explícitos
  (documentados en el código, `renderer.js`, funciones `score*`) y la
  puntuación global es la media simple de las 8 categorías.
- El resumen ejecutivo y las recomendaciones se generan dinámicamente a
  partir de los datos reales detectados (no son texto fijo): solo mencionan
  RAM alta, disco lleno, apagados inesperados, GPU caliente o driver
  desactualizado si esos problemas existen de verdad en el equipo analizado.

## Notas técnicas sobre la Utilidad 7

- Se consulta el log **System** de Windows vía PowerShell (`Get-WinEvent`),
  filtrando por los IDs de evento asociados a: Kernel-Power (41, 6008),
  reinicios/apagados normales (1074, 6005, 6006), BugCheck (1001),
  WHEA-Logger (17,18,19,47), errores de disco/NTFS (7,11,51,153,55) y
  Service Control Manager (7000,7001,7009,7011,7016,7026,7031,7034).
- El "motivo del reinicio" y el "usuario que lo inició" se obtienen
  analizando el evento 1074, cuyo mensaje varía según el idioma de Windows;
  el parseo del usuario es un best-effort (busca "Usuario:" o "User:" en el
  texto) y puede no encontrarlo en todos los idiomas/versiones de Windows.
- El "tiempo encendido antes del reinicio" se calcula como la diferencia
  entre el evento de apagado/reinicio anterior y el evento de arranque (6005)
  previo a ese apagado. Si no se encuentran ambos eventos en el rango de
  fechas analizado, se muestra "Desconocido".
- Por defecto se analizan los últimos 30 días; el técnico puede cambiar el
  rango (7/15/30/60/90 días) con el selector que aparece en el propio informe.
- La exportación a PDF utiliza una ventana oculta de Chromium
  (`webContents.printToPDF`), ya incluida en Electron, sin dependencias
  adicionales.

## Estructura del proyecto

```
ITToolkitElectron/
├── package.json          (config de electron-builder)
├── main.js                (proceso principal: toda la lógica de sistema)
├── preload.js              (puente seguro hacia el renderer)
├── build/icon.ico
└── renderer/
    ├── index.html
    ├── styles.css
    └── renderer.js         (interfaz y lógica de las 7 utilidades)
```

## Limitaciones conocidas (heredadas de la versión anterior)

- El test de velocidad mide contra servidores públicos estándar (Cloudflare),
  no hace scraping de la web de Movistar (frágil y sin API pública). Se añade
  un botón para abrir esa web como referencia.
- La temperatura de GPU solo se obtiene de forma fiable para NVIDIA (vía
  `nvidia-smi`). Para AMD/Intel se informa honestamente que no se pudo
  obtener, tal como pedía la especificación original.
- La "última versión disponible" del driver de GPU no se compara
  automáticamente (no hay catálogo público fiable sin scraping de terceros);
  se usa la fecha del driver instalado como heurística y se enlaza siempre a
  la página oficial del fabricante.
