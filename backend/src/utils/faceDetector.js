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
        console.warn('WASM backend failed to load, falling back to CPU backend:', e.message);
        await tf.setBackend('cpu');
        await tf.ready();
    }
    backendInitialized = true;
};


const MODELS_DIR = path.join(__dirname, '..', 'models');
const MANIFEST_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js-models/master/tiny_face_detector/tiny_face_detector_model-weights_manifest.json';
const SHARD_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js-models/master/tiny_face_detector/tiny_face_detector_model-shard1';

let modelsLoaded = false;

// Helper to download a file
const downloadFile = (url, dest) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
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

// Initialize and load face-api models
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
            console.log('Downloading face-api manifest...');
            await downloadFile(MANIFEST_URL, manifestPath);
        }

        if (!fs.existsSync(shardPath)) {
            console.log('Downloading face-api weights shard...');
            await downloadFile(SHARD_URL, shardPath);
        }

        // Load Tiny Face Detector weights
        console.log('Loading face-api.js tinyFaceDetector model...');
        await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_DIR);
        modelsLoaded = true;
        console.log('Face-api.js tinyFaceDetector model loaded successfully.');
        return true;
    } catch (error) {
        console.error('Failed to load face detector models:', error.message);
        return false;
    }
};

// Detect if image contains a face
const hasFace = async (jimpImage) => {
    try {
        // Ensure models are initialized
        await initFaceDetector();

        if (!modelsLoaded) {
            console.warn('Face detection models not loaded. Skipping face check.');
            return false;
        }

        // Resize image to speed up tensor conversion and processing
        // TinyFaceDetector works well on smaller resolutions (e.g., width 320)
        const resized = jimpImage.clone().resize(320, Jimp.AUTO);
        const width = resized.bitmap.width;
        const height = resized.bitmap.height;
        const pixels = resized.bitmap.data;

        // Convert RGBA buffer to RGB Float32Array tensor
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

        tensor.dispose(); // CRITICAL: prevent memory leaks

        return detections && detections.length > 0;
    } catch (e) {
        console.error('Error during face detection:', e.message);
        return false;
    }
};

module.exports = {
    initFaceDetector,
    hasFace
};
