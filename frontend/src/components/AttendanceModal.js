import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Animated } from 'react-native';
import { Modal, Portal, Surface, Avatar, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const AttendanceModal = ({ visible, data, onClose, onRegisterSuccess }) => {
  const [loading, setLoading] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible]);

  if (!data) return null;

  const { worker, status, attendance } = data;

  const handleAction = async (actionType) => {
    setLoading(true);
    try {
      const response = await fetch('http://192.168.18.9:3001/api/attendance/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          dni: worker.dni,
          tipo: actionType
        }),
      });

      if (response.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
        if (onRegisterSuccess) onRegisterSuccess();
      } else {
        const err = await response.json();
        alert(err.message || 'Error al registrar');
      }
    } catch (e) {
      alert('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = () => {
    if (status === 'completed') return '#15803D';
    if (status === 'entered') return '#334155';
    return '#B91C1C';
  };

  const getStatusLabel = () => {
    if (status === 'completed') return 'COMPLETADO';
    if (status === 'entered') return 'EN PLANTA';
    return 'FUERA';
  };

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onClose} contentContainerStyle={styles.container}>
        <Animated.View style={{ opacity: fadeAnim, width: '100%', alignItems: 'center' }}>
          <Surface style={styles.card} elevation={3}>
            <View style={styles.cardContent}>
              <View style={styles.header}>
                <Avatar.Icon 
                  size={80} 
                  icon="account" 
                  style={{ backgroundColor: getStatusColor() }} 
                />
                <View style={[styles.statusBadge, { borderColor: getStatusColor() }]}>
                   <Text style={[styles.statusText, { color: getStatusColor() }]}>
                     {getStatusLabel()}
                   </Text>
                </View>
              </View>

              <Text style={styles.name}>{worker.nombre}</Text>
              <Text style={styles.role}>{worker.puesto}</Text>
              <Text style={styles.area}>{worker.area}</Text>

              <View style={styles.divider} />

              {attendance && attendance.hora_entrada && (
                <View style={styles.infoRow}>
                   <MaterialCommunityIcons name="login" size={20} color="#15803D" />
                   <Text style={styles.infoText}>
                     Entrada: {new Date(attendance.hora_entrada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </Text>
                </View>
              )}

              {attendance && attendance.hora_salida && (
                <View style={styles.infoRow}>
                   <MaterialCommunityIcons name="logout" size={20} color="#B91C1C" />
                   <Text style={styles.infoText}>
                     Salida: {new Date(attendance.hora_salida).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </Text>
                </View>
              )}

              <View style={styles.actions}>
                {status === 'none' && (
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.entryButton]}
                    onPress={() => handleAction('entrada')}
                    disabled={loading}
                  >
                    <View style={[styles.btnContainer, { backgroundColor: '#15803D' }]}>
                      {loading ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <MaterialCommunityIcons name="login" size={24} color="white" />
                          <Text style={styles.btnText}>MARCAR ENTRADA</Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                )}

                {status === 'entered' && (
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.exitButton]}
                    onPress={() => handleAction('salida')}
                    disabled={loading}
                  >
                    <View style={[styles.btnContainer, { backgroundColor: '#B91C1C' }]}>
                      {loading ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <MaterialCommunityIcons name="logout" size={24} color="white" />
                          <Text style={styles.btnText}>MARCAR SALIDA</Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                )}

                {status === 'completed' && (
                  <View style={styles.completedAlert}>
                    <MaterialCommunityIcons name="check-circle" size={24} color="#15803D" style={{ marginBottom: 5 }} />
                    <Text style={styles.completedText}>Asistencia y Salida registradas por hoy</Text>
                  </View>
                )}
                
                <TouchableOpacity style={styles.cancelButton} onClose={onClose} onPress={onClose}>
                  <Text style={styles.cancelText}>CERRAR</Text>
                </TouchableOpacity>
              </View>
            </View>
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
  },
  cardContent: {
    padding: 25,
    alignItems: 'center',
  },
  header: {
    marginBottom: 15,
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
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 10,
  },
  role: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 5,
  },
  area: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 6,
    width: '100%',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  infoText: {
    color: '#0F172A',
    marginLeft: 10,
    fontWeight: '600',
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
    backgroundColor: '#F0FDF4', // HSL(142, 30%, 96%)
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
