import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, StyleSheet, Text, TouchableOpacity,
  ScrollView, RefreshControl, Dimensions, Alert, Animated, StatusBar, Image,
} from 'react-native';
import { Surface, ActivityIndicator, IconButton, Portal, Modal, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { COLORS } from '../theme/colors';
import { API_URL } from '../config';

const { width } = Dimensions.get('window');
const COL = (width - 52) / 2;

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ value, label, color, icon, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handleIn = () => Animated.spring(scaleAnim, { toValue: 0.94, useNativeDriver: true, speed: 50 }).start();
  const handleOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50 }).start();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], flex: 1 }}>
      <TouchableOpacity onPress={onPress} onPressIn={handleIn} onPressOut={handleOut} activeOpacity={0.9}>
        <View style={[styles.statCard, { borderTopColor: color }]}>
          <View style={[styles.statIconWrap, { backgroundColor: color + '18' }]}>
            <MaterialCommunityIcons name={icon} size={28} color={color} />
          </View>
          <Text style={[styles.statValue, { color }]}>{value ?? 0}</Text>
          <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ── Menu button ───────────────────────────────────────────────────────────────
const MenuBtn = ({ title, icon, themeColor, onPress, fullWidth = false, solid = false }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handleIn = () => Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  const handleOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50 }).start();

  if (solid) {
    return (
      <Animated.View style={[
        { transform: [{ scale: scaleAnim }] },
        styles.marcacionWrapper
      ]}>
        <TouchableOpacity
          onPress={onPress}
          onPressIn={handleIn}
          onPressOut={handleOut}
          activeOpacity={0.9}
          style={styles.menuBtnMarcacion}
        >
          <View style={styles.menuInnerMarcacion}>
            <MaterialCommunityIcons name={icon} size={36} color="#FFFFFF" />
            <Text style={styles.menuTitleMarcacion}>{title.toUpperCase()}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[
      { transform: [{ scale: scaleAnim }] },
      fullWidth ? { width: '100%', marginBottom: 4 } : { width: COL },
    ]}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handleIn}
        onPressOut={handleOut}
        activeOpacity={0.9}
        style={[styles.menuBtnGrid, { borderColor: themeColor, width: '100%' }]}
      >
        <View style={styles.watermarkIconWrap}>
          <MaterialCommunityIcons name={icon} size={85} color={themeColor} />
        </View>
        <View style={styles.menuInnerGrid}>
          <MaterialCommunityIcons name={icon} size={36} color={themeColor} />
          <Text style={[styles.menuTitleGrid, { color: themeColor }]}>{title.toUpperCase()}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ═══════════════════════════════════════════════════════════════
//  HomeScreen
// ═══════════════════════════════════════════════════════════════
const HomeScreen = ({ navigation }) => {
  const [stats, setStats] = useState({ presentes: 0, faltas: 0, tardanzas: 0, temprano: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [isOnline, setIsOnline] = useState(true);

  const [debugVisible, setDebugVisible] = useState(false);
  const [debugData, setDebugData] = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => setIsOnline(!!state.isConnected));
    return () => unsubscribe();
  }, []);

  const animateIn = () => {
    fadeAnim.setValue(0);
    slideAnim.setValue(20);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, speed: 12, useNativeDriver: true }),
    ]).start();
  };

  const fetchStats = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const userData = await AsyncStorage.getItem('userData');
      if (userData) {
        const user = JSON.parse(userData);
        setUserName(user.nombre);
        setUserRole(user.rol);
      }

      const netState = await NetInfo.fetch();
      const online = !!netState.isConnected;
      setIsOnline(online);

      if (online) {
        try {
          const res = await fetch(`${API_URL}/api/attendance/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.status === 401 || res.status === 403) { handleLogout(); return; }
          if (res.ok) { setStats(await res.json()); animateIn(); return; }
        } catch { }
      }
      const localStats = await global.dbHelper.getStats();
      setStats(localStats);
      animateIn();
    } catch (e) {
      console.error('Error fetching stats:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['userToken', 'userData']);
    navigation.replace('Login');
  };

  useFocusEffect(useCallback(() => { fetchStats(); }, []));
  const onRefresh = () => { setRefreshing(true); fetchStats(); };

  const fetchDebugData = async () => {
    const d = await global.dbHelper.getDbDiagnostics();
    setDebugData(d);
  };

  const handleOpenDebug = async () => {
    await fetchDebugData();
    setDebugVisible(true);
  };

  const handleSyncQueue = async () => {
    if (!isOnline) { Alert.alert('Sin conexión', 'Se requiere internet para sincronizar.'); return; }
    Alert.alert('Sincronizando', 'Procesando cola local...');
    await global.dbHelper.syncQueue();
    await fetchDebugData();
    fetchStats();
  };

  const handleDownloadData = async () => {
    if (!isOnline) { Alert.alert('Sin conexión', 'Se requiere internet para descargar.'); return; }
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await fetch(`${API_URL}/api/attendance/sync-pull`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const d = await res.json();
        await global.dbHelper.clearAndPopulate(d.cargos, d.metas_cargos, d.tipo_postulante, d.parametros_asistencia, d.workers, d.asistencias);
        await fetchDebugData();
        fetchStats();
        Alert.alert('Completado', `Datos descargados: ${d.workers?.length ?? 0} postulantes`);
      } else {
        Alert.alert('Error', `Estado del servidor: ${res.status}`);
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  // ── Debug Modal ────────────────────────────────────────────
  const renderDebugModal = () => (
    <Portal>
      <Modal visible={debugVisible} onDismiss={() => setDebugVisible(false)} contentContainerStyle={styles.debugModal}>
        <View style={styles.debugHeader}>
          <MaterialCommunityIcons name="database-sync" size={28} color={COLORS.blue} />
          <Text style={styles.debugTitle}>DIAGNOSTICO & SINCRONIZACION</Text>
        </View>

        <View style={[styles.debugStatusPill, { backgroundColor: isOnline ? COLORS.successSoft : COLORS.dangerSoft, borderColor: isOnline ? COLORS.successBorder : COLORS.dangerBorder }]}>
          <MaterialCommunityIcons name={isOnline ? 'wifi-check' : 'wifi-off'} size={24} color={isOnline ? COLORS.success : COLORS.danger} />
          <Text style={[styles.debugStatusText, { color: isOnline ? COLORS.success : COLORS.danger }]}>
            {isOnline ? 'CONECTADO - MODO ONLINE' : 'SIN CONEXION - MODO OFFLINE'}
          </Text>
        </View>

        <Text style={styles.debugSubtitle}>SQLITE LOCAL</Text>
        <View style={styles.debugGrid}>
          {[
            { label: 'Postulantes', value: debugData?.principalCount, color: COLORS.blue },
            { label: 'Asistencias', value: debugData?.asistenciasCount, color: COLORS.success },
            { label: 'Cargos', value: debugData?.cargosCount, color: COLORS.purple },
            { label: 'Cola', value: debugData?.queue?.length ?? 0, color: debugData?.queue?.length > 0 ? COLORS.danger : COLORS.muted },
          ].map(s => (
            <View key={s.label} style={[styles.debugStat, { borderTopColor: s.color }]}>
              <Text style={[styles.debugStatNum, { color: s.color }]}>{s.value ?? '-'}</Text>
              <Text style={styles.debugStatLabel}>{s.label.toUpperCase()}</Text>
            </View>
          ))}
        </View>

        {(debugData?.queue?.length ?? 0) > 0 && (
          <>
            <Text style={styles.debugSubtitle}>COLA PENDIENTE</Text>
            <ScrollView style={{ maxHeight: 100 }} nestedScrollEnabled>
              {debugData.queue.map(item => {
                let p = {}; try { p = JSON.parse(item.payload); } catch { }
                return (
                  <View key={item.id} style={styles.queueRow}>
                    <MaterialCommunityIcons name="clock-alert-outline" size={16} color={COLORS.warning} />
                    <Text style={styles.queueType}>{item.action_type}</Text>
                    <Text style={styles.queueDetail}>{p.dni || p.nombre || `Tmp:${p.tempId}`}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}

        <View style={{ gap: 8, marginTop: 12 }}>
          <Button mode="contained" buttonColor={COLORS.blue} icon="sync" labelStyle={{ fontWeight: '800' }} onPress={handleSyncQueue} disabled={!isOnline}>
            PROCESAR COLA
          </Button>
          <Button mode="outlined" textColor={COLORS.blue} icon="cloud-download" labelStyle={{ fontWeight: '800' }} onPress={handleDownloadData} disabled={!isOnline}>
            DESCARGAR DATOS
          </Button>
          <Button mode="contained-tonal" buttonColor={COLORS.dangerSoft} textColor={COLORS.danger} icon="delete-sweep" labelStyle={{ fontWeight: '800' }}
            onPress={() => Alert.alert('¿LIMPIAR DB?', 'Se borrara toda la base de datos local.', [
              { text: 'CANCELAR', style: 'cancel' },
              { text: 'LIMPIAR', style: 'destructive', onPress: async () => { await global.dbHelper.clearAndPopulate([], [], [], [], [], []); await fetchDebugData(); fetchStats(); } }
            ])}>
            LIMPIAR DB LOCAL
          </Button>
          <Button textColor={COLORS.muted} labelStyle={{ fontWeight: '800' }} onPress={() => setDebugVisible(false)}>CERRAR</Button>
        </View>
      </Modal>
    </Portal>
  );

  // ── Render ────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.blue} />

      {/* ── Top header gradient ─────────────────────────────── */}
      <View
        style={[styles.topHeader, { backgroundColor: COLORS.blue }]}
      >
        <View style={styles.topHeaderInner}>
          <View>
            <Text style={styles.welcomeLabel}>BIENVENIDO DE NUEVO,</Text>
            <Text style={styles.userName} numberOfLines={1}>{(userName || 'Administrador').toUpperCase()}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: isOnline ? COLORS.successSoft : COLORS.dangerSoft }]}
              onPress={() => Alert.alert('Estado', isOnline ? 'Online - Conectado al servidor' : 'Offline - Modo SQLite local')}
            >
              <MaterialCommunityIcons
                name={isOnline ? 'wifi-check' : 'wifi-off'}
                size={24}
                color={isOnline ? COLORS.success : COLORS.danger}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn} onPress={handleOpenDebug}>
              <MaterialCommunityIcons name="database-sync-outline" size={24} color={COLORS.orange} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn} onPress={handleLogout}>
              <MaterialCommunityIcons name="logout-variant" size={24} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.blue} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Stats strip ──────────────────────────────────────── */}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Text style={styles.sectionLabel}>RESUMEN DE HOY</Text>
          {loading ? (
            <ActivityIndicator animating color={COLORS.blue} style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.statsRow}>
              <StatCard value={stats.presentes} label="Presentes" color={COLORS.success} icon="account-check" />
              <StatCard value={stats.faltas} label="Faltas" color={COLORS.danger} icon="account-remove" onPress={() => navigation.navigate('Absentees')} />
              <StatCard value={stats.tardanzas} label="Tardanzas" color={COLORS.warning} icon="account-clock" />
              <StatCard value={stats.temprano ?? 0} label="Temprano" color={COLORS.blue} icon="account-star" />
            </View>
          )}
        </Animated.View>

        {/* ── Menu ─────────────────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>MODULOS</Text>
        <View style={styles.menuGrid}>
          {/* Full-width MARCACION */}
          <MenuBtn
            title="MARCACION"
            icon="line-scan"
            themeColor={COLORS.blue}
            onPress={() => navigation.navigate('Scan')}
            solid
          />
          <MenuBtn
            title="PERSONAL"
            icon="account-group"
            themeColor={COLORS.purple}
            onPress={() => navigation.navigate('PersonalList')}
          />
          <MenuBtn
            title="EVALUACION"
            icon="chart-bar"
            themeColor={COLORS.orange}
            onPress={() => navigation.navigate('AttendanceControl')}
          />
          {(userRole?.toLowerCase() === 'admin' || userRole?.toLowerCase() === 'su') && (
            <MenuBtn
              title="CONFIG."
              icon="tune-vertical"
              themeColor={COLORS.magenta}
              onPress={() => navigation.navigate('Config')}
              fullWidth
            />
          )}
        </View>

        {/* Footer Watermark */}
        <View style={styles.footerContainer}>
          <Image 
            source={require('../../assets/icon.png')} 
            style={styles.footerLogo} 
            resizeMode="contain"
          />
          <Text style={styles.footerText}>PROYECTO ENLA - ASISTENCIA 2026</Text>
        </View>
      </ScrollView>

      {renderDebugModal()}
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════
//  Styles
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // ── Top header ─────────────────────────────────────────────
  topHeader: {
    paddingTop: 48, paddingBottom: 18,
    paddingHorizontal: 20,
  },
  topHeaderInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  welcomeLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '800' },
  userName: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', maxWidth: width * 0.55 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },

  // ── Scroll ─────────────────────────────────────────────────
  scroll: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    color: COLORS.inkMid, fontSize: 13, fontWeight: '900',
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: 12,
    paddingLeft: 4,
  },

  // ── Stats ──────────────────────────────────────────────────
  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12, borderTopWidth: 5,
    padding: 12, alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  statIconWrap: {
    width: 46, height: 46, borderRadius: 23,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 6,
  },
  statValue: { fontSize: 28, fontWeight: '900' },
  statLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '800', marginTop: 2, textAlign: 'center' },

  // ── Menu ───────────────────────────────────────────────────
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  marcacionWrapper: {
    width: '100%',
    marginVertical: 6,
  },
  menuBtnMarcacion: {
    width: '100%',
    height: 110,
    backgroundColor: COLORS.blue,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  menuInnerMarcacion: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  menuTitleMarcacion: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 1,
    marginTop: 8,
    textAlign: 'center',
  },
  menuBtnGrid: {
    width: COL,
    height: 130,
    borderRadius: 16,
    borderWidth: 2.5,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  menuInnerGrid: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
    zIndex: 2,
  },
  menuTitleGrid: {
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.6,
    textAlign: 'center',
    marginTop: 8,
  },
  watermarkIconWrap: {
    position: 'absolute',
    bottom: -22,
    right: -22,
    zIndex: 1,
    opacity: 0.08,
  },
  footerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    marginBottom: 20,
    gap: 8,
  },
  footerLogo: {
    width: 60,
    height: 60,
    opacity: 0.25,
    tintColor: '#94A3B8',
  },
  footerText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // ── Debug modal ────────────────────────────────────────────
  debugModal: {
    backgroundColor: COLORS.white,
    padding: 20, margin: 16,
    borderRadius: 16,
    borderTopWidth: 5, borderTopColor: COLORS.blue,
  },
  debugHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14,
  },
  debugTitle: { color: COLORS.ink, fontSize: 15, fontWeight: '900' },
  debugStatusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 8, borderWidth: 1.5, padding: 10, marginBottom: 14,
  },
  debugStatusText: { fontSize: 12, fontWeight: '800' },
  debugSubtitle: {
    color: COLORS.muted, fontSize: 10, fontWeight: '900',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
  },
  debugGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  debugStat: {
    flex: 1, backgroundColor: COLORS.surface,
    borderRadius: 8, padding: 10, alignItems: 'center',
    borderTopWidth: 3,
  },
  debugStatNum: { fontSize: 18, fontWeight: '900' },
  debugStatLabel: { color: COLORS.muted, fontSize: 9, marginTop: 2, textAlign: 'center', fontWeight: '800' },
  queueRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.warningSoft,
    borderRadius: 6, padding: 8, marginBottom: 4,
    borderWidth: 1.5, borderColor: COLORS.warningBorder,
  },
  queueType: { color: COLORS.warning, fontSize: 10, fontWeight: '900' },
  queueDetail: { color: COLORS.inkLight, fontSize: 10, flex: 1, fontWeight: '700' },
});

export default HomeScreen;
