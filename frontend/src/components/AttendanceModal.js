import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Animated, ScrollView } from 'react-native';
import { Modal, Portal, Surface, Avatar, ActivityIndicator, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const AttendanceModal = ({ visible, data, onClose, onRegisterSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [aulaReserva, setAulaReserva] = useState('');
  const [aulaError, setAulaError] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setAulaReserva('');
      setAulaError(false);
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible]);

  if (!data) return null;

  const { worker, status, attendance } = data;

  const isReserva = worker.tipo_postulante === 'Reserva';
  const turnoDisplay = worker.turno === 'DIA' ? 'DIURNO' : (worker.turno || '');

  const handleIngreso = async () => {
    // Validacion de aula para Reserva
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
          const body = { dni: worker.dni };
          // Si es reserva, incluir el aula
          if (isReserva && aulaReserva) body.aula = parseInt(aulaReserva);

          const response = await fetch('https://backend-6oio.onrender.com/api/attendance/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

          const result = await response.json();

          if (response.ok) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            
            const db = global.dbHelper.db;
            if (db && result.record) {
              const rec = result.record;
              try {
                await db.runAsync(
                  'INSERT OR REPLACE INTO asistencias (id, principal_id, estado, fecha_hora, observaciones) VALUES (?, ?, ?, ?, ?)',
                  [rec.id, rec.principal_id, rec.estado, rec.fecha_hora, rec.observaciones]
                );
                // Actualizar aula en local si es Reserva
                if (isReserva && aulaReserva) {
                  await db.runAsync('UPDATE principal SET aula = ? WHERE doc_identidad = ?', [parseInt(aulaReserva), worker.dni]);
                }
              } catch (dbErr) {
                console.error('Failed to update local db after online attendance marking:', dbErr);
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
          console.log('Error registering attendance online, falling back to local SQLite:', fetchErr.message);
        }
      }

      const result = await global.dbHelper.registerAttendanceOffline(worker.dni, null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      if (onRegisterSuccess) onRegisterSuccess(result);
    } catch (error) {
      alert(error.message || 'Error al registrar ingreso');
    } finally {
      setLoading(false);
    }
  };

  const tipoColor = isReserva ? '#C2410C' : '#15803D';
  const tipoBg = isReserva ? '#FFF7ED' : '#F0FDF4';
  const tipoBorder = isReserva ? '#FED7AA' : '#DCFCE7';

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onClose} contentContainerStyle={styles.container}>
        <Animated.View style={{ opacity: fadeAnim, width: '100%', alignItems: 'center' }}>
          <Surface style={styles.card} elevation={3}>
            <ScrollView contentContainerStyle={styles.cardContent} showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <Avatar.Icon 
                  size={76} 
                  icon="account" 
                  style={{ backgroundColor: status === 'entered' ? '#15803D' : '#334155' }} 
                />
                <View style={[styles.statusBadge, { borderColor: status === 'entered' ? '#15803D' : '#B91C1C' }]}>
                   <Text style={[styles.statusText, { color: status === 'entered' ? '#15803D' : '#B91C1C' }]}>
                     {status === 'entered' ? 'INGRESO REGISTRADO' : 'SIN MARCAR'}
                   </Text>
                </View>
              </View>

              <Text style={styles.name}>{worker.nombre}</Text>
              <Text style={styles.role}>{worker.puesto}</Text>

              {/* Tipo Postulante Badge */}
              <View style={[styles.tipoBadge, { backgroundColor: tipoBg, borderColor: tipoBorder }]}>
                <MaterialCommunityIcons 
                  name={isReserva ? 'account-clock-outline' : 'account-check-outline'} 
                  size={14} 
                  color={tipoColor} 
                />
                <Text style={[styles.tipoText, { color: tipoColor }]}>
                  {worker.tipo_postulante ? worker.tipo_postulante.toUpperCase() : ''}
                </Text>
              </View>

              {/* Info rows */}
              <View style={styles.infoGrid}>
                <View style={styles.infoGridItem}>
                  <Text style={styles.infoGridLabel}>SEDE REGIONAL</Text>
                  <Text style={styles.infoGridValue} numberOfLines={1}>{worker.sede_reg || '-'}</Text>
                </View>
                <View style={styles.infoGridItem}>
                  <Text style={styles.infoGridLabel}>SEDE JURISDICCIONAL</Text>
                  <Text style={styles.infoGridValue} numberOfLines={1}>{worker.sede_juris || '-'}</Text>
                </View>
              </View>

              <Text style={styles.area}>{worker.area}</Text>

              {worker.turno && (
                <View style={styles.turnoRow}>
                  <View style={styles.turnoChip}>
                    <MaterialCommunityIcons 
                      name={worker.turno === 'DIA' ? 'weather-sunny' : 'weather-night'} 
                      size={16} 
                      color="#334155" 
                    />
                    <Text style={styles.turnoText}>Turno {turnoDisplay}</Text>
                  </View>
                  <View style={styles.turnoChip}>
                    <MaterialCommunityIcons name="clock-outline" size={16} color="#334155" />
                    <Text style={styles.turnoText}>Ingreso: {worker.hora_ingreso?.substring(0, 5)}</Text>
                  </View>
                </View>
              )}

              <View style={styles.divider} />

              {attendance && (
                <View style={styles.infoRow}>
                   <MaterialCommunityIcons name="check-circle" size={20} color="#15803D" />
                   <Text style={styles.infoText}>
                     Ingreso: {new Date(attendance.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                     {' - '}
                     {attendance.estado === 'P' ? 'PUNTUAL' : 'TARDE'}
                   </Text>
                </View>
              )}

              {/* Aula field for Reserva when not yet marked */}
              {isReserva && status === 'none' && (
                <View style={styles.aulaContainer}>
                  <View style={[styles.aulaAlert, { borderColor: aulaError ? '#B91C1C' : '#FED7AA' }]}>
                    <MaterialCommunityIcons name="information-outline" size={16} color="#C2410C" />
                    <Text style={styles.aulaAlertText}>
                      Postulante RESERVA: Asignar aula antes de marcar ingreso
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
                    <Text style={styles.aulaErrorText}>El aula es obligatoria para postulantes Reserva</Text>
                  )}
                </View>
              )}

              <View style={styles.actions}>
                {status === 'none' ? (
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={handleIngreso}
                    disabled={loading}
                  >
                    <View style={[styles.btnContainer, { backgroundColor: '#15803D' }]}>
                      {loading ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <MaterialCommunityIcons name="login" size={24} color="white" />
                          <Text style={styles.btnText}>MARCAR INGRESO</Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.completedAlert}>
                    <MaterialCommunityIcons name="check-circle" size={24} color="#15803D" style={{ marginBottom: 5 }} />
                    <Text style={styles.completedText}>Ingreso ya registrado por hoy</Text>
                    <Text style={styles.completedSub}>Se habilitara nuevamente manana</Text>
                  </View>
                )}
                
                <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                  <Text style={styles.cancelText}>CERRAR</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Surface>
        </Animated.View>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  card: {
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    width: '95%',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    maxHeight: '90%',
  },
  cardContent: {
    padding: 22,
    alignItems: 'center',
  },
  header: {
    marginBottom: 14,
    alignItems: 'center',
  },
  statusBadge: {
    position: 'absolute',
    bottom: -5,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  name: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 10,
  },
  role: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 8,
  },
  tipoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
  },
  tipoText: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  infoGrid: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
    marginBottom: 8,
  },
  infoGridItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoGridLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoGridValue: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '600',
  },
  area: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 2,
    textAlign: 'center',
  },
  turnoRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  turnoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  turnoText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 6,
    width: '100%',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  infoText: {
    color: '#0F172A',
    marginLeft: 10,
    fontWeight: '600',
  },
  aulaContainer: {
    width: '100%',
    marginBottom: 4,
  },
  aulaAlert: {
    flexDirection: 'row',
    alignItems: 'center',
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
  },
  aulaInput: {
    backgroundColor: '#F9FAFB',
    height: 44,
    marginBottom: 2,
  },
  aulaErrorText: {
    color: '#B91C1C',
    fontSize: 11,
    marginBottom: 8,
    marginTop: 2,
  },
  actions: {
    width: '100%',
    gap: 12,
    marginTop: 10,
  },
  actionButton: {
    width: '100%',
    height: 54,
    borderRadius: 6,
    overflow: 'hidden',
  },
  btnContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  completedAlert: {
    width: '100%',
    padding: 15,
    backgroundColor: '#F0FDF4',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedText: {
    color: '#15803D',
    fontWeight: 'bold',
    fontSize: 14,
    textAlign: 'center',
  },
  completedSub: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    color: '#64748B',
    fontWeight: 'bold',
    fontSize: 14,
  }
});

export default AttendanceModal;
