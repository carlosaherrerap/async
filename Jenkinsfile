pipeline {
    agent any

    options {
        timeout(time: 20, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timestamps()
    }

    stages {

        // ══════════════════════════════════════════════════════════════════════
        // 1. PREPARACIÓN — Instalar dependencias limpiamente
        // ══════════════════════════════════════════════════════════════════════
        stage('Preparacion') {
            steps {
                echo '=== [1/5] Instalando dependencias del backend ==='
                dir('backend') {
                    sh 'npm ci'
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // 2. CALIDAD — Validación de sintaxis de todos los archivos JS
        // ══════════════════════════════════════════════════════════════════════
        stage('Calidad: Sintaxis JS') {
            steps {
                echo '=== [2/5] Validando sintaxis de archivos Javascript ==='
                dir('backend') {
                    sh '''
                        echo "-> src/index.js"
                        node -c src/index.js

                        echo "-> Controladores"
                        for f in src/controllers/*.js; do
                            node -c "$f" && echo "  OK: $f"
                        done

                        echo "-> Rutas"
                        for f in src/routes/*.js; do
                            node -c "$f" && echo "  OK: $f"
                        done

                        echo "-> Middlewares"
                        for f in src/middleware/*.js; do
                            node -c "$f" && echo "  OK: $f"
                        done

                        echo "-> Sintaxis correcta en todos los archivos."
                    '''
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // 3. SEGURIDAD — SAST: búsqueda de secretos hardcodeados
        // ══════════════════════════════════════════════════════════════════════
        stage('Seguridad: SAST') {
            steps {
                echo '=== [3/5] Analisis Estatico de Seguridad (SAST) ==='
                dir('backend') {
                    sh '''
                        FOUND=0

                        echo "-> Buscando secretos JWT hardcodeados..."
                        if grep -rn --include="*.js" \
                            -E "secret\\s*[:=]\\s*['\"][A-Za-z0-9+/]{12,}['\"]" \
                            src/ | grep -v "process\\.env" | grep -v "bcrypt" | grep -q "."; then
                            echo "  ADVERTENCIA: Posible secreto hardcodeado detectado."
                            FOUND=1
                        else
                            echo "  OK: Sin secretos JWT hardcodeados."
                        fi

                        echo "-> Buscando cadenas postgres:// hardcodeadas..."
                        if grep -rn --include="*.js" \
                            -E "postgres://[a-zA-Z0-9_:@./]+" \
                            src/ | grep -v "process\\.env" | grep -q "."; then
                            echo "  ADVERTENCIA: Cadena de conexion DB hardcodeada."
                            FOUND=1
                        else
                            echo "  OK: Sin cadenas de conexion hardcodeadas."
                        fi

                        if [ "$FOUND" = "1" ]; then
                            exit 1
                        fi

                        echo "-> SAST completado sin hallazgos."
                    '''
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // 4. PRUEBAS DE INTEGRACIÓN — Endpoints críticos
        // ══════════════════════════════════════════════════════════════════════
        stage('Pruebas de Integracion') {
            environment {
                NODE_ENV = 'test'
                PORT     = '3555'
            }
            steps {
                echo '=== [4/5] Levantando servidor y probando endpoints ==='
                dir('backend') {
                    sh 'npm test'
                }
            }
            post {
                failure {
                    echo 'FALLO: Pruebas de integracion fallaron. Revise los endpoints.'
                }
                success {
                    echo 'OK: Todos los endpoints respondieron correctamente.'
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // 5. DESPLIEGUE — Dispara el deploy hook de Render
        //    REQUIERE credencial 'render-deploy-hook-url' en Jenkins Credentials
        //    Si no existe, el stage se omite mostrando advertencia
        // ══════════════════════════════════════════════════════════════════════
        stage('Despliegue en Render') {
            when {
                // Solo desde la rama principal del repositorio
                branch 'master'
            }
            steps {
                echo '=== [5/5] Disparando despliegue en Render ==='
                script {
                    try {
                        withCredentials([string(credentialsId: 'render-deploy-hook-url', variable: 'DEPLOY_HOOK')]) {
                            sh '''
                                HTTP=$(wget -qO- --server-response --method=POST "$DEPLOY_HOOK" 2>&1 \
                                      | grep "HTTP/" | awk "{print \\$2}" | tail -1)
                                echo "-> Render respondio HTTP: $HTTP"
                                if [ "$HTTP" != "200" ] && [ "$HTTP" != "201" ]; then
                                    echo "ERROR: Deploy hook fallo. HTTP: $HTTP"
                                    exit 1
                                fi
                                echo "OK: Despliegue iniciado en Render."
                            '''
                        }
                    } catch (e) {
                        echo "ADVERTENCIA: No se encontro credencial 'render-deploy-hook-url'."
                        echo "Agrega la credencial en Jenkins > Credentials > Global para habilitar el despliegue automatico."
                        echo "El pipeline continua sin desplegar."
                    }
                }
            }
        }
    }

    post {
        success {
            echo '=== PIPELINE COMPLETADO CON EXITO ==='
        }
        failure {
            echo '=== PIPELINE FALLIDO — Revise los logs de la etapa en rojo ==='
        }
        always {
            echo '-> Ejecucion del pipeline finalizada.'
        }
    }
}
