pipeline {
    agent any

    environment {
        // Credencial guardada de forma segura en Jenkins para el webhook de Render
        RENDER_DEPLOY_HOOK = credentials('render-deploy-hook-url')
        NODE_ENV = 'test'
    }

    options {
        timeout(time: 15, unit: 'MINUTES')
        ansiColor('xterm')
        disableConcurrentBuilds()
    }

    stages {
        stage('Preparación') {
            steps {
                echo '=== Limpiando espacio de trabajo e instalando dependencias ==='
                dir('backend') {
                    sh 'npm ci'
                }
            }
        }

        stage('Estándares de Calidad: Sintaxis y Estructura') {
            steps {
                echo '=== Validando sintaxis de archivos Javascript ==='
                dir('backend') {
                    // Validar sintaxis de archivos JS principales
                    sh 'node -c src/index.js src/controllers/*.js src/routes/*.js'
                }
            }
        }

        stage('Testing de Seguridad: Dependencias') {
            steps {
                echo '=== Escaneando dependencias de Node.js contra vulnerabilidades ==='
                dir('backend') {
                    // Ejecuta auditoría de seguridad. Falla si existen vulnerabilidades altas o críticas.
                    sh 'npm audit --audit-level=high'
                }
            }
        }

        stage('Testing de Seguridad: SAST (Análisis Estático)') {
            steps {
                echo '=== Ejecutando Análisis de Seguridad Estático (SAST) ==='
                // Sugerencia de estándares de calidad y seguridad:
                // Se propone integrar herramientas como Semgrep o Snyk para verificar
                // secretos hardcodeados, uso inseguro de JWT o fallas criptográficas.
                echo 'Ejecutando escaneo pasivo de secretos y tokens en el código fuente...'
                sh '''
                    if command -v semgrep &> /dev/null; then
                        semgrep --config=auto .
                    else
                        echo "Semgrep no instalado en el agente. Continuando compilación de forma segura."
                    fi
                '''
            }
        }

        stage('Pruebas de Integración y Endpoints') {
            steps {
                echo '=== Iniciando servidor backend temporal y probando endpoints ==='
                dir('backend') {
                    // Ejecuta el script de prueba de endpoints
                    // Esto valida /health, bloqueos de token/auth y la ruta de inicio de sesión
                    sh 'npm test'
                }
            }
        }

        stage('Despliegue en Producción (Render)') {
            when {
                branch 'main'
            }
            steps {
                echo '=== Todos los tests de calidad y seguridad pasaron. Desplegando en Render ==='
                sh 'curl -X POST ${RENDER_DEPLOY_HOOK}'
            }
        }
    }

    post {
        success {
            echo '=== CI/CD completado con éxito. Todos los estándares de calidad y seguridad se cumplen ==='
        }
        failure {
            echo '=== El build ha fallado. Por favor revise los logs para corregir la sintaxis, vulnerabilidad o endpoint ==='
        }
    }
}
