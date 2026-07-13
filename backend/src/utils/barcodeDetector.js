const Jimp = require('jimp');
const {
    MultiFormatReader,
    RGBLuminanceSource,
    BinaryBitmap,
    HybridBinarizer,
    DecodeHintType,
    BarcodeFormat
} = require('@zxing/library');

// Extraer el número de DNI del texto decodificado del código de barras
const extractDniFromText = (decodedText) => {
    if (!decodedText) return null;
    console.log('[BARCODE] Raw text decoded:', JSON.stringify(decodedText.substring(0, 80)));

    // 1. Verificar la estructura PDF417 del DNI peruano:
    // Típicamente contiene el número de DNI de 8 dígitos
    if (decodedText.length >= 10) {
        const potentialDni = decodedText.substring(2, 10);
        if (/^\d{8}$/.test(potentialDni)) {
            return potentialDni;
        }
    }

    // 2. Alternativa: Buscar cualquier secuencia numérica de 8 dígitos
    const match = decodedText.match(/\b\d{8}\b/);
    if (match) return match[0];

    const matchConsecutive = decodedText.match(/\d{8}/);
    if (matchConsecutive) return matchConsecutive[0];

    return null;
};

// Intentar decodificar el código de barras del objeto de imagen Jimp
const decodeBarcodeImage = (jimpImage) => {
    try {
        const width = jimpImage.bitmap.width;
        const height = jimpImage.bitmap.height;

        // Convertir RGBA a un Uint8ClampedArray de luminancia
        const pixels = new Uint8ClampedArray(jimpImage.bitmap.data);

        const luminanceSource = new RGBLuminanceSource(pixels, width, height);
        const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));

        const reader = new MultiFormatReader();
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.PDF_417,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.CODE_93,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const result = reader.decode(binaryBitmap, hints);
        if (result) {
            const text = result.getText();
            return {
                text,
                format: result.getBarcodeFormat().toString(),
                dni: extractDniFromText(text)
            };
        }
    } catch (e) {
        // NotFoundException es normal cuando no se encuentra código de barras — suprimirlo
    }
    return null;
};

// Preprocesar una imagen Jimp para mejorar la legibilidad del código de barras:
// Escala de grises + aumentar contraste + aumentar tamaño (escalar)
const preprocessForBarcode = async (jimpImage) => {
    return jimpImage.clone()
        .grayscale()
        .contrast(0.5)      // aumentar contraste
        .resize(jimpImage.bitmap.width * 2, Jimp.AUTO); // escalar a 2x
};

// Intentar decodificar el código de barras con múltiples estrategias:
// - Imagen completa
// - Zonas recortadas donde es probable que esté el código de barras del DNI (esquina superior derecha)
// - Múltiples rotaciones
// - Versiones preprocesadas
const decodeBarcodeWithRotations = async (jimpImage) => {
    const w = jimpImage.bitmap.width;
    const h = jimpImage.bitmap.height;

    // Estrategia 1: Intentar primero con la imagen completa
    console.log(`[BARCODE] Trying full image (${w}x${h})...`);
    let result = decodeBarcodeImage(jimpImage);
    if (result && result.dni) { console.log('[BARCODE] Found in full image'); return result; }

    // Estrategia 2: Recortar zonas — el código de barras en un DNI peruano está en la esquina SUPERIOR DERECHA
    // Probamos varios porcentajes de recorte para adaptarnos a diferentes ángulos de la foto
    const cropZones = [
        // [x_inicio_porcentaje, y_inicio_porcentaje, ancho_porcentaje, alto_porcentaje]
        { x: 0.6,  y: 0.0, w: 0.4,  h: 0.5,  label: 'top-right 40%' },
        { x: 0.55, y: 0.0, w: 0.45, h: 0.6,  label: 'top-right 45%' },
        { x: 0.5,  y: 0.0, w: 0.5,  h: 0.7,  label: 'right half' },
        { x: 0.65, y: 0.0, w: 0.35, h: 0.45, label: 'far top-right' },
        { x: 0.0,  y: 0.0, w: 1.0,  h: 0.5,  label: 'top half' },
    ];

    for (const zone of cropZones) {
        try {
            const cx = Math.floor(zone.x * w);
            const cy = Math.floor(zone.y * h);
            const cw = Math.floor(zone.w * w);
            const ch = Math.floor(zone.h * h);

            if (cw < 10 || ch < 10) continue;

            const cropped = jimpImage.clone().crop(cx, cy, cw, ch);
            console.log(`[BARCODE] Trying crop zone: ${zone.label} (${cx},${cy},${cw},${ch})`);

            // Intentar con el recorte original
            result = decodeBarcodeImage(cropped);
            if (result && result.dni) { console.log(`[BARCODE] Found in crop: ${zone.label}`); return result; }

            // Intentar con el recorte rotado 90°
            const cropped90 = cropped.clone().rotate(90);
            result = decodeBarcodeImage(cropped90);
            if (result && result.dni) { console.log(`[BARCODE] Found in crop rotated 90: ${zone.label}`); return result; }

            // Intentar con el recorte rotado 270°
            const cropped270 = cropped.clone().rotate(270);
            result = decodeBarcodeImage(cropped270);
            if (result && result.dni) { console.log(`[BARCODE] Found in crop rotated 270: ${zone.label}`); return result; }

            // Intentar con el recorte preprocesado (escala de grises + aumento de contraste + escalar)
            const preprocessed = await preprocessForBarcode(cropped);
            result = decodeBarcodeImage(preprocessed);
            if (result && result.dni) { console.log(`[BARCODE] Found in preprocessed crop: ${zone.label}`); return result; }

            // Intentar con el recorte preprocesado rotado 90°
            const preprocessed90 = preprocessed.clone().rotate(90);
            result = decodeBarcodeImage(preprocessed90);
            if (result && result.dni) { console.log(`[BARCODE] Found in preprocessed crop rotated 90: ${zone.label}`); return result; }

        } catch (cropErr) {
            console.warn(`[BARCODE] Crop zone error (${zone.label}):`, cropErr.message);
        }
    }

    // Estrategia 3: Imagen completa con rotaciones + preprocesamiento
    const rotations = [90, 180, 270];
    for (const deg of rotations) {
        const rotated = jimpImage.clone().rotate(deg);
        console.log(`[BARCODE] Trying full image rotated ${deg}°...`);
        result = decodeBarcodeImage(rotated);
        if (result && result.dni) { console.log(`[BARCODE] Found at rotation ${deg}`); return result; }
    }

    // Estrategia 4: Imagen completa preprocesada con rotaciones
    const preprocessedFull = await preprocessForBarcode(jimpImage);
    console.log('[BARCODE] Trying preprocessed full image...');
    result = decodeBarcodeImage(preprocessedFull);
    if (result && result.dni) { console.log('[BARCODE] Found in preprocessed full image'); return result; }

    for (const deg of rotations) {
        const rotated = preprocessedFull.clone().rotate(deg);
        result = decodeBarcodeImage(rotated);
        if (result && result.dni) { console.log(`[BARCODE] Found in preprocessed full image rotated ${deg}`); return result; }
    }

    console.log('[BARCODE] No barcode found after all strategies.');
    return null;
};

module.exports = {
    decodeBarcodeWithRotations,
    extractDniFromText
};
