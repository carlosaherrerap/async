const Jimp = require('jimp');
const {
    MultiFormatReader,
    RGBLuminanceSource,
    BinaryBitmap,
    HybridBinarizer,
    DecodeHintType,
    BarcodeFormat
} = require('@zxing/library');

// Extract DNI number from decoded barcode text
const extractDniFromText = (decodedText) => {
    if (!decodedText) return null;
    console.log('[BARCODE] Raw text decoded:', JSON.stringify(decodedText.substring(0, 80)));

    // 1. Check Peruvian DNI PDF417 structure:
    // Typically contains 8-digit DNI number
    if (decodedText.length >= 10) {
        const potentialDni = decodedText.substring(2, 10);
        if (/^\d{8}$/.test(potentialDni)) {
            return potentialDni;
        }
    }

    // 2. Fallback: Search for any 8-digit numeric sequence
    const match = decodedText.match(/\b\d{8}\b/);
    if (match) return match[0];

    const matchConsecutive = decodedText.match(/\d{8}/);
    if (matchConsecutive) return matchConsecutive[0];

    return null;
};

// Try to decode barcode from Jimp image object
const decodeBarcodeImage = (jimpImage) => {
    try {
        const width = jimpImage.bitmap.width;
        const height = jimpImage.bitmap.height;

        // Convert RGBA to luminance Uint8ClampedArray
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
        // NotFoundException is normal when no barcode found — suppress it
    }
    return null;
};

// Preprocess a Jimp image to improve barcode readability:
// Grayscale + increase contrast + upscale
const preprocessForBarcode = async (jimpImage) => {
    return jimpImage.clone()
        .grayscale()
        .contrast(0.5)      // boost contrast
        .resize(jimpImage.bitmap.width * 2, Jimp.AUTO); // upscale 2x
};

// Try to decode barcode with multiple strategies:
// - Full image
// - Cropped zones where DNI barcode is likely (top-right corner)
// - Multiple rotations
// - Preprocessed versions
const decodeBarcodeWithRotations = async (jimpImage) => {
    const w = jimpImage.bitmap.width;
    const h = jimpImage.bitmap.height;

    // Strategy 1: Try full image first
    console.log(`[BARCODE] Trying full image (${w}x${h})...`);
    let result = decodeBarcodeImage(jimpImage);
    if (result && result.dni) { console.log('[BARCODE] Found in full image'); return result; }

    // Strategy 2: Crop zones — the barcode on a Peruvian DNI is in the TOP-RIGHT corner
    // We try several crop percentages to adapt to different photo angles
    const cropZones = [
        // [x_start_pct, y_start_pct, width_pct, height_pct]
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

            // Try original crop
            result = decodeBarcodeImage(cropped);
            if (result && result.dni) { console.log(`[BARCODE] Found in crop: ${zone.label}`); return result; }

            // Try crop rotated 90°
            const cropped90 = cropped.clone().rotate(90);
            result = decodeBarcodeImage(cropped90);
            if (result && result.dni) { console.log(`[BARCODE] Found in crop rotated 90: ${zone.label}`); return result; }

            // Try crop rotated 270°
            const cropped270 = cropped.clone().rotate(270);
            result = decodeBarcodeImage(cropped270);
            if (result && result.dni) { console.log(`[BARCODE] Found in crop rotated 270: ${zone.label}`); return result; }

            // Try preprocessed crop (grayscale + contrast boost + upscale)
            const preprocessed = await preprocessForBarcode(cropped);
            result = decodeBarcodeImage(preprocessed);
            if (result && result.dni) { console.log(`[BARCODE] Found in preprocessed crop: ${zone.label}`); return result; }

            // Try preprocessed crop rotated 90°
            const preprocessed90 = preprocessed.clone().rotate(90);
            result = decodeBarcodeImage(preprocessed90);
            if (result && result.dni) { console.log(`[BARCODE] Found in preprocessed crop rotated 90: ${zone.label}`); return result; }

        } catch (cropErr) {
            console.warn(`[BARCODE] Crop zone error (${zone.label}):`, cropErr.message);
        }
    }

    // Strategy 3: Full image with rotations + preprocessing
    const rotations = [90, 180, 270];
    for (const deg of rotations) {
        const rotated = jimpImage.clone().rotate(deg);
        console.log(`[BARCODE] Trying full image rotated ${deg}°...`);
        result = decodeBarcodeImage(rotated);
        if (result && result.dni) { console.log(`[BARCODE] Found at rotation ${deg}`); return result; }
    }

    // Strategy 4: Preprocessed full image with rotations
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
