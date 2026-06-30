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

    // 1. Check Peruvian DNI PDF417 structure:
    // Typically the first 2 bytes are headers (e.g. "01" or special characters),
    // and the next 8 bytes (indices 2 to 9) contain the DNI digits.
    if (decodedText.length >= 10) {
        const potentialDni = decodedText.substring(2, 10);
        if (/^\d{8}$/.test(potentialDni)) {
            return potentialDni;
        }
    }

    // 2. Fallback: Search for any 8-digit numeric sequence
    const match = decodedText.match(/\b\d{8}\b/);
    if (match) {
        return match[0];
    }

    const matchConsecutive = decodedText.match(/\d{8}/);
    if (matchConsecutive) {
        return matchConsecutive[0];
    }

    return null;
};

// Try to decode barcode from Jimp image
const decodeBarcodeImage = (jimpImage) => {
    try {
        const width = jimpImage.bitmap.width;
        const height = jimpImage.bitmap.height;
        
        // Convert RGBA buffer to Uint8ClampedArray
        const pixels = new Uint8ClampedArray(jimpImage.bitmap.data);
        
        const luminanceSource = new RGBLuminanceSource(pixels, width, height);
        const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
        
        const reader = new MultiFormatReader();
        const hints = new Map();
        
        // We look for PDF417 (back of DNI) and Code 128 / Code 39 (1D barcodes)
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.PDF_417,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39
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
        // Suppress reader errors (like NotFoundException)
    }
    return null;
};

// Try to decode barcode with rotations
const decodeBarcodeWithRotations = async (jimpImage) => {
    // 1. Try original
    let result = decodeBarcodeImage(jimpImage);
    if (result && result.dni) return result;

    // 2. Try rotating 90 degrees
    const rotated90 = jimpImage.clone().rotate(90);
    result = decodeBarcodeImage(rotated90);
    if (result && result.dni) return result;

    // 3. Try rotating 180 degrees
    const rotated180 = jimpImage.clone().rotate(180);
    result = decodeBarcodeImage(rotated180);
    if (result && result.dni) return result;

    // 4. Try rotating 270 degrees
    const rotated270 = jimpImage.clone().rotate(270);
    result = decodeBarcodeImage(rotated270);
    if (result && result.dni) return result;

    // 5. Try scaling down / up slightly as backup (sometimes improves binarization)
    const scaled = jimpImage.clone().resize(800, Jimp.AUTO);
    result = decodeBarcodeImage(scaled);
    if (result && result.dni) return result;

    return null;
};

module.exports = {
    decodeBarcodeWithRotations,
    extractDniFromText
};
