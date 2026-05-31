import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, TextInput, Alert, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ActivityIndicator, Surface, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AttendanceModal from '../components/AttendanceModal';

const { width, height } = Dimensions.get('window');

const ScanScreen = ({ navigation }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workerData, setWorkerData] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [dniType, setDniType] = useState('DNI'); // 'DNI' or 'DNIE'
  const [manualDni, setManualDni] = useState('');
  
  const frameY = useRef(new Animated.Value(height * 0.3)).current;
  const frameX = useRef(new Animated.Value(width * 0.5)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!permission || !permission.granted) {
      requestPermission();
    }
    
    // Animation for scan line
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    // Move frame based on DNI type (Vertical orientation on the right side)
    Animated.parallel([
      Animated.spring(frameY, {
        toValue: dniType === 'DNI' ? height * 0.35 : height * 0.2,
        useNativeDriver: false,
      }),
      Animated.spring(frameX, {
        toValue: width * 0.6, // Always to the right
        useNativeDriver: false,
      })
    ]).start();
  }, [dniType]);

  const handleDniReceived = async (dni) => {
    if (loading || !dni) return;
    setLoading(true);
    
    try {
      const response = await fetch(`http://192.168.18.9:3001/api/attendance/verify?dni=${dni}`);
      const data = await response.json();
      
      if (response.ok) {
        setWorkerData(data);
        setShowModal(true);
      } else {
        Alert.alert(
          'No encontrado', 
          'El DNI no está registrado. ¿Desea registrarlo ahora?',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Registrar', onPress: () => navigation.navigate('RegisterWorker', { dni: dni }) }
          ]
        );
      }
    } catch (error) {
      Alert.alert('Error de Conexión', 'No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
      setScanned(false);
    }
  };

  const handleBarCodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    handleDniReceived(data);
  };

  if (!permission) return <View style={styles.container}><ActivityIndicator color="#33d9b2" /></View>;
  
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#1a1a1a', '#000']} style={styles.background} />
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
          barcodeTypes: ["code128", "code39"],
        }}
      />
      
      <View style={styles.overlay}>
        <View style={styles.topOverlay}>
          <View style={styles.header}>
            <IconButton icon="chevron-left" iconColor="#334155" size={30} onPress={() => navigation.goBack()} style={styles.backBtn} />
            <Text style={styles.headerTitle}>Escaneo Vertical de Barras</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.toggleContainer}>
            <TouchableOpacity 
              style={[styles.toggleButton, dniType === 'DNI' && styles.toggleActive]} 
              onPress={() => setDniType('DNI')}
            >
              <Text style={[styles.toggleText, dniType === 'DNI' && styles.toggleTextActive]}>DNI AZUL</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.toggleButton, dniType === 'DNIE' && styles.toggleActive]} 
              onPress={() => setDniType('DNIE')}
            >
              <Text style={[styles.toggleText, dniType === 'DNIE' && styles.toggleTextActive]}>DNIe (ELECTRÓNICO)</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Animated.View style={[styles.scannerFrame, { top: frameY, left: frameX }]}>
           <View style={styles.cornerTopLeft} />
           <View style={styles.cornerTopRight} />
           <View style={styles.cornerBottomLeft} />
           <View style={styles.cornerBottomRight} />
           <Animated.View 
              style={[
                styles.scanLine, 
                { 
                  transform: [{ 
                    translateX: scanLineAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-30, 30]
                    }) 
                  }] 
                }
              ]} 
           />
           <Text style={styles.guideText}>Gire el documento para escanear la barra vertical</Text>
        </Animated.View>

        <View style={styles.bottomOverlay}>
           <Surface style={styles.manualPanel} elevation={3}>
              <Text style={styles.manualLabel}>Ingreso manual de DNI:</Text>
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
                  style={styles.searchButton}
                  onPress={() => handleDniReceived(manualDni)}
                >
                  <View style={styles.searchButtonContent}>
                    <MaterialCommunityIcons name="magnify" size={24} color="white" />
                  </View>
                </TouchableOpacity>
              </View>
           </Surface>
        </View>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator animating={true} color="#334155" size="large" />
          <Text style={styles.loadingText}>Verificando...</Text>
        </View>
      )}

      <AttendanceModal 
        visible={showModal} 
        data={workerData} 
        onClose={() => setShowModal(false)} 
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topOverlay: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backBtn: {
    backgroundColor: '#F4F6F8',
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F4F6F8',
    borderRadius: 6,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleActive: {
    backgroundColor: '#334155',
  },
  toggleText: {
    color: '#64748B',
    fontWeight: 'bold',
    fontSize: 11,
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  scannerFrame: {
    position: 'absolute',
    width: 100,
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cornerTopLeft: { position: 'absolute', top: 0, left: 0, width: 20, height: 20, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#334155', borderTopLeftRadius: 4 },
  cornerTopRight: { position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#334155', borderTopRightRadius: 4 },
  cornerBottomLeft: { position: 'absolute', bottom: 0, left: 0, width: 20, height: 20, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#334155', borderBottomLeftRadius: 4 },
  cornerBottomRight: { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#334155', borderBottomRightRadius: 4 },
  scanLine: {
    width: 2,
    height: '80%',
    backgroundColor: '#B91C1C',
    shadowColor: '#B91C1C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 5,
    elevation: 10,
  },
  guideText: {
    color: '#FFFFFF',
    fontSize: 10,
    textAlign: 'center',
    width: 150,
    position: 'absolute',
    bottom: -40,
    backgroundColor: 'rgba(51, 65, 85, 0.85)',
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bottomOverlay: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: 'rgba(244, 246, 248, 0.8)',
  },
  manualPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  manualLabel: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 10,
    fontWeight: '600',
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
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchButton: {
    width: 55,
    height: 55,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#334155',
  },
  searchButtonContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    fontWeight: '600',
  }
});

export default ScanScreen;
