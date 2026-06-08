import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, RefreshControl, Dimensions, Alert } from 'react-native';
import { Surface, ActivityIndicator, IconButton, Portal, Modal, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 60) / 2;

const HomeScreen = ({ navigation }) => {
  const [stats, setStats] = useState({ presentes: 0, faltas: 0, tardanzas: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');
  const [isOnline, setIsOnline] = useState(true);

  // Debug state
  const [debugVisible, setDebugVisible] = useState(false);
  const [debugData, setDebugData] = useState(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  const fetchStats = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const userData = await AsyncStorage.getItem('userData');
      if (userData) setUserName(JSON.parse(userData).nombre);

      const netState = await NetInfo.fetch();
      const online = !!netState.isConnected;
      setIsOnline(online);

      if (online) {
        try {
          const response = await fetch('https://backend-6oio.onrender.com/api/attendance/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (response.status === 401 || response.status === 403) {
            handleLogout();
            return;
          }

          if (response.ok) {
            const data = await response.json();
            setStats(data);
            return;
          }
        } catch (fetchErr) {
          console.log('Error fetching stats online, falling back to local SQLite:', fetchErr.message);
        }
      }

      const localStats = await global.dbHelper.getStats();
      setStats(localStats);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['userToken', 'userData']);
    navigation.replace('Login');
  };

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const fetchDebugData = async () => {
    const diagnostics = await global.dbHelper.getDbDiagnostics();
    setDebugData(diagnostics);
  };

  const handleOpenDebug = async () => {
    await fetchDebugData();
    setDebugVisible(true);
  };

  const renderDebugModal = () => {
    return (
      <Portal>
        <Modal
          visible={debugVisible}
          onDismiss={() => setDebugVisible(false)}
          contentContainerStyle={styles.debugModal}
        >
          <Text style={styles.debugTitle}>Panel de Diagnóstico & Sincronización</Text>
          
          <Surface style={styles.debugStatusCard} elevation={0}>
            <View style={styles.debugRow}>
              <MaterialCommunityIcons 
                name={isOnline ? "wifi" : "wifi-off"} 
                size={20} 
                color={isOnline ? "#15803D" : "#B91C1C"} 
              />
              <Text style={[styles.debugStatusText, { color: isOnline ? "#15803D" : "#B91C1C" }]}>
                {isOnline ? 'CONECTADO (ONLINE)' : 'SIN CONEXIÓN (OFFLINE)'}
              </Text>
            </View>
          </Surface>

          <Text style={styles.debugSubtitle}>Estadísticas SQLite Local:</Text>
          <View style={styles.statsGrid}>
            <View style={styles.debugStatCol}>
              <Text style={styles.debugStatNum}>{debugData?.principalCount ?? '-'}</Text>
              <Text style={styles.debugStatLabel}>Postulantes</Text>
            </View>
            <View style={styles.debugStatCol}>
              <Text style={styles.debugStatNum}>{debugData?.asistenciasCount ?? '-'}</Text>
              <Text style={styles.debugStatLabel}>Asistencias Hoy</Text>
            </View>
            <View style={styles.debugStatCol}>
              <Text style={styles.debugStatNum}>{debugData?.cargosCount ?? '-'}</Text>
              <Text style={styles.debugStatLabel}>Cargos</Text>
            </View>
            <View style={styles.debugStatCol}>
              <Text style={[styles.debugStatNum, (debugData?.queue?.length > 0) && { color: '#B91C1B' }]}>
                {debugData?.queue?.length ?? 0}
              </Text>
              <Text style={styles.debugStatLabel}>Cola Pendiente</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, paddingHorizontal: 5 }}>
            <Text style={{ fontSize: 10, color: '#64748B', fontWeight: 'bold' }}>METAS: {debugData?.metasCount ?? 0}</Text>
            <Text style={{ fontSize: 10, color: '#64748B', fontWeight: 'bold' }}>TIPOS: {debugData?.tiposCount ?? 0}</Text>
            <Text style={{ fontSize: 10, color: '#64748B', fontWeight: 'bold' }}>PARAMS: {debugData?.paramsCount ?? 0}</Text>
          </View>

          {debugData?.queue?.length > 0 && (
            <>
              <Text style={styles.debugSubtitle}>Cola de Operaciones:</Text>
              <ScrollView style={{ maxHeight: 110, marginBottom: 15 }} nestedScrollEnabled>
                {debugData.queue.map((item) => {
                  let payload = {};
                  try { payload = JSON.parse(item.payload); } catch(e){}
                  const detail = payload.dni || payload.nombre || `ID Temp: ${payload.tempId}`;
                  return (
                    <View key={item.id} style={styles.queueItem}>
                      <Text style={styles.queueType}>{item.action_type}</Text>
                      <Text style={styles.queueDetail}>{detail}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </>
          )}

          <View style={styles.debugActions}>
            <Button 
              mode="contained" 
              buttonColor="#334155" 
              onPress={async () => {
                if (!isOnline) {
                  Alert.alert('Aviso', 'Se requiere conexión a internet para sincronizar.');
                  return;
                }
                Alert.alert('Sincronizando', 'Procesando la cola local...');
                await global.dbHelper.syncQueue();
                await fetchDebugData();
                fetchStats();
              }}
              style={styles.debugBtn}
              disabled={!isOnline}
            >
              Procesar Cola
            </Button>

            <Button 
              mode="outlined" 
              textColor="#334155"
              onPress={async () => {
                if (!isOnline) {
                  Alert.alert('Aviso', 'Se requiere conexión a internet para descargar datos.');
                  return;
                }
                Alert.alert('Descargando', 'Descargando datos del servidor...');
                try {
                  const token = await AsyncStorage.getItem('userToken');
                  const res = await fetch('https://backend-6oio.onrender.com/api/attendance/sync-pull', {
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  if (res.ok) {
                    const syncData = await res.json();
                    await global.dbHelper.clearAndPopulate(
                      syncData.cargos,
                      syncData.metas_cargos,
                      syncData.tipo_postulante,
                      syncData.parametros_asistencia,
                      syncData.workers,
                      syncData.asistencias
                    );
                    await fetchDebugData();
                    fetchStats();
                    Alert.alert('Exito', 'Base de datos SQLite poblada con éxito.');
                  } else {
                    Alert.alert('Error', `Server status: ${res.status}`);
                  }
                } catch (err) {
                  Alert.alert('Error', `Error de conexión: ${err.message}`);
                }
              }}
              style={styles.debugBtn}
              disabled={!isOnline}
            >
              Descargar Datos
            </Button>

            <Button 
              mode="contained-tonal" 
              buttonColor="#FEF2F2"
              textColor="#991B1B"
              onPress={() => {
                Alert.alert('Confirmación', '¿Estás seguro de que deseas limpiar la base de datos local SQLite?', [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Limpiar',
                    style: 'destructive',
                    onPress: async () => {
                      await global.dbHelper.clearAndPopulate([], [], [], [], [], []);
                      await fetchDebugData();
                      fetchStats();
                    }
                  }
                ]);
              }}
              style={styles.debugBtn}
            >
              Limpiar DB
            </Button>
          </View>

          <Button textColor="#64748B" onPress={() => setDebugVisible(false)} style={{ marginTop: 10 }}>
            Cerrar
          </Button>
        </Modal>
      </Portal>
    );
  };

  const MenuButton = ({ title, icon, color, onPress, fullWidth = false }) => (
    <TouchableOpacity 
      style={[styles.menuItem, fullWidth && styles.fullWidthItem]} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Surface style={styles.menuSurface} elevation={1}>
        <View style={[styles.iconContainer, { backgroundColor: color }]}>
          <MaterialCommunityIcons name={icon} size={28} color="white" />
        </View>
        <Text style={styles.menuTitle}>{title}</Text>
      </Surface>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#334155" />
        }
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.welcomeText}>Bienvenido de nuevo,</Text>
            <Text style={styles.userName} numberOfLines={1}>{userName || 'Administrador'}</Text>
          </View>
          <View style={styles.headerActions}>
            <IconButton 
              icon={isOnline ? "wifi" : "wifi-off"} 
              iconColor={isOnline ? "#15803D" : "#B91C1C"} 
              size={22} 
              onPress={() => Alert.alert('Estado de Red', isOnline ? 'El dispositivo está en línea (Conectado al servidor Render)' : 'El dispositivo está fuera de línea (Modo SQLite local)')}
              style={styles.actionButton}
            />
            <IconButton 
              icon="clipboard-list-outline" 
              iconColor="#334155" 
              size={22} 
              onPress={handleOpenDebug}
              style={styles.actionButton}
            />
            <IconButton 
              icon="logout-variant" 
              iconColor="#B91C1C" 
              size={22} 
              onPress={handleLogout} 
              style={styles.actionButton}
            />
          </View>
        </View>

        {/* Stats Card */}
        <Surface style={styles.statsCard} elevation={1}>
          <View style={styles.statsContent}>
            <Text style={styles.statsTitle}>Resumen de Hoy</Text>
            {loading ? (
              <ActivityIndicator animating={true} color="#334155" />
            ) : (
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#15803D' }]}>{stats.presentes}</Text>
                  <Text style={styles.statLabel}>Presentes</Text>
                </View>
                <View style={styles.statDivider} />
                <TouchableOpacity 
                  style={styles.statItem} 
                  onPress={() => navigation.navigate('Absentees')}
                >
                  <Text style={[styles.statValue, { color: '#B91C1C' }]}>{stats.faltas}</Text>
                  <Text style={styles.statLabel}>Faltas</Text>
                </TouchableOpacity>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#F1C40F' }]}>{stats.tardanzas}</Text>
                  <Text style={styles.statLabel}>Tardanzas</Text>
                </View>
              </View>
            )}
          </View>
        </Surface>

        <Text style={styles.sectionTitle}>Menú Principal</Text>

        <View style={styles.menuGrid}>
          <MenuButton 
            title="MARCACIÓN" 
            icon="barcode-scan" 
            color="#334155" 
            onPress={() => navigation.navigate('Scan')}
            fullWidth
          />
          <MenuButton 
            title="PERSONAL" 
            icon="account-group" 
            color="#334155" 
            onPress={() => navigation.navigate('PersonalList')}
          />
          <MenuButton 
            title="CONFIGURACIÓN" 
            icon="cog-outline" 
            color="#334155" 
            onPress={() => navigation.navigate('Config')}
          />
          <MenuButton 
            title="MANUAL" 
            icon="keyboard-outline" 
            color="#334155" 
            onPress={() => navigation.navigate('Manual')}
          />
          <MenuButton 
            title="CONTROL" 
            icon="chart-bar" 
            color="#334155" 
            onPress={() => navigation.navigate('AttendanceControl')}
          />
        </View>
      </ScrollView>
      {renderDebugModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  scrollContent: { padding: 20 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
    marginTop: 10,
  },
  welcomeText: {
    color: '#64748B',
    fontSize: 12,
  },
  userName: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionButton: {
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
    marginHorizontal: 2,
  },
  statsCard: {
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    marginBottom: 35,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  statsContent: {
    padding: 20,
  },
  statsTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E2E8F0',
  },
  statValue: {
    fontSize: 26,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    paddingLeft: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#334155',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 15,
  },
  menuItem: {
    width: COLUMN_WIDTH,
    height: 130,
    borderRadius: 6,
    overflow: 'hidden',
  },
  fullWidthItem: {
    width: '100%',
    height: 110,
    marginBottom: 5,
  },
  menuSurface: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 15,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  menuTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  // Debug modal styles
  debugModal: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    margin: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  debugTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
  },
  debugStatusCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 15,
  },
  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  debugStatusText: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  debugSubtitle: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    gap: 6,
  },
  debugStatCol: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
  },
  debugStatNum: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: 'bold',
  },
  debugStatLabel: {
    color: '#64748B',
    fontSize: 8,
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '500',
  },
  queueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    padding: 8,
    marginBottom: 4,
  },
  queueType: {
    color: '#475569',
    fontSize: 10,
    fontWeight: 'bold',
  },
  queueDetail: {
    color: '#0F172A',
    fontSize: 10,
  },
  debugActions: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 5,
  },
  debugBtn: {
    borderRadius: 6,
  }
});

export default HomeScreen;
