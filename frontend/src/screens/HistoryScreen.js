import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { Text, Surface, IconButton } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../theme/colors';
import { API_URL } from '../config';

const HistoryScreen = ({ navigation }) => {
  const [historyList, setHistoryList] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    const isOnline = global.dbHelper.isOnline();
    if (isOnline) {
      try {
        const token = await AsyncStorage.getItem('userToken');
        const res = await fetch(`${API_URL}/api/asistencia/historial-sedes`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setHistoryList(data);
        } else {
          Alert.alert('Error', 'No se pudo obtener el historial del servidor.');
        }
      } catch (err) {
        console.error(err);
        Alert.alert('Error', 'Error de red al obtener el historial.');
      }
    } else {
      try {
        const rows = await global.dbHelper.db.getAllAsync(`
          SELECT h.id, h.principal_id, h.sede_origen, h.sede_destino, h.fecha_hora, h.usuario_cambio,
                 p.doc_identidad as dni, (p.ape_pat || ' ' || p.ape_mat || ', ' || p.nombres) as nombre_completo
          FROM historial_cambios_sede h
          JOIN principal p ON h.principal_id = p.id
          ORDER BY h.fecha_hora DESC
        `);
        setHistoryList(rows);
      } catch (e) {
        console.error(e);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('es-PE', { timeZone: 'America/Lima' });
    } catch {
      return dateStr;
    }
  };

  const renderItem = ({ item }) => (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.cardHeader}>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons name="account-convert" size={24} color="#1565C0" />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.workerName}>{(item.nombre_completo || 'Postulante').toUpperCase()}</Text>
          <Text style={styles.workerDni}>DNI: {item.dni}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.detailsRow}>
        <View style={styles.detailCol}>
          <Text style={styles.detailLabel}>SEDE ANTERIOR</Text>
          <Text style={[styles.detailValue, styles.oldSede]}>{item.sede_origen}</Text>
        </View>
        <View style={styles.arrowCol}>
          <MaterialCommunityIcons name="arrow-right-thick" size={20} color={COLORS.muted} />
        </View>
        <View style={styles.detailCol}>
          <Text style={styles.detailLabel}>SEDE NUEVA</Text>
          <Text style={[styles.detailValue, styles.newSede]}>{item.sede_destino}</Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.footerText}>
          <MaterialCommunityIcons name="clock-outline" size={14} /> {formatDate(item.fecha_hora)}
        </Text>
        <Text style={styles.footerText}>
          <MaterialCommunityIcons name="account-edit-outline" size={14} /> Modificado por: {item.usuario_cambio}
        </Text>
      </View>
    </Surface>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          iconColor="#0F172A"
          size={24}
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        />
        <Text style={styles.headerTitle}>HISTORIAL DE CAMBIOS DE SEDE</Text>
        <IconButton
          icon="refresh"
          iconColor="#1565C0"
          size={24}
          onPress={loadHistory}
          style={styles.refreshBtn}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1565C0" />
        </View>
      ) : (
        <FlatList
          data={historyList}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="history" size={60} color="#94A3B8" />
              <Text style={styles.emptyText}>No hay cambios de sede registrados.</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F5F9' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 45,
    paddingBottom: 15,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: { margin: 0, backgroundColor: '#F1F5F9' },
  headerTitle: { fontSize: 15, fontWeight: '900', color: '#0F172A', letterSpacing: 0.5 },
  refreshBtn: { margin: 0, backgroundColor: '#E3F2FD' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 15, gap: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  iconContainer: {
    backgroundColor: '#E3F2FD',
    padding: 8,
    borderRadius: 6,
  },
  workerName: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  workerDni: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },
  detailsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailCol: { flex: 1 },
  arrowCol: { paddingHorizontal: 10, alignItems: 'center' },
  detailLabel: { fontSize: 9, fontWeight: '800', color: '#94A3B8', marginBottom: 4 },
  detailValue: { fontSize: 12, fontWeight: '900', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, textAlign: 'center', overflow: 'hidden' },
  oldSede: { backgroundColor: '#F1F5F9', color: '#475569' },
  newSede: { backgroundColor: '#E0F2FE', color: '#0369A1' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    paddingTop: 8,
  },
  footerText: { fontSize: 10, color: '#64748B', fontWeight: '500' },
  emptyContainer: { alignItems: 'center', marginTop: 100, gap: 10 },
  emptyText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
});

export default HistoryScreen;
