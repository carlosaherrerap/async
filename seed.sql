-- Seed data (hard reset considerations)

-- Usuario administrador (hash bcrypt de la contraseña "admin123")
INSERT INTO usuarios (username, password_hash, nombre, rol) VALUES
('admin',
 '$2a$10$Xm7M/k/f1J.5f7H3X.H1OeY4p.S3X0Z6r4W8f9u7d8v7R6Q5P4O3N',
 'Administrador',
 'admin');

-- Ejemplo de asistente principal
INSERT INTO principal (
  sede_reg, sede_juris, doc_identidad,
  ape_pat, ape_mat, nombres,
  local, aula, tipo_postulante_id, cargo_id
) VALUES
('AMAZONAS', 'AMAZONAS', '70932665',
 'ABAD', 'LLONTOP', 'MIRIAM JENNIFER',
 'LOCAL AMAZONAS BAGUA', 1, 1, 5);

-- Registro de asistencia de ejemplo (estado Puntual 'P')
INSERT INTO asistencias (principal_id, estado, observaciones) VALUES
(1, 'P', 'Asistencia puntual');
