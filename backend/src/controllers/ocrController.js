const Jimp = require('jimp');
const Tesseract = require('tesseract.js');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Columnas candidatas por nombre de encabezado (case insensitive)
const COLUMN_PATTERNS = {
  orden:    /^(n[°o\.#]?|num[ero\.]*|orden|item|#)$/i,
  sede:     /\b(dept|depto|departamento|region|sede\s*reg[ional]*|sede)\b/i,
  dni:      /\b(dnie?|documento|doc\.?|identidad|dni\s*[\/\\]?\s*ce|dni\s*o\s*ce)\b/i,
  nombres:  /\b(apellidos?\s*y?\s*nombres?|nombres?\s*y?\s*apellidos?|personal|asistente|participante|nombre\s*completo)\b/i,
};

/**
 * Identifica a qué columna semántica corresponde un encabezado.
 */
const classifyHeader = (header) => {
  const h = header.trim();
  for (const [key, pattern] of Object.entries(COLUMN_PATTERNS)) {
    if (pattern.test(h)) return key;
  }
  return null;
};

/**
 * Determina el separador más frecuente en una línea de tabla.
 */
const detectSeparator = (line) => {
  const pipes  = (line.match(/\|/g) || []).length;
  const tabs   = (line.match(/\t/g)  || []).length;
  const semis  = (line.match(/;/g)   || []).length;
  if (pipes > 1)  return '|';
  if (tabs > 1)   return '\t';
  if (semis > 1)  return ';';
  return null;
};

/**
 * Pre-procesa la imagen con Jimp: escala de grises + contraste + escala.
 */
const preprocessImage = async (base64) => {
  const cleaned    = base64.replace(/^data:image\/\w+;base64,/, '');
  const buffer     = Buffer.from(cleaned, 'base64');
  const img        = await Jimp.read(buffer);
  
  // Agrandar para mejorar el OCR, convertir a gris y aumentar contraste
  img
    .resize(img.bitmap.width * 2, Jimp.AUTO)
    .grayscale()
    .contrast(0.5)
    .normalize();

  const tmpPath = path.join(os.tmpdir(), `ocr_${Date.now()}.png`);
  await img.writeAsync(tmpPath);
  return tmpPath;
};

/**
 * Parsea el texto extraído por Tesseract buscando filas de tabla.
 */
const parseTableText = (rawText) => {
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 2);

  // Encontrar el separador dominante
  let separator = null;
  for (const line of lines) {
    const sep = detectSeparator(line);
    if (sep) { separator = sep; break; }
  }

  const registros = [];

  if (separator) {
    // Tabla estructurada con separadores
    const rows = lines.map(l => l.split(separator).map(c => c.trim()));
    
    // Primera fila no vacía → encabezados
    const headerRow = rows.find(r => r.some(c => c.length > 0));
    if (!headerRow) return registros;

    const colMap = {}; // { orden: 0, dni: 2, nombres: 1, sede: 3 }
    headerRow.forEach((cell, idx) => {
      const tipo = classifyHeader(cell);
      if (tipo && !(tipo in colMap)) colMap[tipo] = idx;
    });

    const headerIdx = rows.indexOf(headerRow);
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 2) continue;
      // Descartar filas que parecen separadores (solo guiones/asteriscos)
      if (row.every(c => /^[-=*_|]+$/.test(c) || c === '')) continue;

      const reg = {
        numero_orden:      colMap.orden   !== undefined ? (parseInt(row[colMap.orden])   || null) : null,
        sede_regional:     colMap.sede    !== undefined ? (row[colMap.sede]    || '')     : '',
        nombres_apellidos: colMap.nombres !== undefined ? (row[colMap.nombres] || '')     : '',
        dni:               colMap.dni     !== undefined ? extractDni(row[colMap.dni])     : '',
      };

      // Solo guardar si tiene al menos nombre o dni
      if (reg.nombres_apellidos || reg.dni) {
        registros.push(reg);
      }
    }
  } else {
    // Sin separadores claros → buscar tokens de DNI (8 dígitos consecutivos)
    for (const line of lines) {
      const dniMatch = line.match(/\b(\d{8})\b/);
      if (dniMatch) {
        // Extraer nombre: todo lo que no sea número ni corto
        const sinDni = line.replace(dniMatch[0], '').trim();
        const palabrasNombre = sinDni.split(/\s+/).filter(w => /^[a-zA-ZáéíóúÁÉÍÓÚñÑ]{3,}$/.test(w));
        registros.push({
          numero_orden:      null,
          sede_regional:     '',
          nombres_apellidos: palabrasNombre.join(' ').toUpperCase(),
          dni:               dniMatch[1],
        });
      }
    }
  }

  return registros;
};

/**
 * Extrae el primer DNI (8 dígitos) que aparezca en la celda.
 */
const extractDni = (cell) => {
  if (!cell) return '';
  const m = cell.match(/\b\d{8}\b/);
  return m ? m[0] : cell.replace(/\D/g, '').substring(0, 8);
};

// ─── Controller ──────────────────────────────────────────────────────────────

const procesarFotoLista = async (req, res) => {
  const { imageBase64, aula } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ message: 'Se requiere el campo imageBase64.' });
  }

  let tmpPath = null;
  try {
    console.log('[OCR] Iniciando procesamiento de imagen para lista de asistencia...');
    tmpPath = await preprocessImage(imageBase64);
    console.log('[OCR] Imagen pre-procesada:', tmpPath);

    const { data: { text } } = await Tesseract.recognize(tmpPath, 'spa', {
      logger: m => { if (m.status === 'recognizing text') console.log(`[OCR] Progreso: ${Math.round(m.progress * 100)}%`); },
    });

    console.log('[OCR] Texto extraído (primeros 500 chars):', text.substring(0, 500));

    const registros = parseTableText(text);
    console.log(`[OCR] Registros extraídos: ${registros.length}`);

    // Enriquecer con el aula proporcionada
    const registrosConAula = registros.map(r => ({ ...r, aula: aula || '' }));

    return res.json({
      total: registros.length,
      registros: registrosConAula,
      texto_raw: text, // para depuración, puede eliminarse en producción
    });
  } catch (error) {
    console.error('[OCR] Error procesando imagen:', error);
    return res.status(500).json({ message: 'Error al procesar la imagen con OCR.', detail: error.message });
  } finally {
    // Limpiar archivo temporal
    if (tmpPath) {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  }
};

module.exports = { procesarFotoLista };
