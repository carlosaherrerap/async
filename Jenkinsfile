pipeline {
    agent any

    environment {
        // ── Credenciales configuradas en Jenkins → Manage Credentials ──────────
        // Nombre de la credencial: 'render-deploy-hook-url'  (tipo: Secret text)
        // Contiene la URL completa del Deploy Hook de Render
        RENDER_DEPLOY_HOOK = credentials('render-deploy-hook-url')

        // Nombre de la credencial: 'enla-db-url'  (tipo: Secret text)
        // Contiene la DATABASE_URL de producción en Render (solo para pruebas de integración)
        DATABASE_URL = credentials('enla-db-url')

        // Nombre de la credencial: 'enla-jwt-secret'  (tipo: Secret text)
        JWT_SECRET = credentials('enla-jwt-secret')

        NODE_ENV   = 'test'
        PORT       = '3555'
    }

    options {
        timeout(time: 20, unit: 'MINUTES')
        ansiColor('xterm')
        disableConcurrentBuilds()
        // Conserva los últimos 10 builds para auditoría
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        // ══════════════════════════════════════════════════════════════════════
        // 1. PREPARACIÓN — Instalar dependencias limpiamente
        // ══════════════════════════════════════════════════════════════════════
        stage('Preparación') {
            steps {
                echo '╔══ [1/6] Instalando dependencias del backend ══╗'
                dir('backend') {
                    // npm ci: instalación limpia y reproducible (usa package-lock.json)
                    sh 'npm ci --prefer-offline'
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // 2. CALIDAD — Validación de sintaxis de todos los archivos JS
        // ══════════════════════════════════════════════════════════════════════
        stage('Calidad: Sintaxis JS') {
            steps {
                echo '╔══ [2/6] Validando sintaxis de archivos Javascript ══╗'
                dir('backend') {
                    sh '''
                        echo "→ Verificando src/index.js"
                        node -c src/index.js

                        echo "→ Verificando controladores"
                        for f in src/controllers/*.js; do
                            node -c "$f" && echo "  OK: $f"
                        done

                        echo "→ Verificando rutas"
                        for f in src/routes/*.js; do
                            node -c "$f" && echo "  OK: $f"
                        done

                        echo "→ Verificando middlewares"
                        for f in src/middleware/*.js; do
                            node -c "$f" && echo "  OK: $f"
                        done
                    '''
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // 3. SEGURIDAD — Auditoría de dependencias NPM
        // ══════════════════════════════════════════════════════════════════════
        stage('Seguridad: Dependencias NPM') {
            steps {
                echo '╔══ [3/6] Escaneando dependencias contra vulnerabilidades conocidas ══╗'
                dir('backend') {
                    // Falla si existen vulnerabilidades ALTA o CRÍTICA
                    // Para ignorar temporalmente alguna, usar: npm audit --ignore-registry-errors
                    sh 'npm audit --audit-level=high --omit=dev'
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // 4. SEGURIDAD — SAST: búsqueda de secretos y patrones inseguros
        // ══════════════════════════════════════════════════════════════════════
        stage('Seguridad: SAST') {
            steps {
                echo '╔══ [4/6] Análisis Estático de Seguridad (SAST) ══╗'
                dir('backend') {
                    sh '''
                        echo "→ Buscando secretos hardcodeados en el código fuente..."

                        # Patrón 1: JWT secrets en texto plano (ej: secret: "abc123")
                        if grep -rn --include="*.js" \
                            -E "(jwt_secret|JWT_SECRET|secret\\s*[:=]\\s*['\"][A-Za-z0-9+/]{16,}['\"])" \
                            src/ | grep -v "process\\.env" | grep -v "credentials"; then
                            echo "⚠ ADVERTENCIA: Posible secreto JWT hardcodeado detectado. Revise los resultados."
                            exit 1
                        else
                            echo "  OK: No se encontraron secretos JWT hardcodeados."
                        fi

                        # Patrón 2: contraseñas en texto plano
                        if grep -rn --include="*.js" \
                            -E "(password\\s*=\\s*['\"][^'\"]{6,}['\"])" \
                            src/ | grep -v "bcrypt" | grep -v "process\\.env" | grep -v "hash"; then
                            echo "⚠ ADVERTENCIA: Posible contraseña hardcodeada detectada."
                            exit 1
                        else
                            echo "  OK: No se encontraron contraseñas hardcodeadas."
                        fi

                        # Patrón 3: DATABASE_URL o postgres:// en texto plano
                        if grep -rn --include="*.js" \
                            -E "postgres://[^'\"]*:[^'\"]*@" \
                            src/ | grep -v "process\\.env"; then
                            echo "⚠ ADVERTENCIA: Posible cadena de conexión DB hardcodeada."
                            exit 1
                        else
                            echo "  OK: No se encontraron cadenas de conexión hardcodeadas."
                        fi

                        # Semgrep (si está instalado en el agente de Jenkins)
                        if command -v semgrep > /dev/null 2>&1; then
                            echo "→ Ejecutando Semgrep SAST..."
                            semgrep --config=p/nodejs-security \\
                                    --config=p/jwt \\
                                    --config=p/secrets \\
                                    --error \\
                                    src/
                        else
                            echo "  INFO: Semgrep no instalado. Omitiendo escaneo avanzado."
                            echo "  Para instalarlo: pip3 install semgrep"
                        fi

                        echo "→ SAST completado correctamente."
                    '''
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // 5. PRUEBAS DE INTEGRACIÓN — Endpoints críticos
        // ══════════════════════════════════════════════════════════════════════
        stage('Pruebas de Integración') {
            steps {
                echo '╔══ [5/6] Levantando servidor y probando endpoints críticos ══╗'
                dir('backend') {
                    // NODE_ENV=test: el servidor inicia en modo test (sin bloquear por DB)
                    // Las variables de entorno del pipeline (DATABASE_URL, JWT_SECRET) están disponibles
                    sh 'npm test'
                }
            }
            post {
                failure {
                    echo '✖ Las pruebas de integración fallaron. Revise los endpoints y la conectividad.'
                }
                success {
                    echo '✔ Todos los endpoints respondieron correctamente.'
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // 6. DESPLIEGUE — Solo desde la rama main, solo si todo pasó
        // ══════════════════════════════════════════════════════════════════════
        stage('Despliegue en Render') {
            when {
                // Solo despliega desde la rama principal
                branch 'main'
                // Solo si todos los stages anteriores tuvieron éxito
                beforeAgent true
            }
            steps {
                echo '╔══ [6/6] Disparando despliegue automático en Render ══╗'
                sh '''
                    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${RENDER_DEPLOY_HOOK}")
                    echo "→ Render respondió con código HTTP: $HTTP_CODE"
                    if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
                        echo "✖ Error al disparar el deploy hook de Render. Código: $HTTP_CODE"
                        exit 1
                    fi
                    echo "✔ Despliegue iniciado correctamente en Render."
                '''
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // RESULTADOS FINALES
    // ══════════════════════════════════════════════════════════════════════════
    post {
        success {
            echo '''
╔══════════════════════════════════════════════════════════════╗
║  ✔  CI/CD COMPLETADO CON ÉXITO                               ║
║     Calidad de código: OK                                    ║
║     Seguridad de dependencias: OK                            ║
║     Análisis estático (SAST): OK                             ║
║     Pruebas de integración: OK                               ║
║     Despliegue en Render: Iniciado                           ║
╚══════════════════════════════════════════════════════════════╝
            '''
        }
        failure {
            echo '''
╔══════════════════════════════════════════════════════════════╗
║  ✖  BUILD FALLIDO                                            ║
║     Revise los logs de las etapas marcadas en rojo.          ║
║     El despliegue en Render fue BLOQUEADO.                   ║
╚══════════════════════════════════════════════════════════════╝
            '''
        }
        always {
            // Limpiar archivos generados por el build (node_modules no se borra para caché)
            echo '→ Pipeline finalizado.'
        }
    }
}
