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
  const hasEntered = status === 'entered';

  const handleAction = async (actionType) => {
    setLoading(true);
    try {
      const response = await fetch('http://192.168.18.9:3001/api/attendance/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          dni: worker.dni,
          tipo: actionType // Backend could use this to force entry or exit if needed
        }),
      });

      if (response.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onClose();
        // Trigger a success message in the parent or similar
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

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onClose} contentContainerStyle={styles.container}>
        <Animated.View style={{ opacity: fadeAnim, width: '100%', alignItems: 'center' }}>
          <Surface style={styles.card} elevation={5}>
            <LinearGradient
              colors={['#1e1e1e', '#121212']}
              style={styles.gradient}
            >
              <View style={styles.header}>
                <Avatar.Icon 
                  size={80} 
                  icon="account" 
                  style={{ backgroundColor: hasEntered ? '#34ace0' : '#33d9b2' }} 
                />
                <View style={styles.statusBadge}>
                   <Text style={styles.statusText}>
                     {hasEntered ? 'EN PLANTA' : 'FUERA'}
                   </Text>
                </View>
              </View>

              <Text style={styles.name}>{worker.nombre}</Text>
              <Text style={styles.role}>{worker.puesto}</Text>
              <Text style={styles.area}>{worker.area}</Text>

              <View style={styles.divider} />

              {hasEntered && attendance && (
                <View style={styles.infoRow}>
                   <MaterialCommunityIcons name="login" size={20} color="#33d9b2" />
                   <Text style={styles.infoText}>Entrada: {attendance.hora_entrada}</Text>
                </View>
              )}

              <View style={styles.actions}>
                {!hasEntered ? (
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.entryButton]}
                    onPress={() => handleAction('entrada')}
                    disabled={loading}
                  >
                    <LinearGradient colors={['#33d9b2', '#218c74']} style={styles.btnGradient}>
                      {loading ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <MaterialCommunityIcons name="login" size={24} color="white" />
                          <Text style={styles.btnText}>MARCAR ENTRADA</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.exitButton]}
                    onPress={() => handleAction('salida')}
                    disabled={loading}
                  >
                    <LinearGradient colors={['#ff5252', '#b33939']} style={styles.btnGradient}>
                      {loading ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <MaterialCommunityIcons name="logout" size={24} color="white" />
                          <Text style={styles.btnText}>MARCAR SALIDA</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                  <Text style={styles.cancelText}>CANCELAR</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
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
    borderRadius: 30,
    overflow: 'hidden',
    width: '95%',
    borderWidth: 1,
    borderColor: '#333',
  },
  gradient: {
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
    backgroundColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#444',
  },
  statusText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  name: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 10,
  },
  role: {
    color: '#33d9b2',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 5,
  },
  area: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#333',
    marginVertical: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 10,
    borderRadius: 12,
    width: '100%',
    justifyContent: 'center',
  },
  infoText: {
    color: '#fff',
    marginLeft: 10,
    fontWeight: '500',
  },
  actions: {
    width: '100%',
    gap: 12,
  },
  actionButton: {
    width: '100%',
    height: 60,
    borderRadius: 18,
    overflow: 'hidden',
  },
  btnGradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  cancelButton: {
    paddingVertical: 15,
    alignItems: 'center',
  },
  cancelText: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 14,
  }
});

export default AttendanceModal;
