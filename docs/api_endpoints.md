# Documentación de Endpoints - API de Asistencia (ENLA-2026)

Este documento describe de forma exhaustiva cada uno de los endpoints de la API del backend, incluyendo sus métodos, cabeceras, cuerpos de petición, ejemplos de petición/respuesta y los mecanismos de seguridad aplicados.

---

## Índice de Endpoints

1. [Autenticación](#1-autenticación)
   * `POST /api/auth/login` - Iniciar sesión de usuarios
2. [Configuración y Parámetros](#2-configuración-y-parámetros)
   * `GET /api/config/cargos` - Obtener cargos y sus metas
   * `POST /api/config/cargos` - Registrar un nuevo cargo (Admin)
   * `PUT /api/config/cargos/:id` - Actualizar meta de un cargo (Admin)
3. [Control de Asistencia](#3-control-de-asistencia)
   * `GET /api/attendance/verify` - Consultar estado de un postulante por DNI
   * `POST /api/attendance/scan-dni` - Escanear DNI mediante imagen Base64
   * `POST /api/attendance/register` - Registrar marcación de ingreso de postulante
   * `POST /api/attendance/register-worker` - Registrar nuevo postulante
   * `GET /api/attendance/workers` - Listar todos los postulantes con paginación
   * `PUT /api/attendance/workers/:id` - Actualizar datos de un postulante
   * `GET /api/attendance/sync-pull` - Descargar toda la base de datos para sincronización
   * `GET /api/attendance/sync-check` - Obtener conteos de control para validar sincronización
   * `GET /api/attendance/export` - Exportar reporte de asistencias a Excel (Admin)
   * `GET /api/attendance/absentees` - Listar faltantes del día actual
   * `GET /api/attendance/stats` - Obtener estadísticas generales de asistencia y metas
   * `GET /api/attendance/daily` - Obtener listas diarias de presentes y ausentes
4. [Rutas de Sistema / Diagnóstico](#4-rutas-de-sistema--diagnóstico)
   * `GET /` - Comprobación de servicio activo
   * `GET /health` - Healthcheck de la aplicación y la BD
   * `GET /api/init-db-debug` - Inicialización o depuración manual de la base de datos

---

## 1. Autenticación

### `POST /api/auth/login`
Inicia sesión en el sistema y retorna un token JWT válido por 24 horas.

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
  curl -X POST http://localhost:3000/api/auth/login \
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
        "rol": "admin"
      }
    }
    ```
  * **401 Unauthorized (Error de credenciales)**:
    ```json
    {
      "message": "Usuario o contraseña incorrectos"
    }
    ```
  * **500 Internal Server Error**:
    ```json
    {
      "message": "Error en el servidor"
    }
    ```

---

## 2. Configuración y Parámetros

### `GET /api/config/cargos`
Retorna el catálogo de cargos del sistema, junto con sus metas de vacantes asignadas.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Ejemplo de Petición (cURL)**:
  ```bash
  curl -H "Authorization: Bearer eyJhbGciOiJIUzI1Ni..." \
       http://localhost:3000/api/config/cargos
  ```
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

### `POST /api/config/cargos`
Crea un nuevo cargo en el sistema y opcionalmente define su meta inicial de vacantes.

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
* **Ejemplo de Petición (cURL)**:
  ```bash
  curl -X POST http://localhost:3000/api/config/cargos \
       -H "Authorization: Bearer eyJhbGciOiJIUzI1Ni..." \
       -H "Content-Type: application/json" \
       -d '{"nombre": "Coordinador de Aula", "meta": 8}'
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
  * **403 Forbidden (Sin rol de administrador)**:
    ```json
    {
      "message": "Requiere rol de Administrador"
    }
    ```

### `PUT /api/config/cargos/:id`
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
* **Ejemplo de Petición (cURL)**:
  ```bash
  curl -X PUT http://localhost:3000/api/config/cargos/1 \
       -H "Authorization: Bearer eyJhbGciOiJIUzI1Ni..." \
       -H "Content-Type: application/json" \
       -d '{"meta": 15}'
  ```
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    {
      "message": "Meta actualizada correctamente."
    }
    ```

---

## 3. Control de Asistencia

### `GET /api/attendance/verify`
Consulta la información de un postulante a partir de su DNI y verifica si ya registró su ingreso el día de hoy.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Parámetros de Consulta (Query Params)**:
  * `dni` (Requerido, string de 8 caracteres)
* **Ejemplo de Petición (cURL)**:
  ```bash
  curl -H "Authorization: Bearer eyJhbGciOiJIUzI1Ni..." \
       "http://localhost:3000/api/attendance/verify?dni=70932665"
  ```
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**:
    ```json
    {
      "worker": {
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
  * **400 Bad Request (Postulante de otra sede regional, para operadores)**:
    ```json
    {
      "message": "Este postulante no pertenece a la sede actual"
    }
    ```

### `POST /api/attendance/scan-dni`
Procesa la imagen del reverso del DNI para extraer el código de barras y ubicar al postulante en el sistema. Realiza detección de rostro para asegurar que no se intente escanear el anverso (cara frontal).

* **Método de Seguridad**: `verifyToken` (Requrece Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
  * `Content-Type: application/json`
* **Cuerpo de Petición (Body)**:
  ```json
  {
    "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJR..."
  }
  ```
* **Ejemplo de Petición (cURL)**:
  ```bash
  curl -X POST http://localhost:3000/api/attendance/scan-dni \
       -H "Authorization: Bearer eyJhbGciOiJIUzI1Ni..." \
       -H "Content-Type: application/json" \
       -d '{"imageBase64": "data:image/jpeg;base64,..."}'
  ```
* **Ejemplos de Respuesta**:
  * **200 OK - Escaneo Exitoso**:
    ```json
    {
      "status": "success",
      "dni": "70932665",
      "message": "DNI escaneado exitosamente.",
      "worker": {
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
  * **200 OK - Se detectó rostro (anverso)**:
    ```json
    {
      "status": "face_detected",
      "message": "Por favor voltea el DNI"
    }
    ```
  * **200 OK - DNI no registrado**:
    ```json
    {
      "status": "not_found",
      "dni": "12345678",
      "message": "DNI 12345678 decodificado, pero no registrado en el sistema."
    }
    ```
  * **200 OK - No se leyó código de barras**:
    ```json
    {
      "status": "unrecognized",
      "message": "No se detecto codigo de barras. Asegurese de enfocar el reverso del DNI."
    }
    ```

### `POST /api/attendance/register`
Registra la marcación de ingreso de un postulante en la fecha actual. Determina si llegó puntual (`P`) o tarde (`T`) comparando la hora actual de Lima con su hora programada de ingreso.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
  * `Content-Type: application/json`
* **Cuerpo de Petición (Body)**:
  ```json
  {
    "dni": "70932665",
    "observaciones": "Llegó un poco apresurado"
  }
  ```
* **Ejemplos de Respuesta**:
  * **201 Created (Marcación Exitosa)**:
    ```json
    {
      "message": "Ingreso registrado exitosamente",
      "worker": {
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
        "observaciones": "Llegó un poco apresurado"
      },
      "estado_desc": "PUNTUAL"
    }
    ```
  * **400 Bad Request (Ya marcó hoy)**:
    ```json
    {
      "message": "Ya se registro el ingreso de hoy. No se puede marcar nuevamente."
    }
    ```
  * **403 Forbidden (El postulante pertenece a otra sede)**:
    ```json
    {
      "message": "Este postulante no pertenece a la sede actual"
    }
    ```

### `POST /api/attendance/register-worker`
Inscribe a un nuevo postulante en la base de datos principal. Valida que pertenezca a la misma sede regional que el operador. Si el tipo es 'Titular' (`1`) y la meta de vacantes para ese cargo ya está cubierta, lo inscribe automáticamente con estado de 'Reserva' (`2`).

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
      "worker": {
        "id": 18,
        "sede_reg": "AMAZONAS",
        "sede_juris": "AMAZONAS",
        "doc_identidad": "48920192",
        "ape_pat": "QUISPE",
        "ape_mat": "MAMANI",
        "nombres": "RAUL",
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
  * **201 Created - Meta Cubierta (Cambio a Reserva)**:
    ```json
    {
      "message": "Postulante registrado exitosamente.",
      "worker": {
        "id": 19,
        "tipo_postulante_id": 2,
        ...
      },
      "alert": "Meta Cubierta. Se guardo como Reserva."
    }
    ```
  * **400 Bad Request (Postulante de otra sede o DNI duplicado)**:
    ```json
    {
      "message": "El DNI ya esta registrado."
    }
    ```

### `GET /api/attendance/workers`
Retorna el listado paginado de postulantes. Los operadores regulares solo verán los postulantes correspondientes a su sede regional.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Parámetros de Consulta (Query Params)**:
  * `limit` (Opcional, numérico, por defecto 10)
  * `offset` (Opcional, numérico, por defecto 0)
  * `tipo` (Opcional, string, filtra por tipo: 'Titular' o 'Reserva')
* **Ejemplo de Petición (cURL)**:
  ```bash
  curl -H "Authorization: Bearer eyJhbGciOiJIUzI1Ni..." \
       "http://localhost:3000/api/attendance/workers?limit=2&offset=0&tipo=Titular"
  ```
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

### `PUT /api/attendance/workers/:id`
Actualiza campos informativos de un postulante registrado. Los operadores están limitados a modificar datos de postulantes de su propia sede regional.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
  * `Content-Type: application/json`
* **Cuerpo de Petición (Body)**:
  ```json
  {
    "sede_reg": "AMAZONAS",
    "sede_juris": "CONDORCANQUI",
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
      "sede_reg": "AMAZONAS",
      "sede_juris": "CONDORCANQUI",
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

### `GET /api/attendance/sync-pull`
Descarga de forma agrupada todas las tablas del sistema (cargos, metas, tipos, parámetros, postulantes y asistencias del día) requeridas por la aplicación móvil para poder operar en modo completamente fuera de línea (Offline).

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
      ]
    }
    ```

### `GET /api/attendance/sync-check`
Retorna la cantidad exacta de registros de cada tabla en el servidor central. Esto es utilizado por el cliente móvil para determinar si su base de datos local está sincronizada, evitando realizar una descarga completa (`sync-pull`) innecesariamente.

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
      "asistencias": 8
    }
    ```

### `GET /api/attendance/export`
Genera y exporta en tiempo real un archivo binario `.xlsx` de Excel con los datos detallados de asistencia registrados para todos los postulantes.

* **Método de Seguridad**: `verifyToken` + `isAdmin` (Requiere rol 'admin' o 'su').
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Ejemplos de Respuesta**:
  * **200 OK (Éxito)**: Flujo binario de archivo Excel.
    * `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
    * `Content-Disposition: attachment; filename=reporte_asistencia.xlsx`

### `GET /api/attendance/absentees`
Retorna el listado de todos los postulantes que están programados para el día de hoy pero que aún no registran ninguna marcación de ingreso.

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

### `GET /api/attendance/stats`
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

### `GET /api/attendance/daily`
Retorna dos arrays diferenciados: uno de postulantes presentes (evaluados) con sus respectivas horas y estados de marcación, y otro de postulantes ausentes (no evaluados) para una fecha determinada.

* **Método de Seguridad**: `verifyToken` (Requiere Token JWT).
* **HEADERS**:
  * `Authorization: Bearer <TOKEN>`
* **Parámetros de Consulta (Query Params)**:
  * `date` (Opcional, string en formato YYYY-MM-DD, por defecto la fecha actual del servidor)
* **Ejemplo de Petición (cURL)**:
  ```bash
  curl -H "Authorization: Bearer eyJhbGciOiJIUzI1Ni..." \
       "http://localhost:3000/api/attendance/daily?date=2026-07-13"
  ```
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
  * **500 Internal Server Error (Problemas de conexión a BD)**:
    ```json
    {
      "status": "Error",
      "database": "error: database connection failed"
    }
    ```

### `GET /api/init-db-debug`
Inicialización o depuración manual de la base de datos. Crea todas las tablas requeridas, índices, carga datos por defecto (parámetros y cargos) y configura la contraseña del usuario `admin` a `admin123`.

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
