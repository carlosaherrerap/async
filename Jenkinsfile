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
                    runCmd('npm ci')
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
                    runCmd('node check_syntax.js')
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
                    runCmd('node sast.js')
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
                    runCmd('npm test')
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
        // ══════════════════════════════════════════════════════════════════════
        stage('Despliegue en Render') {
            when {
                branch 'master'
            }
            steps {
                echo '=== [5/5] Disparando despliegue en Render ==='
                script {
                    try {
                        withCredentials([string(credentialsId: 'render-deploy-hook-url', variable: 'DEPLOY_HOOK')]) {
                            runCmd('node -e "fetch(process.env.DEPLOY_HOOK, {method: \'POST\'}).then(r => { console.log(\'Render HTTP:\', r.status); if (r.status !== 200 && r.status !== 201 && r.status !== 202) process.exit(1); })"')
                        }
                    } catch (e) {
                        echo "ADVERTENCIA: No se encontro credencial 'render-deploy-hook-url' o fallo el despliegue."
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
            echo '=== PIPELINE FALLIDO — Revise los logs ==='
        }
        always {
            echo '-> Ejecucion del pipeline finalizada.'
        }
    }
}

def runCmd(cmd) {
    if (isUnix()) {
        sh cmd
    } else {
        bat cmd
    }
}
