import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, TextInput, Alert, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ActivityIndicator, Surface, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AttendanceModal from '../components/AttendanceModal';
import { COLORS } from '../theme/colors';

const { width, height } = Dimensions.get('window');
const frameWidth = width * 0.85;
const frameHeight = (width * 0.85) / 1.58; // Aspect ratio of a standard card (1.58)
const frameTop = height * 0.28;
const frameLeft = width * 0.075;

const ScanScreen = ({ route, navigation }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workerData, setWorkerData] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [manualDni, setManualDni] = useState('');

  // Real-time scan states
  const [isScanningActive, setIsScanningActive] = useState(true);
  const [scanStatus, setScanStatus] = useState('searching'); // 'searching' | 'processing' | 'flip_dni' | 'success' | 'unrecognized'
  const [statusMessage, setStatusMessage] = useState('Coloque el reverso del DNI en el recuadro');
  const [isOnline, setIsOnline] = useState(true);

  const cameraRef = useRef(null);
  const scanLoopRef = useRef(null);
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  // Check online status on mount
  useEffect(() => {
    const online = global.dbHelper.isOnline();
    setIsOnline(online);
    if (!online) {
      setStatusMessage('Modo Offline: Escanee la barra del reverso directamente');
    } else {
      setStatusMessage('Coloque el reverso del DNI en el recuadro');
    }
  }, []);

  // Sync params DNI
  useEffect(() => {
    if (route.params?.dni) {
      const targetDni = route.params.dni;
      navigation.setParams({ dni: undefined });
      handleDniReceived(targetDni);
    }
  }, [route.params?.dni]);

  // Scan line animation loop
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const takePhoto = async () => {
    if (!isScanningActive || showModal || loading || !cameraRef.current) return;

    try {
      setLoading(true);
      setScanStatus('processing');
      setStatusMessage('Analizando DNI...');

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.05, // very high compression for < 100KB
        base64: true,
        imageType: 'jpg',
      });

      if (!photo || !photo.base64) {
        setScanStatus('searching');
        setStatusMessage('Error al capturar, intente de nuevo');
        setLoading(false);
        return;
      }

      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const token = await AsyncStorage.getItem('userToken');

      const BASE_URL = 'https://backend-u0t0.onrender.com'; // URL del backend en Render
      
      // Timeout de 30 segundos (el servidor gratis de Render puede tardar en despertar)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      let response;
      try {
        response = await fetch(`${BASE_URL}/api/attendance/scan-dni`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ imageBase64: photo.base64 }),
          signal: controller.signal
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          setScanStatus('searching');
          setStatusMessage('Timeout: El servidor tardó demasiado. Reintente.');
        } else {
          console.error('Error de red al enviar imagen:', fetchErr.message);
          setScanStatus('searching');
          setStatusMessage('Sin conexión al servidor.');
        }
        setLoading(false);
        return;
      }
      clearTimeout(timeoutId);

      let data;
      try {
        const textResponse = await response.text();
        try {
          data = JSON.parse(textResponse);
        } catch (parseErr) {
          console.error('Error parseando JSON del servidor:', parseErr.message);
          console.log('Respuesta cruda del servidor:', textResponse.substring(0, 500)); // Log first 500 chars of HTML error
          setScanStatus('searching');
          setStatusMessage('Error en el servidor. Intente de nuevo.');
          setLoading(false);
          return;
        }
      } catch (readErr) {
        console.error('Error leyendo respuesta del servidor:', readErr.message);
        setScanStatus('searching');
        setStatusMessage('Error de red. Intente de nuevo.');
        setLoading(false);
        return;
      }

      if (!response.ok) {
        setScanStatus('searching');
        setStatusMessage(data.error || 'No se pudo leer el DNI');
        setLoading(false);
        return;
      }

      if (data.status === 'face_detected') {
        setScanStatus('flip_dni');
        setStatusMessage('¡Voltee el DNI!');
        setLoading(false);
      } else if ((data.status === 'success' || data.status === 'not_found') && data.dni) {
        setScanStatus('success');
        setStatusMessage(`DNI ${data.dni} detectado`);
        setLoading(false);
        
        Alert.alert(
          'DNI Detectado',
          `DNI: ${data.dni}\n¿Desea continuar?`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => {
                setIsScanningActive(true);
                setScanStatus('searching');
                setStatusMessage('Coloque el reverso del DNI en el recuadro');
              } 
            },
            { text: 'Buscar', onPress: () => handleDniReceived(data.dni) }
          ]
        );
      } else {
        setScanStatus('searching');
        setStatusMessage('No se detectó un DNI válido');
        setLoading(false);
      }
    } catch (err) {
      console.log('Error scanning DNI via backend:', err.message);
      setScanStatus('searching');
      setStatusMessage('Error de conexión');
      setLoading(false);
    }
  };

  const handleDniReceived = async (dni) => {
    if (loading || !dni) return;
    setLoading(true);

    const showNotFoundAlert = () => {
      Alert.alert(
        'Postulante no encontrado',
        `El DNI ${dni} no esta registrado. ¿Desea registrarlo ahora?`,
        [
          { text: 'Cancelar', style: 'cancel', onPress: () => {
              setIsScanningActive(true);
              setScanStatus('searching');
              setStatusMessage(isOnline ? 'Coloque el reverso del DNI en el recuadro' : 'Modo Offline: Escanee la barra del reverso directamente');
            } 
          },
          { text: 'Registrar', onPress: () => navigation.navigate('RegisterWorker', { dni: dni }) }
        ]
      );
    };

    try {
      if (global.dbHelper.isOnline()) {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const token = await AsyncStorage.getItem('userToken');
          const response = await fetch(`https://backend-6oio.onrender.com/api/attendance/verify?dni=${dni}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const data = await response.json();

          if (response.ok) {
            setWorkerData(data);
            setShowModal(true);
            setIsScanningActive(false);
            return;
          } else {
            showNotFoundAlert();
            return;
          }
        } catch (fetchErr) {
          console.log('Error verifying worker online, falling back to local SQLite:', fetchErr.message);
        }
      }

      const data = await global.dbHelper.verifyWorkerOffline(dni);
      if (data) {
        setWorkerData(data);
        setShowModal(true);
        setIsScanningActive(false);
      } else {
        showNotFoundAlert();
      }
    } catch (error) {
      Alert.alert('Error', 'Ocurrio un error al verificar el postulante.');
    } finally {
      setLoading(false);
      setScanned(false);
    }
  };

  const handleBarCodeScanned = ({ data }) => {
    // Only used when OFFLINE
    if (isOnline) return;
    if (scanned) return;
    setScanned(true);
    handleDniReceived(data);
  };

  const getBorderColor = () => {
    switch (scanStatus) {
      case 'processing':
        return COLORS.orange;
      case 'flip_dni':
        return COLORS.danger;
      case 'success':
        return COLORS.successLight;
      default:
        return 'rgba(255,255,255,0.7)';
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setIsScanningActive(true);
    setScanStatus('searching');
    setStatusMessage(isOnline ? 'Coloque el reverso del DNI en el recuadro' : 'Modo Offline: Escanee la barra del reverso directamente');
  };

  if (!permission) return <View style={styles.container}><ActivityIndicator color={COLORS.blue} /></View>;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={[styles.background, { backgroundColor: '#1a1a1a' }]} />
        <MaterialCommunityIcons name="camera-off" size={80} color="#666" />
        <Text style={styles.permissionText}>Se requiere acceso a la camara</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Solicitar Permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["code128", "code39"], // Fallback barcodes offline
        }}
      />

      <View style={styles.overlay}>
        {/* Header HUD */}
        <View style={styles.topOverlay}>
          <View style={styles.header}>
            <IconButton icon="chevron-left" iconColor="#334155" size={30} onPress={() => navigation.goBack()} style={styles.backBtn} />
            <Text style={styles.headerTitle}>CONTROL DE ASISTENCIA (DNI)</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={[
            styles.statusBadge, 
            scanStatus === 'flip_dni' && styles.statusBadgeDanger,
            scanStatus === 'processing' && styles.statusBadgeWarning,
            scanStatus === 'success' && styles.statusBadgeSuccess
          ]}>
            <Text style={[
              styles.statusText,
              scanStatus === 'flip_dni' && styles.statusTextDanger,
              scanStatus === 'processing' && styles.statusTextWarning,
              scanStatus === 'success' && styles.statusTextSuccess
            ]}>
              {statusMessage.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Viewfinder slot */}
        <View style={[styles.scannerFrame, { borderColor: getBorderColor() }]}>
          <View style={[styles.cornerTopLeft, { borderColor: getBorderColor() }]} />
          <View style={[styles.cornerTopRight, { borderColor: getBorderColor() }]} />
          <View style={[styles.cornerBottomLeft, { borderColor: getBorderColor() }]} />
          <View style={[styles.cornerBottomRight, { borderColor: getBorderColor() }]} />

          <Animated.View
            style={[
              styles.scanLine,
              {
                backgroundColor: scanStatus === 'flip_dni' ? COLORS.danger : (scanStatus === 'success' ? COLORS.successLight : '#B91C1C'),
                transform: [{
                  translateY: scanLineAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, frameHeight - 10]
                  })
                }]
              }
            ]}
          />

          {scanStatus === 'flip_dni' ? (
            <View style={styles.flipContainer}>
              <MaterialCommunityIcons name="card-refresh-outline" size={70} color={COLORS.danger} />
              <Text style={styles.flipText}>¡VOLTEE EL DNI!</Text>
            </View>
          ) : (
            <Text style={styles.guideText}>
              {isOnline ? 'UBIQUE EL REVERSO DE DNI AQUÍ' : 'ESCANEE LA BARRA DE CONTROL'}
            </Text>
          )}
        </View>

        {isOnline && (
          <View style={styles.captureContainer}>
            <TouchableOpacity 
              style={[styles.captureButton, loading && styles.captureButtonDisabled]} 
              onPress={takePhoto}
              disabled={loading || !isScanningActive}
            >
              <MaterialCommunityIcons name="camera" size={32} color="#FFFFFF" />
              <Text style={styles.captureButtonText}>Tomar Foto</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Manual entry at bottom */}
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
                onPress={() => handleDniReceived(manualDni)}
                style={styles.manualSearchButton}
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
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
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
  backBtn: {
    backgroundColor: '#F4F6F8',
    margin: 0,
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  statusBadgeWarning: {
    backgroundColor: COLORS.orangeSoft,
    borderColor: COLORS.orangeBorder,
  },
  statusBadgeDanger: {
    backgroundColor: COLORS.dangerSoft,
    borderColor: COLORS.dangerBorder,
  },
  statusBadgeSuccess: {
    backgroundColor: COLORS.successSoft,
    borderColor: COLORS.successBorder,
  },
  statusText: {
    color: '#334155',
    fontWeight: '900',
    fontSize: 12,
    textAlign: 'center',
  },
  statusTextWarning: {
    color: COLORS.orangeDark,
  },
  statusTextDanger: {
    color: COLORS.danger,
  },
  statusTextSuccess: {
    color: COLORS.success,
  },
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
  cornerTopLeft: { position: 'absolute', top: -3.5, left: -3.5, width: 25, height: 25, borderTopWidth: 5.5, borderLeftWidth: 5.5, borderTopLeftRadius: 12 },
  cornerTopRight: { position: 'absolute', top: -3.5, right: -3.5, width: 25, height: 25, borderTopWidth: 5.5, borderRightWidth: 5.5, borderTopRightRadius: 12 },
  cornerBottomLeft: { position: 'absolute', bottom: -3.5, left: -3.5, width: 25, height: 25, borderBottomWidth: 5.5, borderLeftWidth: 5.5, borderBottomLeftRadius: 12 },
  cornerBottomRight: { position: 'absolute', bottom: -3.5, right: -3.5, width: 25, height: 25, borderBottomWidth: 5.5, borderRightWidth: 5.5, borderBottomRightRadius: 12 },
  scanLine: {
    width: '90%',
    height: 3,
    position: 'absolute',
    left: '5%',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 8,
  },
  guideText: {
    color: '#FFFFFF',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '900',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  flipContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(254, 242, 242, 0.95)',
    borderRadius: 12,
    padding: 15,
    borderWidth: 2.5,
    borderColor: COLORS.dangerBorder,
  },
  flipText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  bottomOverlay: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  manualPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  manualLabel: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 10,
    fontWeight: '900',
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    paddingHorizontal: 15,
    height: 55,
    color: '#0F172A',
    fontSize: 18,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    fontWeight: '800',
  },
  manualSearchButton: {
    backgroundColor: '#F1F5F9',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  captureContainer: {
    position: 'absolute',
    bottom: 210,
    width: '100%',
    alignItems: 'center',
    zIndex: 10,
  },
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.blue,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  captureButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  captureButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  permissionText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 20,
    marginBottom: 20,
    fontWeight: '700',
  },
  permissionButton: {
    backgroundColor: COLORS.blue,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: '#334155',
    marginTop: 15,
    fontSize: 16,
    fontWeight: '900',
  }
});

export default ScanScreen;
