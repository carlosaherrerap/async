import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Animated, ScrollView } from 'react-native';
import { Modal, Portal, Surface, Avatar, ActivityIndicator, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

// ─── Paleta de colores por tipo ─────────────────────────────────────────────
const TIPO_COLORS = {
  Titular: { bg: '#F0FDF4', border: '#DCFCE7', text: '#15803D', icon: 'account-check-outline' },
  Reserva: { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C', icon: 'account-clock-outline' },
  default: { bg: '#F8FAFC', border: '#E2E8F0', text: '#64748B', icon: 'account-question-outline' },
};

const InfoBlock = ({ label, value }) => (
  <View style={styles.infoBlock}>
    <Text style={styles.infoBlockLabel}>{label}</Text>
    <Text style={styles.infoBlockValue} numberOfLines={2}>
      {value && value.trim() !== '' ? value : 'Sin definir'}
    </Text>
  </View>
);

const AttendanceModal = ({ visible, data, onClose, onRegisterSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [aulaReserva, setAulaReserva] = useState('');
  const [aulaError, setAulaError] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 280, useNativeDriver: true,
      }).start();
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch (_) {}
      setAulaReserva('');
      setAulaError(false);
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible]);

  if (!data) return null;

  const { worker, status, attendance } = data;

  // ── Detectar tipo postulante ─────────────────────────────────────────────
  const tipoPostulante = worker?.tipo_postulante || null;
  const isReserva = tipoPostulante === 'Reserva';
  const isTitular = tipoPostulante === 'Titular';
  const tipoColors = TIPO_COLORS[tipoPostulante] || TIPO_COLORS.default;

  // ── Turno display ────────────────────────────────────────────────────────
  const turnoDisplay = worker?.turno === 'DIA' ? 'DIURNO'
    : worker?.turno === 'TARDE' ? 'TARDE' : (worker?.turno || '');

  // ── Handle registro de ingreso ───────────────────────────────────────────
  const handleIngreso = async () => {
    if (isReserva && status === 'none') {
      if (!aulaReserva || aulaReserva.trim() === '') {
        setAulaError(true);
        return;
      }
      setAulaError(false);
    }

    setLoading(true);
    try {
      if (global.dbHelper.isOnline()) {
        try {
          const token = await AsyncStorage.getItem('userToken');
          const body = { dni: worker.dni };
          if (isReserva && aulaReserva) body.aula = parseInt(aulaReserva);

          const response = await fetch('https://backend-6oio.onrender.com/api/attendance/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body),
          });

          const result = await response.json();

          if (response.ok) {
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (_) {}

            // Actualizar SQLite local
            const db = global.dbHelper.db;
            if (db && result.record) {
              const rec = result.record;
              try {
                await db.runAsync(
                  'INSERT OR REPLACE INTO asistencias (id, principal_id, estado, fecha_hora, observaciones) VALUES (?, ?, ?, ?, ?)',
                  [rec.id, rec.principal_id, rec.estado, rec.fecha_hora, rec.observaciones]
                );
                if (isReserva && aulaReserva) {
                  await db.runAsync('UPDATE principal SET aula = ? WHERE doc_identidad = ?',
                    [parseInt(aulaReserva), worker.dni]);
                }
              } catch (dbErr) {
                console.error('Failed to update local db after online registration:', dbErr);
              }
            }

            onClose();
            if (onRegisterSuccess) onRegisterSuccess(result);
            return;
          } else {
            alert(result.message || 'Error al registrar ingreso');
            return;
          }
        } catch (fetchErr) {
          console.log('Error online, fallback a SQLite:', fetchErr.message);
        }
      }

      // ── Modo offline ────────────────────────────────────────────────────
      const result = await global.dbHelper.registerAttendanceOffline(worker.dni, null);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (_) {}
      onClose();
      if (onRegisterSuccess) onRegisterSuccess(result);
    } catch (error) {
      alert(error.message || 'Error al registrar ingreso');
    } finally {
      setLoading(false);
    }
  };

  // ── Status badge ─────────────────────────────────────────────────────────
  const statusIsEntered = status === 'entered';
  const statusColor = statusIsEntered ? '#15803D' : '#94A3B8';

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={styles.overlay}
      >
        <Animated.View style={[styles.cardWrap, { opacity: fadeAnim }]}>
          <Surface style={styles.card} elevation={4}>
            <ScrollView contentContainerStyle={styles.cardContent} showsVerticalScrollIndicator={false}>

              {/* ── Avatar + Estado ──────────────────────────────────────── */}
              <View style={styles.avatarRow}>
                <Avatar.Icon
                  size={72}
                  icon="account"
                  style={{ backgroundColor: statusIsEntered ? '#15803D' : '#334155' }}
                />
                <View style={[styles.statusPill, {
                  backgroundColor: statusIsEntered ? '#F0FDF4' : '#F8FAFC',
                  borderColor: statusIsEntered ? '#DCFCE7' : '#E2E8F0'
                }]}>
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.statusPillText, { color: statusColor }]}>
                    {statusIsEntered ? 'INGRESO REGISTRADO' : 'SIN MARCAR HOY'}
                  </Text>
                </View>
              </View>

              {/* ── Nombre + Cargo ───────────────────────────────────────── */}
              <Text style={styles.nombre}>{worker?.nombre || '-'}</Text>
              <Text style={styles.puesto}>{worker?.puesto || '-'}</Text>

              {/* ── Tipo Postulante Badge ────────────────────────────────── */}
              {tipoPostulante ? (
                <View style={[styles.tipoBadge, {
                  backgroundColor: tipoColors.bg,
                  borderColor: tipoColors.border,
                }]}>
                  <MaterialCommunityIcons name={tipoColors.icon} size={15} color={tipoColors.text} />
                  <Text style={[styles.tipoText, { color: tipoColors.text }]}>
                    {tipoPostulante.toUpperCase()}
                  </Text>
                </View>
              ) : (
                <View style={[styles.tipoBadge, {
                  backgroundColor: '#FEF9C3',
                  borderColor: '#FDE047',
                }]}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={15} color="#A16207" />
                  <Text style={[styles.tipoText, { color: '#A16207' }]}>TIPO SIN ASIGNAR</Text>
                </View>
              )}

              {/* ── Grid Sedes ───────────────────────────────────────────── */}
              <View style={styles.sedeGrid}>
                <InfoBlock label="SEDE REGIONAL" value={worker?.sede_reg} />
                <InfoBlock label="SEDE JURISDICCIONAL" value={worker?.sede_juris} />
              </View>

              {/* ── Área / Local ─────────────────────────────────────────── */}
              <Text style={styles.areaText}>{worker?.area || '-'}</Text>

              {/* ── Turno + Hora ─────────────────────────────────────────── */}
              {worker?.turno && (
                <View style={styles.turnoRow}>
                  <View style={styles.turnoChip}>
                    <MaterialCommunityIcons
                      name={worker.turno === 'DIA' ? 'weather-sunny' : 'weather-night'}
                      size={15} color="#334155"
                    />
                    <Text style={styles.turnoChipText}>Turno {turnoDisplay}</Text>
                  </View>
                  {worker?.hora_ingreso && (
                    <View style={styles.turnoChip}>
                      <MaterialCommunityIcons name="clock-outline" size={15} color="#334155" />
                      <Text style={styles.turnoChipText}>
                        Ingreso: {worker.hora_ingreso.substring(0, 5)}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              <View style={styles.divider} />

              {/* ── Asistencia registrada ─────────────────────────────────── */}
              {attendance && (
                <View style={styles.attendanceRow}>
                  <MaterialCommunityIcons name="check-circle" size={20} color="#15803D" />
                  <Text style={styles.attendanceText}>
                    Ingreso: {new Date(attendance.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' – '}
                    {attendance.estado === 'P' ? 'PUNTUAL / TEMPRANO' : 'TARDE'}
                  </Text>
                </View>
              )}

              {/* ── Campo Aula para Reserva (solo si no ha marcado) ──────── */}
              {isReserva && status === 'none' && (
                <View style={styles.aulaContainer}>
                  <View style={[styles.aulaAlert, { borderColor: aulaError ? '#B91C1C' : '#FED7AA' }]}>
                    <MaterialCommunityIcons name="information-outline" size={16} color="#C2410C" />
                    <Text style={styles.aulaAlertText}>
                      Postulante RESERVA — asignar aula antes de marcar ingreso
                    </Text>
                  </View>
                  <TextInput
                    label="Aula asignada *"
                    value={aulaReserva}
                    onChangeText={(t) => { setAulaReserva(t); setAulaError(false); }}
                    mode="outlined"
                    keyboardType="numeric"
                    maxLength={4}
                    style={styles.aulaInput}
                    textColor="#0F172A"
                    outlineColor={aulaError ? '#B91C1C' : '#E2E8F0'}
                    activeOutlineColor={aulaError ? '#B91C1C' : '#C2410C'}
                    error={aulaError}
                  />
                  {aulaError && (
                    <Text style={styles.aulaErrorText}>
                      El aula es obligatoria para postulantes Reserva
                    </Text>
                  )}
                </View>
              )}

              {/* ── Acciones ─────────────────────────────────────────────── */}
              {status === 'none' ? (
                <TouchableOpacity
                  style={[styles.btnIngreso, { opacity: loading ? 0.7 : 1 }]}
                  onPress={handleIngreso}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="login" size={22} color="#fff" />
                      <Text style={styles.btnIngresoText}>MARCAR INGRESO</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={styles.completedBox}>
                  <MaterialCommunityIcons name="check-circle" size={26} color="#15803D" />
                  <Text style={styles.completedTitle}>Ingreso ya registrado por hoy</Text>
                  <Text style={styles.completedSub}>Se habilitara nuevamente manana</Text>
                </View>
              )}

              <TouchableOpacity style={styles.btnCerrar} onPress={onClose}>
                <Text style={styles.btnCerrarText}>CERRAR</Text>
              </TouchableOpacity>

            </ScrollView>
          </Surface>
        </Animated.View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  cardWrap: {
    width: '100%',
  },
  card: {
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    maxHeight: '92%',
  },
  cardContent: {
    padding: 22,
    alignItems: 'center',
  },

  // Avatar & status
  avatarRow: {
    alignItems: 'center',
    marginBottom: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },

  // Nombre / Puesto
  nombre: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 2,
  },
  puesto: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },

  // Tipo Badge
  tipoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14,
  },
  tipoText: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },

  // Sedes grid
  sedeGrid: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
    marginBottom: 8,
  },
  infoBlock: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 52,
  },
  infoBlockLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.6,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  infoBlockValue: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },

  // Área / turno
  areaText: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  turnoRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  turnoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  turnoChipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },

  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 14,
  },

  // Attendance
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 6,
    width: '100%',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    marginBottom: 4,
  },
  attendanceText: {
    color: '#15803D',
    fontWeight: 'bold',
    fontSize: 13,
  },

  // Aula Reserva
  aulaContainer: {
    width: '100%',
    marginBottom: 4,
    marginTop: 2,
  },
  aulaAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  aulaAlertText: {
    color: '#C2410C',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  aulaInput: {
    backgroundColor: '#F9FAFB',
    height: 46,
    marginBottom: 2,
  },
  aulaErrorText: {
    color: '#B91C1C',
    fontSize: 11,
    marginBottom: 6,
  },

  // Botones
  btnIngreso: {
    width: '100%',
    height: 52,
    backgroundColor: '#15803D',
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    marginBottom: 2,
  },
  btnIngresoText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  completedBox: {
    width: '100%',
    padding: 16,
    backgroundColor: '#F0FDF4',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  completedTitle: {
    color: '#15803D',
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
  },
  completedSub: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
  },
  btnCerrar: {
    marginTop: 14,
    paddingVertical: 10,
    alignItems: 'center',
    width: '100%',
  },
  btnCerrarText: {
    color: '#64748B',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});

export default AttendanceModal;
