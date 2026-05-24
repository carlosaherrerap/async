# Sistema de Control de Asistencia (SCA) - Levantamiento de Requerimientos

## 1. Resumen del Proyecto
El objetivo es desarrollar una aplicación web/móvil para la gestión integral de la asistencia de trabajadores, permitiendo el registro automatizado mediante escaneo, seguimiento en tiempo real y generación de reportes detallados para la toma de decisiones administrativas.

---

## 2. Módulos Principales

### 2.1. Módulo de Registro de Asistencia (Front-end de Marcación)
El sistema permitirá tres métodos principales de entrada de datos:
1.  **Cámara Integrada (Barcodes):**
    *   Uso de la cámara del dispositivo para capturar códigos de barras.
    *   Extracción automática del número de DNI.
    *   Consulta automática a la base de datos para recuperar nombres, apellidos y puesto.
    *   Confirmación visual y registro final de la asistencia.
2.  **Escáner Láser Externo (Barcodes):**
    *   Soporte para pistola física de láser (entrada tipo teclado/HID).
    *   Lectura de códigos de barras.
    *   Consulta a la DB y confirmación automática con fecha y hora exacta del servidor.
3.  **Ingreso Manual:**
    *   Campo de texto para escribir el número de DNI manualmente.
    *   Botón de "Consultar" para buscar al trabajador en la base de datos sin usar cámara ni escáner.
    *   Útil como respaldo en caso de fallos de hardware o códigos dañados.

### 2.2. Módulo de Gestión de Trabajadores
*   Visualización de información detallada por trabajador.
*   Asociación de trabajadores a **Áreas** y **Puestos** específicos.
*   Buscador y filtros por DNI, Nombre o Área.

### 2.3. Módulo de Administración y Reportes
*   **Dashboard en tiempo real:** Ver quién ha faltado hoy.
*   **Seguimiento de Faltas:** Lista de trabajadores ausentes con opción de seguimiento.
*   **Reporte Excel:** Descarga de reportes en formato `.xlsx` con filtros por rango de fechas, áreas o puestos.

---

## 3. Lógica de Negocio y Automatización

### 3.1. Estados de Asistencia
*   **Puntual:** Marcación dentro del rango permitido.
*   **Tardanza:** Marcación posterior a la hora de entrada configurada.
*   **Falta:** 
    *   *Automática:* Si al finalizar la jornada o un horario límite el trabajador no registra ingreso, el sistema lo marca como "Falta".
    *   *Manual:* Botón administrativo para forzar el estado de falta en casos excepcionales.

### 3.2. Notificaciones
*   Sistema de alertas para el administrador informando:
    *   Trabajadores que no han marcado ingreso tras N minutos de su hora de entrada.
    *   Resumen diario de ausencias.

---

## 4. Requerimientos Técnicos (Propuestos)

### 4.1. Base de Datos
*   **Tablas base:** `Trabajadores`, `Areas`, `Puestos`, `Asistencias`, `Configuracion_Horarios`.

### 4.2. Interfaz y Experiencia de Usuario (UX/UI)
*   **Diseño Premium:** Interfaz limpia, intuitiva y responsive.
*   **Feedback Visual:** Animaciones suaves al escanear correctamente y sonidos de confirmación 

### 4.3. Librerías Clave
*   **Escaneo:** `html5-qrcode` o similares para la cámara.
*   **Excel:** `SheetJS (XLSX)` o librerías backend (como `ExcelJS` o `PhpSpreadsheet`) para la exportación.
*   **Backend:** Node.js, PHP o Python (según preferencia).

---

## 5. Criterios de Aceptación
*   [ ] El sistema debe registrar la hora exacta sin posibilidad de alteración por el usuario.
*   [ ] El reporte Excel debe incluir DNI, Nombre, Área, Puesto, Fecha, Hora de Entrada, Hora de Salida, Estado (Asistió/Tardanza/Falta) y Observaciones (permisos, horas extra, etc.).
*   [ ] La consulta a la DB al escanear debe ser instantánea (< 1 seg).
