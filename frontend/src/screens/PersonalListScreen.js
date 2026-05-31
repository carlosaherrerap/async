import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { List, Avatar, Surface, ActivityIndicator, Text, Chip, Portal, Modal, TextInput, Button } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PersonalListScreen = ({ navigation }) => {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 10;
  const [hasMore, setHasMore] = useState(true);
  
  const [filterTitular, setFilterTitular] = useState(false);
  
  // Lists for dropdown selectors
  const [cargos, setCargos] = useState([]);
  const [rules, setRules] = useState([]);

  // Modal Edit
  const [editModal, setEditModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [editForm, setEditForm] = useState({ 
    sede_reg: '', 
    sede_juris: '', 
    local: '', 
    aula: '', 
    cargo_id: '', 
    regla_id: null 
  });

  useEffect(() => {
    fetchWorkers(0, true);
    fetchCargosAndRules();
  }, [filterTitular]);

  const fetchCargosAndRules = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'Authorization': `Bearer ${token}` };
      const [cargosRes, rulesRes] = await Promise.all([
        fetch('http://192.168.18.9:3001/api/config/cargos', { headers }),
        fetch('http://192.168.18.9:3001/api/rules', { headers })
      ]);
      if (cargosRes.ok) setCargos(await cargosRes.json());
      if (rulesRes.ok) setRules(await rulesRes.json());
    } catch (e) {
      console.error('Error fetching config data:', e);
    }
  };

  const fetchWorkers = async (currentOffset, reset = false) => {
    if (!hasMore && !reset) return;
    try {
      const token = await AsyncStorage.getItem('userToken');
      let url = `http://192.168.18.9:3001/api/attendance/workers?limit=${LIMIT}&offset=${currentOffset}`;
      if (filterTitular) url += '&tipo=Titular';

      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.status === 401 || response.status === 403) {
        await AsyncStorage.multiRemove(['userToken', 'userData']);
        navigation.replace('Login');
        return;
      }
      const data = await response.json();
      
      if (data.data.length < LIMIT) setHasMore(false);
      else setHasMore(true);

      if (reset) {
        setWorkers(data.data);
      } else {
        setWorkers([...workers, ...data.data]);
      }
      setOffset(currentOffset + LIMIT);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      setLoadingMore(true);
      fetchWorkers(offset);
    }
  };

  const openEdit = (worker) => {
    setSelectedWorker(worker);
    setEditForm({
      sede_reg: worker.sede_reg,
      sede_juris: worker.sede_juris,
      local: worker.local,
      aula: worker.aula?.toString() || '',
      cargo_id: worker.cargo_id?.toString() || '',
      regla_id: worker.regla_id ? worker.regla_id.toString() : null
    });
    setEditModal(true);
  };

  const saveEdit = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const bodyData = {
        ...editForm,
        cargo_id: editForm.cargo_id ? parseInt(editForm.cargo_id) : null,
        regla_id: editForm.regla_id ? parseInt(editForm.regla_id) : null,
        aula: editForm.aula ? parseInt(editForm.aula) : 99
      };
      
      const response = await fetch(`http://192.168.18.9:3001/api/attendance/workers/${selectedWorker.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(bodyData)
      });
      if (response.ok) {
        setEditModal(false);
        fetchWorkers(0, true);
      } else {
        const err = await response.json();
        Alert.alert('Error', err.message || 'No se pudo actualizar');
      }
    } catch (e) {
      Alert.alert('Error de conexión');
    }
  };

  const renderItem = ({ item }) => {
    const isTitular = item.tipo_postulante === 'Titular';
    const accentColor = isTitular ? '#15803D' : '#B91C1C'; // Éxito HSL(142,70,25) y Error HSL(0,75,45)
    
    return (
      <TouchableOpacity onPress={() => openEdit(item)}>
        <Surface style={styles.itemCard} elevation={0}>
          <List.Item
            title={`${item.nombres} ${item.ape_pat} ${item.ape_mat}`}
            description={`${item.cargo}\nSede: ${item.sede_reg} > ${item.local} (Aula ${item.aula})\nRegla: ${item.regla_nombre || 'REGLA GENERAL (Predeterminada)'}`}
            left={props => <Avatar.Text {...props} label={item.nombres[0]} size={40} style={{ backgroundColor: accentColor }} textColor="#FFFFFF" />}
            right={() => (
                <View style={styles.badgeContainer}>
                    <Text style={[styles.badgeText, { color: accentColor }]}>
                        {item.tipo_postulante.toUpperCase()}
                    </Text>
                </View>
            )}
            titleStyle={{ color: '#0F172A', fontWeight: 'bold', fontSize: 14 }}
            descriptionStyle={{ color: '#64748B', fontSize: 12, marginTop: 4, lineHeight: 16 }}
          />
        </Surface>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>PERSONAL</Text>
        <Chip 
          icon="account" 
          mode="outlined" 
          selected={filterTitular}
          onPress={() => {
            setLoading(true);
            setFilterTitular(!filterTitular);
          }}
          style={filterTitular ? styles.chipActive : styles.chip}
          selectedColor="#FFFFFF"
          textStyle={{ color: filterTitular ? '#FFFFFF' : '#64748B', fontSize: 12 }}
        >
          Solo Titulares
        </Chip>
      </View>
      
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#334155" size="large" /></View>
      ) : workers.length === 0 ? (
        <View style={styles.center}><Text style={styles.emptyText}>No hay trabajadores</Text></View>
      ) : (
        <FlatList
          data={workers}
          keyExtractor={(item) => item.dni}
          renderItem={renderItem}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{margin: 20}} color="#334155"/> : null}
          contentContainerStyle={{ padding: 15, paddingBottom: 40 }}
        />
      )}

      <Portal>
        <Modal visible={editModal} onDismiss={() => setEditModal(false)} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>EDITAR TRABAJADOR</Text>
          {selectedWorker && <Text style={{color:'#334155', marginBottom: 15, textAlign:'center', fontWeight: 'bold', fontSize: 13}}>{selectedWorker.nombres} {selectedWorker.ape_pat}</Text>}
          
          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={true}>
            <TextInput
              label="Sede Regional"
              value={editForm.sede_reg}
              onChangeText={t => setEditForm({...editForm, sede_reg: t})}
              mode="outlined"
              style={styles.input}
              textColor="#0F172A"
              activeOutlineColor="#334155"
              outlineColor="#E2E8F0"
            />
            <TextInput
              label="Sede Provincial / Jurisdiccional"
              value={editForm.sede_juris}
              onChangeText={t => setEditForm({...editForm, sede_juris: t})}
              mode="outlined"
              style={styles.input}
              textColor="#0F172A"
              activeOutlineColor="#334155"
              outlineColor="#E2E8F0"
            />
            <TextInput
              label="Local"
              value={editForm.local}
              onChangeText={t => setEditForm({...editForm, local: t})}
              mode="outlined"
              style={styles.input}
              textColor="#0F172A"
              activeOutlineColor="#334155"
              outlineColor="#E2E8F0"
            />
            <TextInput
              label="Aula"
              value={editForm.aula}
              onChangeText={t => setEditForm({...editForm, aula: t})}
              mode="outlined"
              keyboardType="numeric"
              style={styles.input}
              textColor="#0F172A"
              activeOutlineColor="#334155"
              outlineColor="#E2E8F0"
            />

            <Text style={styles.pickerLabel}>CARGO:</Text>
            <View style={styles.pickerContainer}>
              <ScrollView style={{ maxHeight: 110 }} nestedScrollEnabled>
                {cargos.map(c => (
                  <TouchableOpacity 
                    key={c.id} 
                    style={[styles.pickerOption, editForm.cargo_id?.toString() === c.id.toString() && styles.pickerOptionActive]}
                    onPress={() => setEditForm({ ...editForm, cargo_id: c.id.toString() })}
                  >
                    <Text style={{ 
                      color: editForm.cargo_id?.toString() === c.id.toString() ? '#FFFFFF' : '#0F172A', 
                      fontSize: 13, 
                      fontWeight: editForm.cargo_id?.toString() === c.id.toString() ? 'bold' : 'normal' 
                    }}>
                      {c.nombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <Text style={styles.pickerLabel}>REGLA DE ASISTENCIA:</Text>
            <View style={styles.pickerContainer}>
              <ScrollView style={{ maxHeight: 110 }} nestedScrollEnabled>
                <TouchableOpacity 
                  style={[styles.pickerOption, !editForm.regla_id && styles.pickerOptionActive]}
                  onPress={() => setEditForm({ ...editForm, regla_id: null })}
                >
                  <Text style={{ 
                    color: !editForm.regla_id ? '#FFFFFF' : '#0F172A', 
                    fontSize: 13, 
                    fontWeight: !editForm.regla_id ? 'bold' : 'normal' 
                  }}>
                    [Predeterminada] - REGLA GENERAL
                  </Text>
                </TouchableOpacity>
                {rules.map(r => (
                  <TouchableOpacity 
                    key={r.id} 
                    style={[styles.pickerOption, editForm.regla_id?.toString() === r.id.toString() && styles.pickerOptionActive]}
                    onPress={() => setEditForm({ ...editForm, regla_id: r.id.toString() })}
                  >
                    <Text style={{ 
                      color: editForm.regla_id?.toString() === r.id.toString() ? '#FFFFFF' : '#0F172A', 
                      fontSize: 13, 
                      fontWeight: editForm.regla_id?.toString() === r.id.toString() ? 'bold' : 'normal' 
                    }}>
                      REGLA {r.nombre} ({r.hora_ingreso.substring(0,5)} - {r.hora_salida.substring(0,5)})
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <Button textColor="#64748B" onPress={() => setEditModal(false)}>CANCELAR</Button>
            <Button buttonColor="#334155" mode="contained" onPress={saveEdit}>GUARDAR</Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  header: {
    padding: 15,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: 'bold',
    borderLeftWidth: 4,
    borderLeftColor: '#334155',
    paddingLeft: 8,
  },
  chip: {
    backgroundColor: '#F4F6F8',
    borderColor: '#E2E8F0',
    height: 32,
  },
  chipActive: {
    backgroundColor: '#334155',
    borderColor: '#334155',
    height: 32,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#64748B', fontSize: 13 },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  badgeContainer: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
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
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 5,
  },
  input: {
    backgroundColor: '#F9FAFB',
    marginBottom: 8,
    height: 42,
  },
  pickerLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    backgroundColor: '#F9FAFB',
    padding: 3,
    marginBottom: 8,
  },
  pickerOption: {
    padding: 8,
    borderRadius: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerOptionActive: {
    backgroundColor: '#334155',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 10,
  }
});

export default PersonalListScreen;
