import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Surface, Text, TextInput, Button, ActivityIndicator, IconButton, Portal, Modal } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ConfigScreen = () => {
  const [cargos, setCargos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [selectedCargo, setSelectedCargo] = useState(null);
  
  const [nombre, setNombre] = useState('');
  const [meta, setMeta] = useState('');

  useEffect(() => {
    fetchCargos();
  }, []);

  const fetchCargos = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch('http://192.168.18.9:3001/api/config/cargos', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setCargos(await response.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (modalMode === 'create' && !nombre) {
      Alert.alert('Error', 'Ingrese el nombre del cargo');
      return;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      let response;
      if (modalMode === 'create') {
        response = await fetch('http://192.168.18.9:3001/api/config/cargos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ nombre, meta: meta || 0 })
        });
      } else {
        response = await fetch(`http://192.168.18.9:3001/api/config/cargos/${selectedCargo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ meta: meta || 0 })
        });
      }

      if (response.ok) {
        setModalVisible(false);
        fetchCargos();
      } else {
        Alert.alert('Error', 'No se pudo guardar la configuración');
      }
    } catch (error) {
      Alert.alert('Error de conexión');
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
            label="Nombre del Cargo"
            value={nombre}
            onChangeText={setNombre}
            mode="outlined"
            style={styles.input}
            textColor="#0F172A"
            disabled={modalMode === 'edit'}
            activeOutlineColor="#334155"
            outlineColor="#E2E8F0"
          />

          <TextInput
            label="Límite Máximo de Personas (Meta)"
            value={meta}
            onChangeText={setMeta}
            mode="outlined"
            style={styles.input}
            keyboardType="numeric"
            textColor="#0F172A"
            activeOutlineColor="#334155"
            outlineColor="#E2E8F0"
          />

          <View style={styles.modalActions}>
            <Button textColor="#64748B" onPress={() => setModalVisible(false)}>CANCELAR</Button>
            <Button buttonColor="#334155" mode="contained" onPress={handleSave}>GUARDAR</Button>
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
    borderRadius: 6,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
