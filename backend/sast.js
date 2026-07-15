const fs = require('fs');
const path = require('path');

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    let found = false;

    // Regexp para buscar secretos como: secret: 'algo' o JWT_SECRET = 'algo' que no usen process.env
    const secretRegex = /secret\s*[:=]\s*['"][A-Za-z0-9+/]{12,}['"]/i;
    // Regexp para buscar url de conexion postgresql hardcodeada
    const postgresRegex = /postgres:\/\/[a-zA-Z0-9_:@./]+/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('process.env') || line.includes('bcrypt')) continue;

        if (secretRegex.test(line)) {
            console.warn(`  [ALERTA] Posible secreto hardcodeado en ${filePath}:${i + 1}`);
            console.warn(`    Línea: ${line.trim()}`);
            found = true;
        }

        if (postgresRegex.test(line)) {
            console.warn(`  [ALERTA] Cadena de conexión postgresql hardcodeada en ${filePath}:${i + 1}`);
            console.warn(`    Línea: ${line.trim()}`);
            found = true;
        }
    }
    return found;
}

function scanDir(dir) {
    if (!fs.existsSync(dir)) return false;
    const files = fs.readdirSync(dir);
    let found = false;
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (scanDir(fullPath)) found = true;
        } else if (file.endsWith('.js')) {
            if (scanFile(fullPath)) found = true;
        }
    }
    return found;
}

console.log("=== Análisis Estático de Seguridad (SAST) ===");
const srcDir = path.join(__dirname, 'src');
const hasIssues = scanDir(srcDir);

if (hasIssues) {
    console.error("\n=== ADVERTENCIA: Se detectaron posibles fallos de seguridad o credenciales expuestas ===");
    process.exit(1);
} else {
    console.log("\n=== OK: SAST completado sin hallazgos ===");
    process.exit(0);
}
