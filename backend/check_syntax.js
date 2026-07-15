const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function checkDir(dir) {
    if (!fs.existsSync(dir)) return true;
    const files = fs.readdirSync(dir);
    let ok = true;
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (!checkDir(fullPath)) ok = false;
        } else if (file.endsWith('.js')) {
            try {
                execSync(`node -c "${fullPath}"`);
                console.log(`  OK: ${fullPath}`);
            } catch (err) {
                console.error(`  ERROR: Sintaxis inválida en ${fullPath}`);
                ok = false;
            }
        }
    }
    return ok;
}

console.log("=== Validando sintaxis de archivos JavaScript ===");
let success = true;

// Validar index.js
const indexFile = path.join(__dirname, 'src', 'index.js');
if (fs.existsSync(indexFile)) {
    try {
        execSync(`node -c "${indexFile}"`);
        console.log(`  OK: ${indexFile}`);
    } catch (err) {
        console.error(`  ERROR: Sintaxis inválida en ${indexFile}`);
        success = false;
    }
}

// Validar directorios
const dirsToCheck = [
    path.join(__dirname, 'src', 'controllers'),
    path.join(__dirname, 'src', 'routes'),
    path.join(__dirname, 'src', 'middleware')
];

for (const dir of dirsToCheck) {
    if (!checkDir(dir)) {
        success = false;
    }
}

if (!success) {
    console.error("\n=== ERROR: Se encontraron archivos con sintaxis inválida ===");
    process.exit(1);
} else {
    console.log("\n=== OK: Todos los archivos tienen sintaxis válida ===");
    process.exit(0);
}
