const fs = require('fs');
const path = require('path');
const https = require('https');
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-backend-wasm');
const faceapi = require('@vladmandic/face-api/dist/face-api.node-wasm.js');
const Jimp = require('jimp');

let backendInitialized = false;

const initBackend = async () => {
    if (backendInitialized) return;
    try {
        await tf.setBackend('wasm');
        await tf.ready();
        console.log('TensorFlow.js WASM backend initialized.');
    } catch (e) {
        console.warn('WASM backend fallido, usando CPU backend:', e.message);
        await tf.setBackend('cpu');
        await tf.ready();
    }
    backendInitialized = true;
};


const MODELS_DIR = path.join(__dirname, '..', 'models');
const MANIFEST_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js-models/master/tiny_face_detector/tiny_face_detector_model-weights_manifest.json';
const SHARD_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js-models/master/tiny_face_detector/tiny_face_detector_model-shard1';

let modelsLoaded = false;

// Ayudante para descargar un archivo
const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Fallo al descargar: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
};

// Inicializar y cargar los modelos de face-api
const initFaceDetector = async () => {
    if (modelsLoaded) return true;

    try {
        await initBackend();

        if (!fs.existsSync(MODELS_DIR)) {
            fs.mkdirSync(MODELS_DIR, { recursive: true });
        }

        const manifestPath = path.join(MODELS_DIR, 'tiny_face_detector_model-weights_manifest.json');
        const shardPath = path.join(MODELS_DIR, 'tiny_face_detector_model-shard1');

        if (!fs.existsSync(manifestPath)) {
            console.log('Descargando face-api manifest...');
            await downloadFile(MANIFEST_URL, manifestPath);
        }

        if (!fs.existsSync(shardPath)) {
            console.log('Descargando face-api weights shard...');
            await downloadFile(SHARD_URL, shardPath);
        }

        // Cargar los pesos de Tiny Face Detector
        console.log('Cargando face-api.js tinyFaceDetector model...');
        await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_DIR);
        modelsLoaded = true;
        console.log('Face-api.js tinyFaceDetector model cargado exitosamente.');
        return true;
    } catch (error) {
        console.error('Fallo al cargar modelos de detección facial:', error.message);
        return false;
    }
};

// Detectar si la imagen contiene un rostro
const hasFace = async (jimpImage) => {
    try {
        // Asegurar que los modelos estén inicializados
        await initFaceDetector();

        if (!modelsLoaded) {
            console.warn('Modelos de detección facial no cargados. Saltando verificación de rostros.');
            return false;
        }

        // Redimensionar la imagen para acelerar la conversión y procesamiento de tensores
        // TinyFaceDetector funciona bien en resoluciones más pequeñas (por ejemplo, ancho 320)
        const resized = jimpImage.clone().resize(320, Jimp.AUTO);
        const width = resized.bitmap.width;
        const height = resized.bitmap.height;
        const pixels = resized.bitmap.data;

        // Convertir el búfer RGBA a un tensor Float32Array RGB
        const numPixels = width * height;
        const values = new Float32Array(numPixels * 3);
        for (let i = 0; i < numPixels; i++) {
            values[i * 3] = pixels[i * 4];       // R
            values[i * 3 + 1] = pixels[i * 4 + 1]; // G
            values[i * 3 + 2] = pixels[i * 4 + 2]; // B
        }

        const tensor = tf.tensor3d(values, [height, width, 3], 'float32');
        const detections = await faceapi.detectAllFaces(
            tensor,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 })
        );

        tensor.dispose(); // CRÍTICO: prevenir fugas de memoria

        return detections && detections.length > 0;
    } catch (e) {
        console.error('Error durante la detección facial:', e.message);
        return false;
    }
};

module.exports = {
    initFaceDetector,
    hasFace
};
