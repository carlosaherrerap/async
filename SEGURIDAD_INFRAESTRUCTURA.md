# Especificaciones de Seguridad e Infraestructura

Este documento detalla las medidas para garantizar la integridad de los datos, la disponibilidad del sistema y su rendimiento óptimo.

## 1. Seguridad de la Aplicación

### Mecanismos Aplicados
*   **Autenticación JWT (JSON Web Tokens):** Las sesiones no se guardan en el servidor, lo que hace la app más escalable y segura.
*   **Prevención de Inyecciones SQL:** Uso de **Consultas Preparadas (PDO/Mongoose/Sequelize)**. Ningún dato del escáner entra directo a la consulta.
*   **Saneamiento de Inputs:** Limpieza de caracteres especiales en el DNI/QR para evitar ataques XSS o inyecciones de comandos.
*   **RBAC (Role-Based Access Control):** 
    *   *Operador:* Solo puede escanear y ver confirmaciones.
    *   *Admin:* Puede ver reportes, borrar registros y configurar horarios.

### Repercusión en la App
*   **Integridad:** Se asegura que solo personal autorizado registre asistencias.
*   **Inviolabilidad:** Los datos de asistencia no pueden ser modificados por los trabajadores desde el front-end.

---

## 2. Infraestructura y Disponibilidad

### ¿Cómo evitamos que se caiga? (Alta Disponibilidad)
*   **Contenerización (Docker):** La app corre en contenedores aislados. Si uno falla, se reinicia automáticamente.
*   **Health Checks:** El servidor monitorea constantemente si el servicio está "vivo".
*   **Backups Automáticos:** Respaldo diario de la base de datos SQL para recuperación ante desastres.

### ¿Cómo evitamos que sea lento? (Rendimiento)
*   **Indexación de Base de Datos:** Los campos `DNI` y `Fecha` están indexados para que las búsquedas sean instantáneas incluso con miles de registros.
*   **Lazy Loading:** Las vistas de reportes solo cargan los datos necesarios (paginación) en lugar de miles de filas de golpe.
*   **CDN / Caching:** Uso de caché para recursos estáticos (CSS, JS, Logos) para que la interfaz cargue rápido en dispositivos móviles.

### ¿Cómo evitamos que se rompa? (Estabilidad)
*   **Validación de Esquemas:** El backend valida que los datos que llegan sean exactamente lo esperado antes de intentar guardarlos.
*   **Manejo de Errores Global:** Si algo falla, el usuario recibe un mensaje amigable y el error se guarda en un log interno para el desarrollador.

---

## 3. Especificaciones Técnicas de Servidor (Mínimas)
*   **CPU:** 2 Cores (Optimizado para procesos de escaneo paralelos).
*   **RAM:** 4GB (Suficiente para manejar el buffer de imágenes de cámara y procesos de Excel).
*   **Almacenamiento:** SSD (Vital para la velocidad de lectura/escritura de logs de asistencia).
