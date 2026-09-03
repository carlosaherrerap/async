// Lógica del Panel Administrativo de Descarga de Asistencias (ENLA 2026)
// Reglas estrictas: Sin emojis, sin gradientes, sin sombras, fondos claros, alto contraste.

(function () {
    'use strict';

    // Elementos del DOM
    const loginSection = document.getElementById('login-section');
    const dashboardSection = document.getElementById('dashboard-section');
    const userSessionInfo = document.getElementById('user-session-info');
    const sessionUserText = document.getElementById('session-user-text');
    const btnLogout = document.getElementById('btn-logout');

    const loginForm = document.getElementById('login-form');
    const inputUsername = document.getElementById('input-username');
    const inputPassword = document.getElementById('input-password');
    const btnLoginSubmit = document.getElementById('btn-login-submit');

    const inputStartDate = document.getElementById('input-start-date');
    const inputEndDate = document.getElementById('input-end-date');
    const btnQuickToday = document.getElementById('btn-quick-today');
    const btnQuickSeptember = document.getElementById('btn-quick-september');
    const btnQuickAll = document.getElementById('btn-quick-all');

    const metricTotalPostulantes = document.getElementById('metric-total-postulantes');
    const metricTotalAsistencias = document.getElementById('metric-total-asistencias');
    const metricPostulantesUnicos = document.getElementById('metric-postulantes-unicos');

    const btnDownloadExcel = document.getElementById('btn-download-excel');
    const btnRefreshSummary = document.getElementById('btn-refresh-summary');
    const downloadStatus = document.getElementById('download-status');
    const downloadStatusText = document.getElementById('download-status-text');

    const globalAlert = document.getElementById('global-alert');
    const globalAlertText = document.getElementById('global-alert-text');

    // Claves de almacenamiento de sesión
    const TOKEN_KEY = 'enla_admin_jwt_token';
    const USER_KEY = 'enla_admin_user_data';

    // Utilidades de Fechas (Contexto: Setiembre 2026)
    function formatDate(date) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function setDefaultDates() {
        const today = new Date();
        const todayStr = formatDate(today);
        inputStartDate.value = '2026-09-01';
        inputEndDate.value = todayStr > '2026-09-01' ? todayStr : '2026-09-30';
    }

    // Alertas
    function showAlert(message, type) {
        globalAlertText.textContent = message;
        globalAlert.className = 'alert-box';
        if (type === 'error') {
            globalAlert.classList.add('alert-error');
        } else if (type === 'success') {
            globalAlert.classList.add('alert-success');
        } else {
            globalAlert.classList.add('alert-info');
        }
        globalAlert.classList.remove('hidden');
    }

    function hideAlert() {
        globalAlert.classList.add('hidden');
        globalAlertText.textContent = '';
    }

    // Verificación de rol administrativo
    function isAdminRole(role) {
        if (!role) return false;
        const r = String(role).trim().toLowerCase();
        return ['admin', 'administrador', 'su', 'super', 'superusuario'].includes(r);
    }

    // Verificación inicial de sesión al cargar la página
    async function checkCurrentSession() {
        const token = sessionStorage.getItem(TOKEN_KEY);
        if (!token) {
            showLoginView();
            return;
        }

        try {
            const res = await fetch('/api/autenticacion/verificar-admin', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                if (data.valid && isAdminRole(data.user?.rol)) {
                    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
                    showDashboardView(data.user);
                    return;
                }
            }
        } catch (e) {
            console.warn('Sesión no válida o expirada:', e);
        }

        // Si falló la verificación, limpiar y mostrar login
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        showLoginView();
    }

    // Cambio entre vistas
    function showLoginView() {
        dashboardSection.classList.add('hidden');
        userSessionInfo.classList.add('hidden');
        loginSection.classList.remove('hidden');
        inputUsername.value = '';
        inputPassword.value = '';
    }

    function showDashboardView(user) {
        loginSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
        userSessionInfo.classList.remove('hidden');

        sessionUserText.textContent = `Operador: ${user.username || 'admin'} (${user.rol || 'ADMIN'})`;
        hideAlert();
        setDefaultDates();
        fetchSummaryMetrics();
    }

    // Manejo de Login
    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        hideAlert();

        const username = inputUsername.value.trim();
        const password = inputPassword.value;

        if (!username || !password) {
            showAlert('Por favor ingrese usuario y contraseña.', 'error');
            return;
        }

        btnLoginSubmit.disabled = true;
        btnLoginSubmit.textContent = 'Verificando credenciales...';

        try {
            const res = await fetch('/api/autenticacion/iniciar-sesion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (!res.ok) {
                showAlert(data.message || 'Error en el inicio de sesión.', 'error');
                return;
            }

            // Validar que el usuario tenga rol ADMIN o SUPERADMIN
            if (!isAdminRole(data.user?.rol)) {
                showAlert('Acceso denegado: Esta plataforma está reservada exclusivamente para cuentas con rol de Administrador.', 'error');
                return;
            }

            // Almacenar token de sesión
            sessionStorage.setItem(TOKEN_KEY, data.token);
            sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));

            showDashboardView(data.user);
            showAlert(`Bienvenido, ${data.user.nombre || data.user.username}. Sesión de Administrador activa.`, 'success');
        } catch (err) {
            console.error(err);
            showAlert('Error de conexión con el servidor. Verifique que el servicio esté activo.', 'error');
        } finally {
            btnLoginSubmit.disabled = false;
            btnLoginSubmit.textContent = 'Ingresar al Sistema';
        }
    });

    // Manejo de Logout
    btnLogout.addEventListener('click', function () {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        showLoginView();
        showAlert('Sesión cerrada correctamente.', 'info');
    });

    // Carga de Métricas y Resumen
    async function fetchSummaryMetrics() {
        const token = sessionStorage.getItem(TOKEN_KEY);
        if (!token) return;

        const startDate = inputStartDate.value;
        const endDate = inputEndDate.value;

        let queryParams = new URLSearchParams();
        if (startDate) queryParams.append('startDate', startDate);
        if (endDate) queryParams.append('endDate', endDate);

        try {
            const res = await fetch(`/api/asistencia/admin/resumen-asistencia?${queryParams.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                metricTotalPostulantes.textContent = Number(data.total_postulantes || 0).toLocaleString();
                metricTotalAsistencias.textContent = Number(data.total_asistencias || 0).toLocaleString();
                metricPostulantesUnicos.textContent = Number(data.postulantes_distintos || 0).toLocaleString();
            } else if (res.status === 401 || res.status === 403) {
                showAlert('Su sesión ha caducado. Inicie sesión nuevamente.', 'error');
                showLoginView();
            }
        } catch (e) {
            console.error('Error al cargar métricas:', e);
        }
    }

    // Accesos rápidos de fechas
    btnQuickToday.addEventListener('click', function () {
        const todayStr = formatDate(new Date());
        inputStartDate.value = todayStr;
        inputEndDate.value = todayStr;
        fetchSummaryMetrics();
    });

    btnQuickSeptember.addEventListener('click', function () {
        inputStartDate.value = '2026-09-01';
        inputEndDate.value = '2026-09-30';
        fetchSummaryMetrics();
    });

    btnQuickAll.addEventListener('click', function () {
        inputStartDate.value = '';
        inputEndDate.value = '';
        fetchSummaryMetrics();
    });

    // Eventos de cambio de fecha
    inputStartDate.addEventListener('change', fetchSummaryMetrics);
    inputEndDate.addEventListener('change', fetchSummaryMetrics);
    btnRefreshSummary.addEventListener('click', fetchSummaryMetrics);

    // Descarga de Excel Consolidado
    btnDownloadExcel.addEventListener('click', async function () {
        const token = sessionStorage.getItem(TOKEN_KEY);
        if (!token) {
            showAlert('Debe iniciar sesión para descargar reportes.', 'error');
            showLoginView();
            return;
        }

        hideAlert();
        downloadStatus.classList.remove('hidden');
        downloadStatusText.textContent = 'Procesando consulta en base de datos y construyendo archivo Excel...';
        btnDownloadExcel.disabled = true;

        const startDate = inputStartDate.value;
        const endDate = inputEndDate.value;

        let queryParams = new URLSearchParams();
        if (startDate) queryParams.append('startDate', startDate);
        if (endDate) queryParams.append('endDate', endDate);

        try {
            const url = `/api/asistencia/admin/exportar-excel?${queryParams.toString()}`;
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.status === 404) {
                showAlert('No se encontraron registros de asistencias para el rango de fechas seleccionado.', 'error');
                return;
            }

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                showAlert(errJson.message || 'Error al generar la descarga del consolidado.', 'error');
                return;
            }

            const blob = await res.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = downloadUrl;

            // Generar nombre descriptivo de archivo
            let fileName = 'reporte_asistencias_consolidado';
            if (startDate && endDate) {
                fileName += `_${startDate}_a_${endDate}`;
            } else if (startDate) {
                fileName += `_desde_${startDate}`;
            }
            fileName += '.xlsx';

            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);

            showAlert(`Reporte descargado correctamente: ${fileName}`, 'success');
        } catch (error) {
            console.error('Error durante la descarga:', error);
            showAlert('Ocurrió un problema de comunicación al descargar el archivo.', 'error');
        } finally {
            downloadStatus.classList.add('hidden');
            btnDownloadExcel.disabled = false;
        }
    });

    // Iniciar verificación al cargar
    checkCurrentSession();
})();
