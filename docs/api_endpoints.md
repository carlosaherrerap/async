# Documentación de Endpoints - API de Asistencia (ENLA-2026)

Este documento describe de forma exhaustiva cada uno de los endpoints de la API del backend, incluyendo sus métodos, cabeceras, cuerpos de petición, ejemplos de petición/respuesta y los mecanismos de seguridad aplicados.

---

## Índice de Endpoints

1. [Autenticación](#1-autenticación)
   * `POST /api/autenticacion/iniciar-sesion` - Iniciar sesión de usuarios
   * `POST /api/autenticacion/cerrar-sesion` - Cerrar sesión de usuarios
2. [Configuración y Parámetros](#2-configuración-y-parámetros)
   * `GET /api/configuracion/cargos` - Obtener cargos y sus metas
   * `POST /api/configuracion/cargos` - Registrar un nuevo cargo (Admin)
   * `PUT /api/configuracion/cargos/:id` - Actualizar meta de un cargo (Admin)
   * `GET /api/configuracion/sedes` - Obtener lista de sedes jurisdiccionales
3. [Control de Asistencia](#3-control-de-asistencia)
   * `GET /api/asistencia/verificar` - Consultar estado de un postulante por DNI
   * `POST /api/asistencia/escanear-dni` - Escanear DNI mediante imagen Base64
   * `POST /api/asistencia/registrar-asistencia` - Registrar marcación de ingreso de postulante
   * `POST /api/asistencia/registrar-postulante` - Registrar nuevo postulante
   * `GET /api/asistencia/postulantes` - Listar todos los postulantes con paginación
   * `PUT /api/asistencia/postulantes/:id` - Actualizar datos de un postulante
   * `GET /api/asistencia/sincronizar-descarga` - Descargar toda la base de datos para sincronización
   * `GET /api/asistencia/sincronizar-verificacion` - Obtener conteos de control para validar sincronización
   * `GET /api/asistencia/exportar-excel` - Exportar reporte consolidado a Excel (Todos los autenticados)
   * `GET /api/asistencia/inasistencias` - Listar faltantes del día actual
   * `GET /api/asistencia/estadisticas` - Obtener estadísticas generales de asistencia y metas
   * `GET /api/asistencia/reporte-diario` - Obtener listas de presentes y ausentes para un día específico
4. [Rutas de Sistema / Diagnóstico](#4-rutas-de-sistema--diagnóstico)
   * `GET /` - Comprobación de servicio activo
   * `GET /health` - Healthcheck de la aplicación y la BD
   * `GET /api/init-db-debug` - Inicialización o depuración manual de la base de datos

---

## 1. Autenticación

### `POST /api/autenticacion/iniciar-sesion`
Inicia sesión en el sistema y retorna un token JWT válido hasta el final del día actual.

* **Método de Seguridad**: Ninguno (Público).
* **HEADERS**:
  * `Content-Type: application/json`
* **Cuerpo de Petición (Body)**:
  ```json
  {
    "username": "admin",
    "password": "password"
  }
  ```
* **Ejemplo de Petición (cURL)**:
  ```bash
  curl -X POST http://localhost:3000/api/autenticacion/iniciar-sesion \
       -H "Content-Type: application/json" \
       -d '{"username": "admin", "password": "password"}'
  ```
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "user": {
        "id": 1,
        "username": "admin",
        "nombre": "Administrador",
        "rol": "admin",
        "sede_nombre": null
      }
    }
    ```
    > [!NOTE]
    > Si el usuario no es `admin` o `SU`, `sede_nombre` contendrá el nombre legible de su sede regional asignada (obtenida desde la BD), de lo contrario será `null`.
  * **401 Unauthorized (Error de credenciales)**:
    ```json
    {
      "message": "Usuario o contraseña incorrectos"
    }
    ```
  * **403 Forbidden (Usuario bloqueado tras 3 intentos fallidos consecutivos)**:
    ```json
    {
      "message": "El usuario está bloqueado por seguridad."
    }
    ```

### `POST /api/autenticacion/cerrar-sesion`
Cierra la sesión activa del usuario.

* **Método de Seguridad**: Ninguno.
* **Ejemplos de Respuesta**:
  * **200 OK**:
    ```json
    {
      "success": true,
      "message": "Sesión cerrada correctamente"
    }
    ```

---

## 2. Configuración y Parámetros

### `GET /api/configuracion/cargos`
Retorna el catálogo de cargos del sistema, junto con sus metas de vacantes asignadas.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    [
      {
        "id": 1,
        "nombre": "Monitor Nacional",
        "meta": 10
      },
      {
        "id": 2,
        "nombre": "Supervisor Nacional",
        "meta": 5
      }
    ]
    ```

### `POST /api/configuracion/cargos`
Crea un nuevo cargo en el sistema y define su meta inicial de vacantes.

* **Método de Seguridad**: `verifyToken` + `isAdmin` (Requiere rol 'admin' o 'su').
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
  * `Content-Type: application/json`
* **Cuerpo de Petición (Body)**:
  ```json
  {
    "nombre": "Coordinador de Aula",
    "meta": 8
  }
  ```
* **Ejemplos de Respuesta**:
  * **201 Created (Éxito)**:
    ```json
    {
      "id": 6,
      "nombre": "Coordinador de Aula",
      "meta": 8
    }
    ```

### `PUT /api/configuracion/cargos/:id`
Actualiza el número límite de vacantes (meta) asignadas a un cargo específico.

* **Método de Seguridad**: `verifyToken` + `isAdmin` (Requiere rol 'admin' o 'su').
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
  * `Content-Type: application/json`
* **Cuerpo de Petición (Body)**:
  ```json
  {
    "meta": 15
  }
  ```
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    {
      "message": "Meta actualizada correctamente."
    }
    ```

### `GET /api/configuracion/sedes`
Obtiene la lista de todas las sedes jurisdiccionales del sistema.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    [
      {
        "id": "010100",
        "nombre": "Chachapoyas",
        "sede_regional_id": "01",
        "codigo_juris": "0101"
      }
    ]
    ```

---

## 3. Control de Asistencia

### `GET /api/asistencia/verificar`
Consulta la información de un postulante a partir de su DNI y verifica si ya registró su ingreso el día de hoy.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Parámetros de Consulta (Query Params)**:
  * `dni` (Requerido, string de 8 caracteres)
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    {
      "postulante": {
        "id": 1,
        "dni": "70932665",
        "nombre": "MIRIAM JENNIFER ABAD LLONTOP",
        "puesto": "Tecnico Administrativo Provincial",
        "area": "AMAZONAS - LOCAL AMAZONAS BAGUA (Aula 1)",
        "sede_reg": "AMAZONAS",
        "sede_juris": "AMAZONAS",
        "tipo_postulante": "Titular",
        "turno": "DIA",
        "hora_ingreso": "08:00:00"
      },
      "status": "none",
      "attendance": null
    }
    ```
  * **404 Not Found (Postulante no existe)**:
    ```json
    {
      "message": "Postulante no encontrado"
    }
    ```

### `POST /api/asistencia/escanear-dni`
Procesa la imagen del reverso del DNI para extraer el código de barras y ubicar al postulante. Realiza una detección de rostro para evitar escaneos incorrectos (anverso).

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
  * `Content-Type: application/json`
* **Cuerpo de Petición (Body)**:
  ```json
  {
    "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJR..."
  }
  ```
* **Ejemplos de Respuesta**:
  * **200 OK - Escaneo Exitoso**:
    ```json
    {
      "status": "success",
      "dni": "70932665",
      "message": "DNI escaneado exitosamente.",
      "postulante": {
        "id": 1,
        "dni": "70932665",
        "nombre": "MIRIAM JENNIFER ABAD LLONTOP",
        "puesto": "Tecnico Administrativo Provincial",
        "area": "AMAZONAS - LOCAL AMAZONAS BAGUA (Aula 1)",
        "sede_reg": "AMAZONAS",
        "sede_juris": "AMAZONAS",
        "tipo_postulante": "Titular",
        "turno": "DIA",
        "hora_ingreso": "08:00:00"
      },
      "attendanceStatus": "none",
      "attendance": null
    }
    ```

### `POST /api/asistencia/registrar-asistencia`
Registra la marcación de ingreso de un postulante en la fecha actual. Determina si es puntual (`P`) o tarde (`T`).

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
  * `Content-Type: application/json`
* **Cuerpo de Petición (Body)**:
  ```json
  {
    "dni": "70932665",
    "observaciones": "Llegó a tiempo"
  }
  ```
* **Ejemplos de Respuesta**:
  * **201 Created (Marcación Exitosa)**:
    ```json
    {
      "message": "Ingreso registrado exitosamente",
      "postulante": {
        "nombre": "MIRIAM JENNIFER ABAD LLONTOP",
        "puesto": "Tecnico Administrativo Provincial",
        "area": "AMAZONAS - LOCAL AMAZONAS BAGUA (Aula 1)",
        "turno": "DIA",
        "hora_ingreso": "08:00:00"
      },
      "record": {
        "id": 16,
        "principal_id": 1,
        "estado": "P",
        "fecha_hora": "2026-07-13T07:54:21.000Z",
        "observaciones": "Llegó a tiempo",
        "usuario_registro_id": 3
      },
      "estado_desc": "PUNTUAL"
    }
    ```

### `POST /api/asistencia/registrar-postulante`
Inscribe a un nuevo postulante. Si es 'Titular' (`1`) y la meta de vacantes está cubierta para ese cargo, se le inscribe automáticamente como 'Reserva' (`2`).

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
  * `Content-Type: application/json`
* **Cuerpo de Petición (Body)**:
  ```json
  {
    "dni": "48920192",
    "ape_pat": "QUISPE",
    "ape_mat": "MAMANI",
    "nombres": "RAUL",
    "sede_reg": "AMAZONAS",
    "sede_juris": "AMAZONAS",
    "local": "LOCAL AMAZONAS BAGUA",
    "aula": 2,
    "cargo_id": 5,
    "tipo_postulante_id": 1,
    "turno": "DIA",
    "hora_ingreso": "08:00:00"
  }
  ```
* **Ejemplos de Respuesta**:
  * **201 Created (Éxito)**:
    ```json
    {
      "message": "Postulante registrado exitosamente.",
      "postulante": {
        "id": 18,
        "doc_identidad": "48920192",
        "ape_pat": "QUISPE",
        "ape_mat": "MAMANI",
        "nombres": "RAUL",
        "sede_juris_id": "0101",
        "local": "LOCAL AMAZONAS BAGUA",
        "aula": 2,
        "tipo_postulante_id": 1,
        "cargo_id": 5,
        "turno": "DIA",
        "hora_ingreso": "08:00:00"
      },
      "alert": null
    }
    ```

### `GET /api/asistencia/postulantes`
Retorna el listado paginado de postulantes. Los operadores locales solo verán los pertenecientes a su sede regional.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Parámetros de Consulta (Query Params)**:
  * `limit` (Opcional, numérico, por defecto 10)
  * `offset` (Opcional, numérico, por defecto 0)
  * `tipo` (Opcional, string, filtra por tipo: 'Titular' o 'Reserva')
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    {
      "data": [
        {
          "id": 1,
          "dni": "70932665",
          "ape_pat": "ABAD",
          "ape_mat": "LLONTOP",
          "nombres": "MIRIAM JENNIFER",
          "area": "LOCAL AMAZONAS BAGUA",
          "sede_reg": "AMAZONAS",
          "sede_juris": "AMAZONAS",
          "aula": 1,
          "turno": "DIA",
          "hora_ingreso": "08:00:00",
          "cargo": "Tecnico Administrativo Provincial",
          "tipo_postulante": "Titular",
          "cargo_id": 5
        }
      ],
      "total": 12
    }
    ```

### `PUT /api/asistencia/postulantes/:id`
Actualiza campos informativos de un postulante. Los operadores están limitados a su propia sede regional.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
  * `Content-Type: application/json`
* **Cuerpo de Petición (Body)**:
  ```json
  {
    "sede_reg": "AMAZONAS",
    "sede_juris_id": "0101",
    "local": "LOCAL B",
    "aula": 3,
    "cargo_id": 5,
    "turno": "TARDE",
    "hora_ingreso": "14:00:00"
  }
  ```
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    {
      "id": 1,
      "doc_identidad": "70932665",
      "ape_pat": "ABAD",
      "ape_mat": "LLONTOP",
      "nombres": "MIRIAM JENNIFER",
      "local": "LOCAL B",
      "aula": 3,
      "tipo_postulante_id": 1,
      "cargo_id": 5,
      "turno": "TARDE",
      "hora_ingreso": "14:00:00"
    }
    ```

### `GET /api/asistencia/sincronizar-descarga`
Descarga de forma agrupada todas las tablas de referencia (cargos, metas, tipos, parámetros, postulantes, sedes, y asistencias del día) requeridas por la aplicación móvil para operar de modo totalmente fuera de línea (Offline).

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    {
      "cargos": [
        { "id": 1, "nombre": "Monitor Nacional" }
      ],
      "metas_cargos": [
        { "cargo_id": 1, "limite_vacantes": 10 }
      ],
      "tipo_postulante": [
        { "id": 1, "descripcion": "Titular" }
      ],
      "parametros_asistencia": [
        { "estado": "P", "descripcion": "Puntual" }
      ],
      "workers": [
        { "id": 1, "doc_identidad": "70932665", "nombres": "MIRIAM JENNIFER", ... }
      ],
      "asistencias": [
        { "id": 1, "principal_id": 1, "estado": "P", "fecha_hora": "..." }
      ],
      "sede_regional": [
        { "id": "01", "nombre": "AMAZONAS" }
      ],
      "sede_juris": [
        { "id": "010100", "nombre": "Chachapoyas", "sede_regional_id": "01", "codigo_juris": "0101" }
      ]
    }
    ```

### `GET /api/asistencia/sincronizar-verificacion`
Retorna la cantidad exacta de registros de cada tabla en el servidor central para validar si el cliente móvil requiere un `sincronizar-descarga`.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    {
      "cargos": 5,
      "metas_cargos": 5,
      "tipo_postulante": 2,
      "parametros_asistencia": 2,
      "workers": 15,
      "asistencias": 8,
      "sede_regional": 28,
      "sede_juris": 165
    }
    ```

### `GET /api/asistencia/exportar-excel`
Genera y exporta en tiempo real un archivo `.xlsx` de Excel con los datos detallados de asistencia registrados para todos los postulantes.
> [!IMPORTANT]
> A diferencia de versiones anteriores, este endpoint está disponible para **todos los usuarios autenticados**. Los usuarios regionales (`rol` numérico) solo descargarán los postulantes pertenecientes a su sede regional asignada. Los usuarios de rol `admin` o `SU` descargarán la data global.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT enviado vía query param o header).
* **Parámetros de Consulta (Query Params)**:
  * `token` (Opcional, alternativo para descarga directa desde navegador)
* **Especificaciones del Reporte**:
  * Incluye a **todos los postulantes** (asistieron y no asistieron) mediante un `LEFT JOIN`.
  * Añade el campo **`ESTADO`** con valores:
    * **`A`** (Asistió): Si el postulante cuenta con una marcación de asistencia en estado `P` o `T`.
    * **`NA`** (No Asistió): Si el postulante no registra marcación de asistencia.
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**: Flujo binario de archivo Excel.
    * `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
    * `Content-Disposition: attachment; filename=reporte_asistencia.xlsx`

### `GET /api/asistencia/inasistencias`
Retorna el listado de todos los postulantes programados para el día de hoy pero que aún no registran ninguna marcación de ingreso.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    [
      {
        "dni": "45678901",
        "nombres": "CARLOS ALBERTO",
        "apellidos": "GARCIA PEREZ",
        "area": "LOCAL AMAZONAS BAGUA",
        "puesto": "Coordinador Regional",
        "turno": "DIA",
        "hora_ingreso": "07:00:00"
      }
    ]
    ```

### `GET /api/asistencia/estadisticas`
Consolida los totales globales de asistencia (asistencias totales, faltantes, tardanzas, ingresos tempranos) y listas detalladas de asistencia y vacantes agrupadas por cargo.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    {
      "presentes": 8,
      "faltas": 7,
      "tardanzas": 2,
      "temprano": 6,
      "asistenciaPorCargo": [
        { "cargo": "Monitor Nacional", "presentes": 1, "total_cargo": 2 }
      ],
      "metasPorCargo": [
        { "cargo": "Monitor Nacional", "meta": 10, "registrados": 2 }
      ]
    }
    ```

### `GET /api/asistencia/reporte-diario`
Retorna dos arrays: uno de postulantes presentes (evaluados) con sus respectivas horas y estados de marcación, y otro de postulantes ausentes (no evaluados) para una fecha determinada.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Parámetros de Consulta (Query Params)**:
  * `date` (Opcional, string en formato YYYY-MM-DD, por defecto la fecha actual del servidor)
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    {
      "date": "2026-07-13",
      "presentes": [
        {
          "id": 1,
          "dni": "70932665",
          "nombres": "MIRIAM JENNIFER",
          "ape_pat": "ABAD",
          "ape_mat": "LLONTOP",
          "cargo": "Tecnico Administrativo Provincial",
          "tipo_postulante": "Titular",
          "sede_reg": "AMAZONAS",
          "sede_juris": "AMAZONAS",
          "local": "LOCAL AMAZONAS BAGUA",
          "turno": "DIA",
          "aula": 1,
          "hora_ingreso": "08:00:00",
          "estado": "P",
          "fecha_hora": "2026-07-13T07:54:21.000Z"
        }
      ],
      "ausentes": [
        {
          "id": 2,
          "dni": "45678901",
          "nombres": "CARLOS ALBERTO",
          "ape_pat": "GARCIA",
          "ape_mat": "PEREZ",
          "cargo": "Coordinador Regional",
          "tipo_postulante": "Titular",
          "sede_reg": "AMAZONAS",
          "sede_juris": "AMAZONAS",
          "local": "LOCAL AMAZONAS BAGUA",
          "turno": "DIA",
          "aula": 2,
          "hora_ingreso": "07:00:00"
        }
      ]
    }
    ```

---

## 4. Rutas de Sistema / Diagnóstico

### `GET /`
Comprobación básica de que el servidor web se encuentra levantado.

* **Método de Seguridad**: Ninguno.
* **Ejemplos de Respuesta**:
  * **200 OK**:
    ```json
    {
      "message": "API de Asistencia activa"
    }
    ```

### `GET /health`
Verificación del estado general de salud del servidor y la conexión a la base de datos de PostgreSQL.

* **Método de Seguridad**: Ninguno.
* **Ejemplos de Respuesta**:
  * **200 OK (Salud Correcta)**:
    ```json
    {
      "status": "OK",
      "database": "Connected"
    }
    ```

### `GET /api/init-db-debug`
Inicialización o depuración manual de la base de datos. Crea todas las tablas, índices, carga datos por defecto (parámetros y cargos) y configura la contraseña del usuario `admin` a `admin123`.

* **Método de Seguridad**: Ninguno (Herramienta de depuración y desarrollo).
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    {
      "success": true,
      "logs": [
        "Starting manual DB initialization...",
        "Table parametros_asistencia created or verified.",
        "Table cargos created or verified.",
        "Table metas_cargos created or verified.",
        "Table tipo_postulante created or verified.",
        "Table principal created or verified.",
        "Table usuarios created or verified.",
        "Table asistencias created or verified.",
        "Indexes created or verified.",
        "Default parameters inserted.",
        "Default type options inserted.",
        "Admin user created or verified.",
        "Sequences synchronized."
      ]
    }
    ```
