# Análisis de Viabilidad y Desafíos Técnicos (Actualizado)

Este documento separa las funcionalidades del sistema según su complejidad de implementación.

## 1. Lo que es Viable y Directo (Posible)

*   **Ingreso Manual:**
    *   *Razón:* Es el método más estable y sencillo. Solo requiere una validación de longitud y tipo de dato (numérico).
*   **Integración con Pistola Láser (Barcodes):** 
    *   *Razón:* Al ser HID (emulación de teclado), el sistema solo debe estar "escuchando" en un campo de texto específico.
*   **Exportación a Excel Detallada:**
    *   *Razón:* Agregar campos como "Hora de Salida" u "Observaciones" no aumenta la dificultad técnica, solo requiere más columnas en la base de datos y en la lógica de generación del archivo.
*   **Feedback Sonoro y Visual:**
    *   *Razón:* Uso de librerías de audio estándar y CSS para animaciones premium.

## 2. Lo que presenta Desafíos (Difícil / Retos)

*   **Escaneo de Código de Barras por Cámara:**
    *   *Dificultad:* Sigue siendo el mayor reto técnico debido a la variedad de hardware (cámaras) y condiciones de luz. El sistema debe ser capaz de procesar el formato de código de barras específico que usan los DNI o carnets de la empresa.
*   **Lógica de Observaciones:**
    *   *Dificultad:* Decidir si la observación se pone *al momento* de marcar o si un administrador la pone *después*.
    *   *Solución:* Permitir que en el modal de confirmación se pueda escribir una observación rápida o marcar un "check" de permiso.
*   **Control de Horas Extra:**
    *   *Dificultad:* Cálculo automático comparando la hora de salida real vs. la hora de salida programada, considerando si se debe redondear o si requiere aprobación.
