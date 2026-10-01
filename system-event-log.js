/**
 * @file system-event-log.js
 * @description Módulo para la consulta, filtrado, extracción y correlación forense
 * de registros de eventos de Windows (Windows → Registros de Windows → Sistema)
 * enfocado estrictamente en eventos de apagado, reinicio y fallos críticos (BSOD).
 *
 * Event IDs monitorizados:
 *   - 41   (Microsoft-Windows-Kernel-Power): Reinicio o apagado no limpio previo.
 *   - 6008 (EventLog): El apagado anterior del sistema fue inesperado.
 *   - 1001 (BugCheck / WER): Windows registró una comprobación de error / BSOD.
 *   - 1074 (User32): Un usuario o proceso inició explícitamente el apagado/reinicio.
 *
 * Arquitectura segura:
 *   Renderer → (IPC) → Preload (contextBridge) → Main Process (child_process.execFile) → PowerShell Get-WinEvent
 */

const { execFile } = require('child_process');
const os = require('os');

/**
 * @typedef {Object} SystemEvent
 * @property {number} id - Identificador de Evento (41, 6008, 1001, 1074)
 * @property {string} provider - Nombre del proveedor (ej. Microsoft-Windows-Kernel-Power, EventLog, etc.)
 * @property {string} level - Nivel legible del evento (Crítico, Error, Advertencia, Información)
 * @property {number} [levelValue] - Valor numérico del nivel
 * @property {string} timeCreated - Timestamp en formato ISO-8601 UTC
 * @property {string} message - Descripción completa registrada por Windows
 * @property {string} [computerName] - Nombre del equipo / host
 * @property {number|null} [processId] - ID del proceso
 * @property {number|null} [threadId] - ID del hilo
 * @property {number|null} [recordId] - ID secuencial único del registro de eventos
 * @property {string[]} [keywords] - Palabras clave del evento
 * @property {string} [task] - Categoría / Tarea asociada
 * @property {string} [opcode] - Código de operación
 * @property {string[]} [rawProperties] - Propiedades directas del objeto de evento
 * @property {Object} [parsedDetails] - Parámetros extraídos e interpretados (códigos stop, motivos, etc.)
 */

/**
 * @typedef {Object} RebootSequence
 * @property {string} id - Identificador único de la secuencia
 * @property {'unexpected_reboot'|'explicit_reboot'|'explicit_shutdown'|'standalone_bsod'|'standalone'} type
 * @property {string} title - Título de la secuencia (ej. "Reinicio inesperado", "Reinicio iniciado explícitamente")
 * @property {string} timeCreated - Timestamp ISO principal
 * @property {string} formattedDate - Fecha y hora legible en español
 * @property {boolean} has41 - Si incluye evento 41 Kernel-Power
 * @property {boolean} has6008 - Si incluye evento 6008 EventLog
 * @property {boolean} has1001 - Si incluye evento 1001 BugCheck (BSOD)
 * @property {boolean} has1074 - Si incluye evento 1074 User32
 * @property {SystemEvent} primaryEvent - Evento principal de la secuencia
 * @property {SystemEvent|null} [accompaniedBy] - Evento acompañante (ej. 6008 tras un 41)
 * @property {SystemEvent[]} relatedEvents - Eventos relacionados temporalmente (ej. BugCheck 1001)
 * @property {string} diagnosis - Diagnóstico técnico contextualizado
 * @property {string} recommendation - Recomendación técnica sugerida
 * @property {boolean} isHardwareFailure - False por defecto (el evento 41 no debe interpretarse automáticamente como fallo de hardware)
 */

/**
 * Extrae parámetros técnicos avanzados de un evento según su ID.
 * @param {number} id
 * @param {string} message
 * @param {string[]} rawProperties
 * @returns {Object}
 */
function extractEventDetails(id, message = '', rawProperties = []) {
  const details = {};
  const msg = String(message || '');

  if (id === 41) {
    // 41 - Microsoft-Windows-Kernel-Power
    // Propiedades: BugcheckCode, BugcheckParameter1..4, SleepInProgress, PowerButtonTimestamp
    const bugcheckNum = parseInt(rawProperties[0] || '0', 10);
    const hasBugcheck = !isNaN(bugcheckNum) && bugcheckNum !== 0;
    details.bugcheckCode = hasBugcheck ? `0x${bugcheckNum.toString(16).toUpperCase().padStart(8, '0')}` : '0x00000000';
    details.param1 = rawProperties[1] || '0x0';
    details.param2 = rawProperties[2] || '0x0';
    details.param3 = rawProperties[3] || '0x0';
    details.param4 = rawProperties[4] || '0x0';
    details.sleepInProgress = rawProperties[5] || '0';
    details.powerButtonTimestamp = rawProperties[6] || '0';
    details.powerButtonForced = details.powerButtonTimestamp && details.powerButtonTimestamp !== '0';

    if (details.powerButtonForced) {
      details.specificCause = 'Pulsación forzada del botón físico de encendido (Power Button)';
    } else if (hasBugcheck) {
      details.specificCause = `Reinicio tras comprobación de error previa (BugCheck ${details.bugcheckCode})`;
    } else {
      details.specificCause = 'Pérdida de alimentación repentina o corte eléctrico (Windows no se apagó limpiamente)';
    }
  } else if (id === 6008) {
    // 6008 - EventLog
    // Propiedades: Hora, Fecha
    details.shutdownTime = rawProperties[0] || '';
    details.shutdownDate = rawProperties[1] || '';
    details.specificCause = details.shutdownTime && details.shutdownDate
      ? `El apagado anterior registrado el ${details.shutdownDate} a las ${details.shutdownTime} resultó inesperado`
      : 'El apagado previo en la sesión anterior resultó inesperado';
  } else if (id === 1001) {
    // 1001 - BugCheck / WER
    const codeMatch = msg.match(/0x[0-9a-fA-F]{6,10}/i) || (rawProperties[0] && rawProperties[0].match(/0x[0-9a-fA-F]{6,10}/i));
    details.stopCode = codeMatch ? codeMatch[0].toUpperCase() : '0x00000000';
    const dumpMatch = msg.match(/[A-Za-z]:\\[^ \t\r\n]+\.dmp/i);
    details.dumpPath = dumpMatch ? dumpMatch[0] : (rawProperties[1] || 'C:\\Windows\\MEMORY.DMP');
    const werMatch = msg.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9]{10,})/i);
    details.reportId = werMatch ? werMatch[0] : (rawProperties[2] || 'N/D');
    details.specificCause = `Fallo grave de kernel (Pantallazo Azul BSOD - Código ${details.stopCode})`;
  } else if (id === 1074) {
    // 1074 - User32
    // Propiedades: Process, Machine, Action, ReasonCode, Reason, User, Comment
    details.process = rawProperties[0] || 'C:\\Windows\\System32\\shutdown.exe';
    details.machine = rawProperties[1] || '';
    const actionText = (rawProperties[2] || '').toLowerCase();
    details.isReboot = actionText.includes('reinic') || actionText.includes('reboot') || actionText.includes('restart');
    details.action = details.isReboot ? 'reinicio' : 'apagado';
    details.reasonCode = rawProperties[3] || '0x00000000';
    details.reason = rawProperties[4] || (details.isReboot ? 'Reinicio planificado' : 'Apagado ordenado');
    details.user = rawProperties[5] || 'Usuario / Sistema';
    details.comment = rawProperties[6] || '';
    details.specificCause = `${details.isReboot ? 'Reinicio' : 'Apagado'} ordenado iniciado por ${details.user} mediante ${details.process}`;
  }

  return details;
}

/**
 * Consulta el registro de Windows de forma segura usando child_process.execFile y Get-WinEvent.
 *
 * @param {Object} [options]
 * @param {number} [options.hours] - Filtrar eventos de las últimas X horas (ej. 24, 48, 168)
 * @param {number} [options.days]  - Filtrar eventos de los últimos X días (ej. 1, 7, 30)
 * @param {number} [options.limit=100] - Máximo número de eventos a recuperar (validado de 1 a 500)
 * @returns {Promise<SystemEvent[]>} Lista ordenada cronológicamente (más recientes primero)
 */
function getSystemEvents(options = {}) {
  return new Promise((resolve, reject) => {
    // 1. Validación estricta de parámetros para seguridad
    let hours = 0;
    if (Number.isInteger(options.hours) && options.hours > 0) {
      hours = options.hours;
    } else if (Number.isInteger(options.days) && options.days > 0) {
      hours = options.days * 24;
    }

    const limit = Number.isInteger(options.limit) && options.limit > 0 && options.limit <= 500
      ? options.limit
      : 100;

    // Si estamos en un entorno que no es Windows (p. ej. contenedor de desarrollo o Linux preview)
    if (process.platform !== 'win32') {
      const mockEvents = generateMockSystemEvents(hours, limit);
      return resolve(mockEvents);
    }

    // 2. Construcción segura del script de PowerShell (sin concatenación directa de entradas de usuario arbitrarias)
    const psScript = `
$OutputEncoding = [System.Text.Encoding]::UTF8;
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
$filter = @{ LogName = 'System'; Id = @(41, 6008, 1001, 1074) };
if (${hours} -gt 0) {
    $filter.StartTime = (Get-Date).AddHours(-${hours});
}
try {
    $events = Get-WinEvent -FilterHashtable $filter -MaxEvents ${limit} -ErrorAction Stop;
} catch {
    $msg = $_.Exception.Message;
    if ($msg -match 'No events were found' -or $msg -match 'No matching events' -or $_.FullyQualifiedErrorId -match 'NoMatchingEventsFound') {
        $events = @();
    } else {
        [Console]::Error.WriteLine($msg);
        exit 1;
    }
}

$outList = @($events | ForEach-Object {
    $rawProps = @();
    if ($_.Properties) {
        $rawProps = @($_.Properties | ForEach-Object { if ($null -ne $_.Value) { "$($_.Value)" } else { "" } });
    }
    [PSCustomObject]@{
        id = [int]$_.Id;
        provider = "$($_.ProviderName)";
        level = if ($_.LevelDisplayName) { "$($_.LevelDisplayName)" } else { "$($_.Level)" };
        levelValue = [int]$_.Level;
        timeCreated = $_.TimeCreated.ToString("o");
        message = if ($_.Message) { "$($_.Message)".Trim() } else { "" };
        computerName = "$($_.MachineName)";
        processId = if ($null -ne $_.ProcessId) { [int]$_.ProcessId } else { $null };
        threadId = if ($null -ne $_.ThreadId) { [int]$_.ThreadId } else { $null };
        recordId = if ($null -ne $_.RecordId) { [int64]$_.RecordId } else { $null };
        keywords = @($_.KeywordsDisplayNames | ForEach-Object { "$_" });
        task = if ($_.TaskDisplayName) { "$($_.TaskDisplayName)" } else { "$($_.Task)" };
        opcode = if ($_.OpcodeDisplayName) { "$($_.OpcodeDisplayName)" } else { "$($_.Opcode)" };
        rawProperties = $rawProps;
    };
});

$json = $outList | ConvertTo-Json -Depth 4 -Compress;
[Console]::Out.Write($json);
`;

    // 3. Ejecución segura con execFile a powershell.exe con argumentos aislados
    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      psScript
    ];

    execFile('powershell.exe', args, { maxBuffer: 15 * 1024 * 1024, timeout: 35000 }, (err, stdout, stderr) => {
      if (err) {
        const errorMsg = stderr ? stderr.trim() : err.message;
        // Si no se encontraron eventos, resolvemos array vacío sin fallar
        if (errorMsg.includes('No events were found') || errorMsg.includes('NoMatchingEventsFound')) {
          return resolve([]);
        }
        return reject(new Error(`Error al consultar el registro de Windows: ${errorMsg}`));
      }

      const out = (stdout || '').trim();
      if (!out || out === 'null') {
        return resolve([]);
      }

      try {
        let parsed = JSON.parse(out);
        if (!Array.isArray(parsed)) {
          parsed = [parsed];
        }

        // Normalizar y enriquecer cada evento
        const normalized = parsed.map(ev => {
          const item = {
            id: Number(ev.id),
            provider: String(ev.provider || 'System'),
            level: translateLevel(ev.level, ev.id),
            levelValue: ev.levelValue != null ? Number(ev.levelValue) : 0,
            timeCreated: String(ev.timeCreated || new Date().toISOString()),
            message: String(ev.message || ''),
            computerName: String(ev.computerName || os.hostname()),
            processId: ev.processId != null ? Number(ev.processId) : null,
            threadId: ev.threadId != null ? Number(ev.threadId) : null,
            recordId: ev.recordId != null ? Number(ev.recordId) : null,
            keywords: Array.isArray(ev.keywords) ? ev.keywords : [],
            task: String(ev.task || ''),
            opcode: String(ev.opcode || ''),
            rawProperties: Array.isArray(ev.rawProperties) ? ev.rawProperties : []
          };
          item.parsedDetails = extractEventDetails(item.id, item.message, item.rawProperties);
          return item;
        });

        // Ordenar cronológicamente descendente (más recientes primero)
        normalized.sort((a, b) => new Date(b.timeCreated) - new Date(a.timeCreated));

        resolve(normalized);
      } catch (jsonErr) {
        reject(new Error(`Error al parsear respuesta JSON de Get-WinEvent: ${jsonErr.message}`));
      }
    });
  });
}

/**
 * Traduce el nivel numérico o de PowerShell a una etiqueta legible estandarizada.
 * @param {string|number} level
 * @param {number} eventId
 * @returns {string}
 */
function translateLevel(level, eventId) {
  const l = String(level || '').toLowerCase();
  if (l.includes('crit') || l === '1' || eventId === 41 || eventId === 1001) return 'Crítico';
  if (l.includes('err') || l === '2') return 'Error';
  if (l.includes('warn') || l.includes('advert') || l === '3' || eventId === 6008) return 'Advertencia';
  if (l.includes('info') || l === '4' || eventId === 1074) return 'Información';
  return 'Informativo';
}

/**
 * Obtiene el evento de reinicio o apagado más reciente registrado.
 * @returns {Promise<SystemEvent|null>}
 */
async function getLatestSystemEvent() {
  const events = await getSystemEvents({ limit: 1 });
  return events.length > 0 ? events[0] : null;
}

/**
 * Identifica posibles secuencias de reinicio y correlaciona eventos temporalmente.
 *
 * Reglas de correlación:
 *  - Si hay un evento 41 (Kernel-Power):
 *      * Busca si está acompañado de un 6008 (apagado inesperado) en una ventana de ~15 minutos.
 *      * Busca si hubo un 1001 (BugCheck BSOD) inmediatamente antes o en la misma ventana.
 *      * IMPORTANTE: El evento 41 NO se interpreta automáticamente como fallo de hardware;
 *        solo indica que Windows no se apagó correctamente.
 *  - Si hay un evento 1074:
 *      * Diferencia un reinicio/apagado iniciado explícitamente por el usuario, Windows o un proceso.
 *
 * @param {SystemEvent[]} events - Lista de eventos ordenados cronológicamente
 * @returns {Object} Informe con secuencias correlacionadas y métricas
 */
function correlateRebootSequences(events = []) {
  const sequences = [];
  const processedRecordIds = new Set();

  let count41 = 0;
  let count6008 = 0;
  let count1001 = 0;
  let count1074 = 0;

  events.forEach(e => {
    if (e.id === 41) count41++;
    else if (e.id === 6008) count6008++;
    else if (e.id === 1001) count1001++;
    else if (e.id === 1074) count1074++;
  });

  const WINDOW_MS = 15 * 60 * 1000; // Ventana de correlación de 15 minutos

  for (let i = 0; i < events.length; i++) {
    const current = events[i];
    const curKey = `${current.id}_${current.timeCreated}`;
    if (processedRecordIds.has(curKey)) continue;

    const curTime = new Date(current.timeCreated).getTime();

    // ── 1. Secuencia de Reinicio Inesperado (Event ID 41) ─────────────────
    if (current.id === 41) {
      processedRecordIds.add(curKey);

      // Buscar si vino acompañado de un 6008
      let companion6008 = null;
      // Buscar si hubo un 1001 relacionado (BSOD)
      const related1001List = [];

      for (let j = 0; j < events.length; j++) {
        if (i === j) continue;
        const other = events[j];
        const otherKey = `${other.id}_${other.timeCreated}`;
        if (processedRecordIds.has(otherKey)) continue;

        const otherTime = new Date(other.timeCreated).getTime();
        const diff = Math.abs(curTime - otherTime);

        if (diff <= WINDOW_MS) {
          if (other.id === 6008 && !companion6008) {
            companion6008 = other;
            processedRecordIds.add(otherKey);
          } else if (other.id === 1001) {
            related1001List.push(other);
            processedRecordIds.add(otherKey);
          }
        }
      }

      const hasBsod = related1001List.length > 0;
      let diagText = '';
      if (hasBsod) {
        const stopCode = related1001List[0].parsedDetails?.stopCode || 'BSOD';
        diagText = `El sistema experimentó una comprobación de error crítica (BugCheck ${stopCode}) provocando el reinicio del equipo.`;
      } else if (current.parsedDetails?.powerButtonForced) {
        diagText = 'El equipo se apagó de forma forzada al mantener pulsado el botón físico de encendido.';
      } else {
        diagText = 'Reinicio inesperado sin apagado limpio previo. Esto ocurre cuando se interrumpe la corriente eléctrica o el sistema deja de responder.';
      }

      sequences.push({
        id: `seq-${current.recordId || i}`,
        type: 'unexpected_reboot',
        title: 'Reinicio inesperado',
        timeCreated: current.timeCreated,
        formattedDate: formatDateTimeEs(current.timeCreated),
        has41: true,
        has6008: !!companion6008,
        has1001: hasBsod,
        has1074: false,
        primaryEvent: current,
        accompaniedBy: companion6008,
        relatedEvents: related1001List,
        diagnosis: diagText,
        // Recordatorio de directriz: No interpretar automáticamente el 41 como fallo de hardware
        isHardwareFailure: false,
        hardwareNote: 'El Event ID 41 solamente indica que Windows no se apagó correctamente; no implica necesariamente una avería física de hardware.',
        recommendation: hasBsod
          ? 'Analizar el archivo de volcado minidump, verificar controladores actualizados y ejecutar comprobación de memoria RAM.'
          : 'Verificar la toma de corriente, regleta o SAI. Comprobar que el usuario no fuerce el apagado con el botón físico.'
      });
      continue;
    }

    // ── 2. Evento 1074 (Reinicio o Apagado Iniciado Explícitamente) ───────
    if (current.id === 1074) {
      processedRecordIds.add(curKey);
      const isReboot = current.parsedDetails?.isReboot ?? false;
      const title = isReboot
        ? 'Reinicio iniciado explícitamente'
        : 'Apagado iniciado explícitamente';

      sequences.push({
        id: `seq-${current.recordId || i}`,
        type: isReboot ? 'explicit_reboot' : 'explicit_shutdown',
        title,
        timeCreated: current.timeCreated,
        formattedDate: formatDateTimeEs(current.timeCreated),
        has41: false,
        has6008: false,
        has1001: false,
        has1074: true,
        primaryEvent: current,
        accompaniedBy: null,
        relatedEvents: [],
        diagnosis: `Operación iniciada explícitamente por ${current.parsedDetails?.user || 'el usuario'} a través de ${current.parsedDetails?.process || 'shutdown.exe'}. Motivo registrado: "${current.parsedDetails?.reason || 'Planificado'}".`,
        isHardwareFailure: false,
        recommendation: 'Operación normal y ordenada. No requiere intervención técnica.'
      });
      continue;
    }

    // ── 3. Evento 6008 Aislado (Apagado Sucio sin 41 en la ventana) ───────
    if (current.id === 6008) {
      processedRecordIds.add(curKey);
      sequences.push({
        id: `seq-${current.recordId || i}`,
        type: 'unexpected_shutdown',
        title: 'Apagado inesperado detectado',
        timeCreated: current.timeCreated,
        formattedDate: formatDateTimeEs(current.timeCreated),
        has41: false,
        has6008: true,
        has1001: false,
        has1074: false,
        primaryEvent: current,
        accompaniedBy: null,
        relatedEvents: [],
        diagnosis: current.parsedDetails?.specificCause || 'El sistema detectó en el arranque que la sesión anterior se interrumpió de forma anómala.',
        isHardwareFailure: false,
        recommendation: 'Verificar estabilidad del suministro eléctrico. Ejecutar comprobación SFC para garantizar integridad de archivos.'
      });
      continue;
    }

    // ── 4. Evento 1001 Aislado (BSOD registrado) ─────────────────────────
    if (current.id === 1001) {
      processedRecordIds.add(curKey);
      sequences.push({
        id: `seq-${current.recordId || i}`,
        type: 'standalone_bsod',
        title: 'Comprobación de error (Pantallazo Azul BSOD)',
        timeCreated: current.timeCreated,
        formattedDate: formatDateTimeEs(current.timeCreated),
        has41: false,
        has6008: false,
        has1001: true,
        has1074: false,
        primaryEvent: current,
        accompaniedBy: null,
        relatedEvents: [],
        diagnosis: `Comprobación de error (BugCheck) generada por el Kernel. Código de parada: ${current.parsedDetails?.stopCode || '0x00000000'}.`,
        isHardwareFailure: false,
        recommendation: 'Revisar volcados de memoria y comprobar controladores instalados recientemente.'
      });
      continue;
    }
  }

  // Métricas y puntuación de estabilidad
  const total = events.length;
  const unexpectedCount = count41 + count6008 + count1001;
  const stabilityPct = total === 0 ? 100 : Math.max(10, Math.round(((total - unexpectedCount) / Math.max(total, 1)) * 100));

  return {
    summary: {
      totalEvents: total,
      count41,
      count6008,
      count1001,
      count1074,
      unexpectedRebootsCount: count41,
      unexpectedShutdownsCount: count6008,
      bsodCount: count1001,
      explicitCount: count1074,
      stabilityScore: `${stabilityPct}%`,
      statusLabel: unexpectedCount === 0 ? 'Estable' : (unexpectedCount <= 2 ? 'Atención' : 'Inestable'),
      latestEvent: events.length > 0 ? events[0] : null
    },
    sequences,
    rawEvents: events
  };
}

/**
 * Formatea una fecha ISO a string legible en español.
 * @param {string} isoString
 * @returns {string}
 */
function formatDateTimeEs(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return isoString;
  }
}

/**
 * Genera eventos simulados realistas para entornos no-Windows (previews y tests).
 * @param {number} hours
 * @param {number} limit
 * @returns {SystemEvent[]}
 */
function generateMockSystemEvents(hours = 168, limit = 100) {
  const now = Date.now();
  const host = os.hostname();

  const mockData = [
    {
      id: 1074,
      provider: 'USER32',
      level: 'Información',
      levelValue: 4,
      timeCreated: new Date(now - 3 * 3600 * 1000).toISOString(),
      message: 'El proceso C:\\Windows\\System32\\shutdown.exe (HCP-PC01) ha iniciado el reinicio del equipo en nombre del usuario HCP-ARQ\\Administrador por el siguiente motivo: Mantenimiento del Sistema y Aplicación de Directivas IT.\nCódigo de motivo: 0x84000025\nTipo de apagado: reinicio',
      computerName: host,
      processId: 1084,
      threadId: 2012,
      recordId: 54101,
      keywords: ['0x80000000000000'],
      task: 'None',
      opcode: 'Información',
      rawProperties: [
        'C:\\Windows\\System32\\shutdown.exe',
        host,
        'reinicio',
        '0x84000025',
        'Mantenimiento del Sistema y Aplicación de Directivas IT',
        'HCP-ARQ\\Administrador',
        'Reinicio planificado y finalizado con éxito.'
      ]
    },
    {
      id: 41,
      provider: 'Microsoft-Windows-Kernel-Power',
      level: 'Crítico',
      levelValue: 1,
      timeCreated: new Date(now - 14 * 3600 * 1000).toISOString(),
      message: 'Se reinició el sistema sin apagarlo limpiamente primero. Este error puede producirse si el sistema deja de responder, se bloquea o se interrumpe el suministro eléctrico de forma inesperada.',
      computerName: host,
      processId: 4,
      threadId: 8,
      recordId: 54089,
      keywords: ['0x8000400000000001'],
      task: '63',
      opcode: '0',
      rawProperties: ['0', '0x0', '0x0', '0x0', '0x0', '0', '0']
    },
    {
      id: 6008,
      provider: 'EventLog',
      level: 'Advertencia',
      levelValue: 3,
      timeCreated: new Date(now - 14 * 3600 * 1000 + 4000).toISOString(),
      message: 'El apagado del sistema anterior a las 11:22:15 del 30/09/2026 resultó inesperado.',
      computerName: host,
      processId: 840,
      threadId: 912,
      recordId: 54090,
      keywords: ['0x80000000000000'],
      task: 'None',
      opcode: 'Información',
      rawProperties: ['11:22:15', '30/09/2026']
    },
    {
      id: 1001,
      provider: 'Microsoft-Windows-WER-SystemErrorReporting',
      level: 'Crítico',
      levelValue: 1,
      timeCreated: new Date(now - 14 * 3600 * 1000 - 30000).toISOString(),
      message: 'El equipo se reinició después de una comprobación de error. Código: 0x0000003b (0x00000000c0000005, 0xfffff80156d81230, 0xffffd00123456780, 0x0000000000000000). Se guardó un volcado en: C:\\Windows\\MEMORY.DMP. Id. de informe: 093026-11200-01.',
      computerName: host,
      processId: 1204,
      threadId: 1380,
      recordId: 54088,
      keywords: ['0x80000000000000'],
      task: 'None',
      opcode: 'Información',
      rawProperties: [
        '0x0000003b (0x00000000c0000005, 0xfffff80156d81230, 0xffffd00123456780, 0x0000000000000000)',
        'C:\\Windows\\MEMORY.DMP',
        '093026-11200-01'
      ]
    },
    {
      id: 1074,
      provider: 'USER32',
      level: 'Información',
      levelValue: 4,
      timeCreated: new Date(now - 48 * 3600 * 1000).toISOString(),
      message: 'El proceso C:\\Windows\\System32\\shutdown.exe (HCP-PC01) ha iniciado el apagado del equipo en nombre del usuario HCP-ARQ\\Administrador por el siguiente motivo: Fin de jornada laboral.\nCódigo de motivo: 0x000500ff\nTipo de apagado: apagado',
      computerName: host,
      processId: 980,
      threadId: 1420,
      recordId: 53950,
      keywords: ['0x80000000000000'],
      task: 'None',
      opcode: 'Información',
      rawProperties: [
        'C:\\Windows\\System32\\shutdown.exe',
        host,
        'apagado',
        '0x000500ff',
        'Fin de jornada laboral',
        'HCP-ARQ\\Administrador',
        'Apagado normal sin incidencias.'
      ]
    }
  ];

  return mockData
    .map(ev => {
      ev.parsedDetails = extractEventDetails(ev.id, ev.message, ev.rawProperties);
      return ev;
    })
    .filter(ev => {
      if (hours > 0) {
        const diff = (now - new Date(ev.timeCreated).getTime()) / (3600 * 1000);
        return diff <= hours;
      }
      return true;
    })
    .slice(0, limit);
}

module.exports = {
  getSystemEvents,
  getLatestSystemEvent,
  correlateRebootSequences,
  extractEventDetails,
  formatDateTimeEs
};
