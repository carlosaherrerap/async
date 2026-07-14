import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Surface, Text, TextInput, Button, ActivityIndicator, IconButton, Portal, Modal } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../theme/colors';
import { API_URL } from '../config';

const ConfigScreen = () => {
  const [cargos, setCargos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'crear' o 'editar'
  const [selectedCargo, setSelectedCargo] = useState(null);
  
  const [nombre, setNombre] = useState('');
  const [meta, setMeta] = useState('');

  useEffect(() => {
    fetchCargos();
  }, []);

  const fetchCargos = async () => {
    try {
      const isOnline = global.dbHelper.isOnline();
      if (!isOnline) {
        const localCargos = await global.dbHelper.getCargos();
        setCargos(localCargos);
        return;
      }
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${API_URL}/api/configuracion/cargos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setCargos(await response.json());
      }
    } catch (e) {
      console.error(e);
      try {
        const localCargos = await global.dbHelper.getCargos();
        setCargos(localCargos);
      } catch (sqliteErr) {
        console.error('SQLite fallback error:', sqliteErr);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (modalMode === 'create' && !nombre) {
      Alert.alert('Error', 'Ingrese el nombre del cargo');
      return;
    }

    const isOnline = global.dbHelper.isOnline();
    if (!isOnline) {
      try {
        if (modalMode === 'create') {
          await global.dbHelper.createCargoOffline(nombre, parseInt(meta) || 0);
        } else {
          await global.dbHelper.updateMetaOffline(selectedCargo.id, parseInt(meta) || 0, nombre);
        }
        setModalVisible(false);
        fetchCargos();
        Alert.alert('Exito', 'Configuracion guardada localmente (Modo Offline)');
      } catch (error) {
        Alert.alert('Error', error.message || 'No se pudo guardar localmente');
      }
      return;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      let response;
      if (modalMode === 'create') {
        response = await fetch(`${API_URL}/api/configuracion/cargos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ nombre, meta: parseInt(meta) || 0 })
        });
      } else {
        response = await fetch(`${API_URL}/api/configuracion/cargos/${selectedCargo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ meta: parseInt(meta) || 0 })
        });
      }

      if (response.ok) {
        try {
          const db = global.dbHelper.db;
          if (db) {
            if (modalMode === 'create') {
              const resData = await response.json();
              const realId = resData.id;
              await db.runAsync('INSERT OR REPLACE INTO cargos (id, nombre) VALUES (?, ?)', [
                realId, nombre
              ]);
              await db.runAsync('INSERT OR REPLACE INTO metas_cargos (cargo_id, limite_vacantes) VALUES (?, ?)', [
                realId, parseInt(meta) || 0
              ]);
            } else {
              await db.runAsync('INSERT OR REPLACE INTO metas_cargos (cargo_id, limite_vacantes) VALUES (?, ?)', [
                selectedCargo.id, parseInt(meta) || 0
              ]);
            }
          }
        } catch (dbErr) {
          console.error('Failed to update local db after online config change:', dbErr);
        }

        setModalVisible(false);
        fetchCargos();
      } else {
        Alert.alert('Error', 'No se pudo guardar la configuración');
      }
    } catch (error) {
      Alert.alert('Error', 'Hubo un problema de conexion. ¿Desea guardar el cambio de forma local/offline?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Guardar Local',
          onPress: async () => {
            try {
              if (modalMode === 'create') {
                await global.dbHelper.createCargoOffline(nombre, parseInt(meta) || 0);
              } else {
                await global.dbHelper.updateMetaOffline(selectedCargo.id, parseInt(meta) || 0, nombre);
              }
              setModalVisible(false);
              fetchCargos();
              Alert.alert('Exito', 'Configuracion guardada localmente (Modo Offline)');
            } catch (err) {
              Alert.alert('Error', err.message || 'No se pudo guardar localmente');
            }
          }
        }
      ]);
    }
  };

  const openCreate = () => {
    setModalMode('create');
    setNombre('');
    setMeta('');
    setModalVisible(true);
  };

  const openEdit = (cargo) => {
    setModalMode('edit');
    setSelectedCargo(cargo);
    setNombre(cargo.nombre);
    setMeta(cargo.meta?.toString() || '0');
    setModalVisible(true);
  };

  if (loading && cargos.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#334155" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>CARGOS Y METAS</Text>
          <Button icon="plus" mode="contained" buttonColor="#334155" onPress={openCreate}>
            NUEVO
          </Button>
        </View>

        {cargos.map((cargo) => (
          <Surface key={cargo.id} style={styles.cargoCard} elevation={1}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cargoName}>{cargo.nombre}</Text>
              <Text style={styles.cargoMeta}>Meta de Vacantes: {cargo.meta}</Text>
            </View>
            <IconButton icon="pencil" iconColor="#334155" onPress={() => openEdit(cargo)} />
          </Surface>
        ))}

      </ScrollView>

      <Portal>
        <Modal visible={modalVisible} onDismiss={() => setModalVisible(false)} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {modalMode === 'create' ? 'NUEVO CARGO' : 'EDITAR META DE CARGO'}
          </Text>
          
          <TextInput
            label="NOMBRE DEL CARGO"
            value={nombre}
            onChangeText={setNombre}
            mode="outlined"
            style={styles.input}
            textColor="#0F172A"
            disabled={modalMode === 'edit'}
            activeOutlineColor="#334155"
            outlineColor="#E2E8F0"
            theme={{ colors: { outlineVariant: '#E2E8F0' } }}
          />

          <TextInput
            label="LIMITE MAXIMO DE PERSONAS (META)"
            value={meta}
            onChangeText={setMeta}
            mode="outlined"
            style={styles.input}
            keyboardType="numeric"
            textColor="#0F172A"
            activeOutlineColor="#334155"
            outlineColor="#E2E8F0"
            theme={{ colors: { outlineVariant: '#E2E8F0' } }}
          />

          <View style={styles.modalActions}>
            <Button textColor="#64748B" labelStyle={{ fontWeight: '900' }} onPress={() => setModalVisible(false)}>CANCELAR</Button>
            <TouchableOpacity 
              onPress={handleSave}
              style={{ borderWidth: 2.5, borderColor: COLORS.blue, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#FFF' }}
            >
              <Text style={{ color: COLORS.blue, fontWeight: '900', fontSize: 13, letterSpacing: 0.5 }}>GUARDAR</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  scrollContent: { padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: 'bold',
    paddingLeft: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#334155',
  },
  cargoCard: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 6,
    borderLeftColor: COLORS.blue,
    elevation: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.05,
    shadowRadius: 2.5,
  },
  cargoName: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cargoMeta: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 5,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    margin: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
  },
  input: {
    backgroundColor: '#F9FAFB',
    marginBottom: 15,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  }
});

export default ConfigScreen;
