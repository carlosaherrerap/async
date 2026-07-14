import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, TextInput, Alert, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ActivityIndicator, Surface, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AttendanceModal from '../components/AttendanceModal';
import { COLORS } from '../theme/colors';
import { API_URL } from '../config';

const { width, height } = Dimensions.get('window');
const frameWidth = width * 0.85;
const frameHeight = (width * 0.85) / 1.58;
const frameTop = height * 0.28;
const frameLeft = width * 0.075;

const BASE_URL = API_URL;

// Extraer DNI de 8 dígitos a partir del texto sin procesar del código de barras PDF417 (formato DNI peruano)
const extractDniFromBarcode = (rawText) => {
  if (!rawText) return null;
  console.log('[SCAN] Barcode raw text length:', rawText.length, '| preview:', JSON.stringify(rawText.substring(0, 40)));

  // Formato PDF417 del DNI peruano: los primeros 2 caracteres son códigos de cabecera, los siguientes 8 son dígitos del DNI
  if (rawText.length >= 10) {
    const candidate = rawText.substring(2, 10);
    if (/^\d{8}$/.test(candidate)) {
      console.log('[SCAN] DNI extraído (posición 2-10):', candidate);
      return candidate;
    }
  }

  // Alternativa: encontrar cualquier secuencia de 8 dígitos
  const match = rawText.match(/\b\d{8}\b/) || rawText.match(/\d{8}/);
  if (match) {
    console.log('[SCAN] DNI extraído (fallback regex):', match[0]);
    return match[0];
  }

  console.log('[SCAN] No se pudo extraer DNI del texto del código de barras');
  return null;
};

const ScanScreen = ({ route, navigation }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workerData, setWorkerData] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [manualDni, setManualDni] = useState('');

  const [scanStatus, setScanStatus] = useState('searching');
  const [statusMessage, setStatusMessage] = useState('ESCANEO DNI EN TIEMPO REAL');
  const [isOnline, setIsOnline] = useState(true);
  const [userRole, setUserRole] = useState('');

  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const online = global.dbHelper.isOnline();
    setIsOnline(online);
    console.log('[SCAN] Modo:', online ? 'ONLINE' : 'OFFLINE');
  }, []);

  useEffect(() => {
    const loadUserRole = async () => {
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const userData = await AsyncStorage.getItem('userData');
        if (userData) {
          setUserRole(JSON.parse(userData).rol);
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadUserRole();
  }, []);

  useEffect(() => {
    if (route.params?.dni) {
      const targetDni = route.params.dni;
      navigation.setParams({ dni: undefined });
      handleDniReceived(targetDni);
    }
  }, [route.params?.dni]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ─── Callback del escáner nativo de código de barras ───────────────────────────────────
  const handleBarCodeScanned = ({ type, data }) => {
    if (scanned || loading || showModal) return;

    console.log('[SCAN] Código detectado! Tipo:', type, '| Longitud:', data?.length);
    setScanned(true);
    setScanStatus('processing');
    setStatusMessage('Código detectado — procesando...');

    const dni = extractDniFromBarcode(data);

    if (!dni) {
      // Código detectado pero sin DNI válido — puede que sea un código distinto al PDF417 del DNI
      console.log('[SCAN] Código detectado pero sin DNI válido. Texto completo:', data);
      Alert.alert(
        'Código no reconocido',
        `Se detectó un código pero no contiene un DNI válido.\n\nContenido: ${data.substring(0, 50)}`,
        [{ text: 'Reintentar', onPress: resetScanner }]
      );
      return;
    }

    handleDniReceived(dni);
  };

  const resetScanner = () => {
    setScanned(false);
    setScanStatus('searching');
    setStatusMessage('ESCANEO DNI EN TIEMPO REAL');
  };

  // ─── Búsqueda de postulante (online → backend, offline → SQLite) ──────────────────
  const handleDniReceived = async (dni) => {
    if (loading || !dni) return;
    console.log('[SCAN] Buscando DNI:', dni);
    setLoading(true);

    const showNotFoundAlert = () => {
      Alert.alert(
        'REGISTRAR PERSONAL',
        '¿Quieres registrar un nuevo personal?',
        [
          {
            text: 'NO', style: 'cancel', onPress: () => {
              setLoading(false);
              resetScanner();
            }
          },
          { text: 'SI', onPress: () => navigation.navigate('RegisterWorker', { dni }) }
        ]
      );
    };

    try {
      if (isOnline) {
        console.log('[SCAN] Verificando en backend:', `${BASE_URL}/api/attendance/verify?dni=${dni}`);
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const token = await AsyncStorage.getItem('userToken');
          const response = await fetch(`${BASE_URL}/api/attendance/verify?dni=${dni}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await response.json();
          console.log('[SCAN] Respuesta backend verify:', response.status, JSON.stringify(data).substring(0, 100));

          if (response.ok) {
            setWorkerData(data);
            setShowModal(true);
            setScanStatus('success');
            setLoading(false);
            return;
          } else {
            setLoading(false);
            if (response.status === 400 || response.status === 403) {
              Alert.alert('ERROR', data.message || 'Este postulante no pertenece a la sede actual', [{ text: 'OK', onPress: resetScanner }]);
            } else {
              showNotFoundAlert();
            }
            return;
          }
        } catch (fetchErr) {
          console.log('[SCAN] Error online, fallback a SQLite:', fetchErr.message);
        }
      }

      // Alternativa fuera de línea (offline fallback)
      const data = await global.dbHelper.verifyWorkerOffline(dni);
      if (data) {
        if (data.error) {
          Alert.alert('ERROR', data.error, [{ text: 'OK', onPress: resetScanner }]);
        } else {
          setWorkerData(data);
          setShowModal(true);
          setScanStatus('success');
        }
      } else {
        showNotFoundAlert();
      }
    } catch (error) {
      console.error('[SCAN] Error crítico en handleDniReceived:', error.message);
      Alert.alert('Error', 'Ocurrió un error al verificar el postulante.');
    } finally {
      setLoading(false);
      setScanned(false);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetScanner();
  };

  const getBorderColor = () => {
    switch (scanStatus) {
      case 'processing': return COLORS.orange;
      case 'success':    return COLORS.successLight;
      default:           return 'rgba(255,255,255,0.7)';
    }
  };

  if (!permission) return <View style={styles.container}><ActivityIndicator color={COLORS.blue} /></View>;

  if (!permission.granted) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' }]}>
        <MaterialCommunityIcons name="camera-off" size={80} color="#666" />
        <Text style={styles.permissionText}>Se requiere acceso a la cámara</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Solicitar Permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['pdf417', 'code128', 'code39', 'code93', 'qr'],
        }}
      />

      <View style={styles.overlay}>
        {/* Encabezado */}
        <View style={styles.topOverlay}>
          <View style={styles.header}>
            <IconButton icon="chevron-left" iconColor="#334155" size={30} onPress={() => navigation.goBack()} style={styles.backBtn} />
            <Text style={styles.headerTitle}>SISTEMA DE MARCACIÓN</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={[
            styles.statusBadge,
            scanStatus === 'processing' && styles.statusBadgeWarning,
            scanStatus === 'success' && styles.statusBadgeSuccess,
          ]}>
            {loading
              ? <ActivityIndicator size="small" color={COLORS.blue} />
              : <Text style={[
                  styles.statusText,
                  scanStatus === 'processing' && styles.statusTextWarning,
                  scanStatus === 'success'    && styles.statusTextSuccess,
                ]}>
                  {statusMessage.toUpperCase()}
                </Text>
            }
          </View>
        </View>

        {/* Marco del escáner */}
        <View style={[styles.scannerFrame, { borderColor: getBorderColor() }]}>
          <View style={[styles.cornerTopLeft,    { borderColor: getBorderColor() }]} />
          <View style={[styles.cornerTopRight,   { borderColor: getBorderColor() }]} />
          <View style={[styles.cornerBottomLeft, { borderColor: getBorderColor() }]} />
          <View style={[styles.cornerBottomRight,{ borderColor: getBorderColor() }]} />

          <Animated.View style={[styles.scanLine, {
            backgroundColor: scanStatus === 'success' ? COLORS.successLight : '#B91C1C',
            transform: [{
              translateY: scanLineAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [10, frameHeight - 10]
              })
            }]
          }]} />

          <Text style={styles.guideText}>
            {scanStatus === 'processing'
              ? 'PROCESANDO...'
              : 'CÓDIGO DE BARRAS DEL REVERSO'}
          </Text>
        </View>

        {/* Pista debajo del marco */}
        <View style={styles.hintContainer}>
          <MaterialCommunityIcons name="barcode-scan" size={20} color="rgba(255,255,255,0.8)" />
          <Text style={styles.hintText}>
            Capture imagen de su documento oficial de identidad de la cara donde está el código de barras
          </Text>
        </View>

        {/* Entrada manual */}
        <View style={styles.bottomOverlay}>
          <Surface style={styles.manualPanel} elevation={3}>
            <Text style={styles.manualLabel}>INGRESO MANUAL DE DNI:</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Ej: 71234567"
                placeholderTextColor="#64748B"
                keyboardType="numeric"
                maxLength={8}
                value={manualDni}
                onChangeText={setManualDni}
              />
              <TouchableOpacity
                onPress={() => {
                  if (manualDni.length === 8) handleDniReceived(manualDni);
                  else Alert.alert('DNI inválido', 'El DNI debe tener 8 dígitos.');
                }}
                style={styles.manualSearchButton}
                disabled={loading}
              >
                <MaterialCommunityIcons name="magnify" size={26} color={COLORS.blue} />
              </TouchableOpacity>
            </View>
          </Surface>
        </View>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator animating={true} color="#334155" size="large" />
          <Text style={styles.loadingText}>VERIFICANDO...</Text>
        </View>
      )}

      <AttendanceModal
        visible={showModal}
        data={workerData}
        onClose={handleCloseModal}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topOverlay: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backBtn: { backgroundColor: '#F4F6F8', margin: 0 },
  headerTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  statusBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    minHeight: 40,
  },
  statusBadgeWarning: { backgroundColor: COLORS.orangeSoft, borderColor: COLORS.orangeBorder },
  statusBadgeSuccess: { backgroundColor: COLORS.successSoft, borderColor: COLORS.successBorder },
  statusText:        { color: '#334155', fontWeight: '900', fontSize: 11, textAlign: 'center' },
  statusTextWarning: { color: COLORS.orangeDark },
  statusTextSuccess: { color: COLORS.success },
  scannerFrame: {
    position: 'absolute',
    width: frameWidth,
    height: frameHeight,
    top: frameTop,
    left: frameLeft,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 3.5,
  },
  cornerTopLeft:    { position: 'absolute', top: -3.5, left: -3.5,   width: 28, height: 28, borderTopWidth: 5.5, borderLeftWidth: 5.5,   borderTopLeftRadius: 12 },
  cornerTopRight:   { position: 'absolute', top: -3.5, right: -3.5,  width: 28, height: 28, borderTopWidth: 5.5, borderRightWidth: 5.5,  borderTopRightRadius: 12 },
  cornerBottomLeft: { position: 'absolute', bottom: -3.5, left: -3.5, width: 28, height: 28, borderBottomWidth: 5.5, borderLeftWidth: 5.5, borderBottomLeftRadius: 12 },
  cornerBottomRight:{ position: 'absolute', bottom: -3.5, right: -3.5,width: 28, height: 28, borderBottomWidth: 5.5, borderRightWidth: 5.5,borderBottomRightRadius: 12 },
  scanLine: {
    width: '90%', height: 3, position: 'absolute', left: '5%',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4, elevation: 8,
  },
  guideText: {
    color: '#FFFFFF', fontSize: 11, textAlign: 'center', fontWeight: '900',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#334155', overflow: 'hidden',
  },
  hintContainer: {
    position: 'absolute',
    top: frameTop + frameHeight + 16,
    width: '100%',
    alignItems: 'center',
    flexDirection: 'column',
    gap: 6,
  },
  hintText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '600',
  },
  bottomOverlay: { padding: 20, paddingBottom: 40, backgroundColor: 'rgba(0,0,0,0.7)' },
  manualPanel: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 20, borderWidth: 2, borderColor: '#E2E8F0' },
  manualLabel: { color: '#64748B', fontSize: 12, marginBottom: 10, fontWeight: '900' },
  inputContainer: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1, backgroundColor: '#F9FAFB', borderRadius: 6,
    paddingHorizontal: 15, height: 55, color: '#0F172A',
    fontSize: 18, borderWidth: 2, borderColor: '#E2E8F0', fontWeight: '800',
  },
  manualSearchButton: {
    backgroundColor: '#F1F5F9', padding: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  loadingText: { color: '#334155', marginTop: 15, fontSize: 16, fontWeight: '900' },
  permissionText: { color: '#FFFFFF', fontSize: 16, marginTop: 20, marginBottom: 20, fontWeight: '700' },
  permissionButton: { backgroundColor: COLORS.blue, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  permissionButtonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14 },
});

export default ScanScreen;
