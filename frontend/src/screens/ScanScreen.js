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
        Alert.alert('Error', data.message || 'No se pudo encontrar al trabajador');
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
        <LinearGradient colors={['rgba(0,0,0,0.8)', 'transparent']} style={styles.topOverlay}>
          <View style={styles.header}>
            <IconButton icon="chevron-left" iconColor="#fff" size={30} onPress={() => navigation.goBack()} />
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
        </LinearGradient>

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

        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={styles.bottomOverlay}>
           <Surface style={styles.manualPanel} elevation={4}>
              <Text style={styles.manualLabel}>Ingreso manual de DNI:</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: 71234567"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                  maxLength={8}
                  value={manualDni}
                  onChangeText={setManualDni}
                />
                <TouchableOpacity 
                  style={styles.searchButton}
                  onPress={() => handleDniReceived(manualDni)}
                >
                  <LinearGradient
                    colors={['#33d9b2', '#218c74']}
                    style={styles.searchButtonGradient}
                  >
                    <MaterialCommunityIcons name="magnify" size={24} color="white" />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
           </Surface>
        </LinearGradient>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator animating={true} color="#33d9b2" size="large" />
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
    backgroundColor: '#000',
  },
  background: { ...StyleSheet.absoluteFillObject },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topOverlay: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 15,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
  },
  toggleActive: {
    backgroundColor: '#33d9b2',
  },
  toggleText: {
    color: '#888',
    fontWeight: 'bold',
    fontSize: 11,
  },
  toggleTextActive: {
    color: '#fff',
  },
  scannerFrame: {
    position: 'absolute',
    width: 100, // Narrower for vertical barcode
    height: 250, // Taller for vertical barcode
    justifyContent: 'center',
    alignItems: 'center',
  },
  cornerTopLeft: { position: 'absolute', top: 0, left: 0, width: 20, height: 20, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#33d9b2', borderTopLeftRadius: 10 },
  cornerTopRight: { position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#33d9b2', borderTopRightRadius: 10 },
  cornerBottomLeft: { position: 'absolute', bottom: 0, left: 0, width: 20, height: 20, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#33d9b2', borderBottomLeftRadius: 10 },
  cornerBottomRight: { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#33d9b2', borderBottomRightRadius: 10 },
  scanLine: {
    width: 2,
    height: '80%',
    backgroundColor: '#33d9b2',
    shadowColor: '#33d9b2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 5,
    elevation: 10,
  },
  guideText: {
    color: '#fff',
    fontSize: 10,
    textAlign: 'center',
    width: 150,
    position: 'absolute',
    bottom: -40,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 5,
    borderRadius: 8,
  },
  bottomOverlay: {
    padding: 20,
    paddingBottom: 40,
  },
  manualPanel: {
    backgroundColor: 'rgba(25,25,25,0.95)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  manualLabel: {
    color: '#888',
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
    backgroundColor: '#121212',
    borderRadius: 15,
    paddingHorizontal: 15,
    height: 55,
    color: '#fff',
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#333',
  },
  searchButton: {
    width: 55,
    height: 55,
    borderRadius: 15,
    overflow: 'hidden',
  },
  searchButtonGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 20,
    marginBottom: 30,
  },
  permissionButton: {
    backgroundColor: '#33d9b2',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    color: '#fff',
    marginTop: 15,
    fontSize: 16,
    fontWeight: '600',
  }
});

export default ScanScreen;
