import React, { useState, useEffect, useRef } from 'react';
import {
  View, StyleSheet, FlatList, TouchableOpacity,
  Alert, ScrollView, Animated, Dimensions,
} from 'react-native';
import {
  Surface, ActivityIndicator, Text, Portal, Modal,
  TextInput, Button, SegmentedButtons, Chip, Divider,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, TIPO_CONFIG } from '../theme/colors';
import DropdownModal from '../components/DropdownModal';
import { API_URL } from '../config';

const { width } = Dimensions.get('window');
const HORARIOS_DIA = ['07:00', '08:00', '09:00', '10:00'];
const HORARIOS_TARDE = ['12:00', '13:00', '14:00', '15:00', '16:00'];
const LIMIT = 10;

// ─── Mini avatar con inicial ─────────────────────────────────────────────────
const WorkerAvatar = ({ worker }) => {
  const tipo = worker.tipo_postulante;
  const cfg = TIPO_CONFIG[tipo] || TIPO_CONFIG.default;
  const initial = (worker.nombres || worker.nombre || '?')[0].toUpperCase();
  return (
    <View style={[styles.avatarCircle, { backgroundColor: cfg.avatar }]}>
      <Text style={styles.avatarText}>{initial}</Text>
    </View>
  );
};

// ─── Badge de tipo ────────────────────────────────────────────────────────────
const TipoBadge = ({ tipo }) => {
  const cfg = TIPO_CONFIG[tipo] || TIPO_CONFIG.default;
  return (
    <View style={[styles.tipoBadge, { backgroundColor: cfg.bg, borderColor: cfg.border, borderWidth: 2 }]}>
      <MaterialCommunityIcons name={cfg.icon} size={15} color={cfg.text} />
      <Text style={[styles.tipoBadgeText, { color: cfg.text }]}>
        {(tipo || 'SIN TIPO').toUpperCase()}
      </Text>
    </View>
  );
};

// ─── Info pill (sede) ─────────────────────────────────────────────────────────
const SedePill = ({ icon, label, value }) => (
  value && value.trim() ? (
    <View style={styles.sedePill}>
      <MaterialCommunityIcons name={icon} size={14} color={COLORS.blue} />
      <Text style={styles.sedePillText} numberOfLines={1}>{value.toUpperCase()}</Text>
    </View>
  ) : null
);

// ─── Card de postulante ───────────────────────────────────────────────────────
const WorkerCard = ({ item, onPress }) => {
  const tipo = item.tipo_postulante;
  const cfg = TIPO_CONFIG[tipo] || TIPO_CONFIG.default;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50 }).start();

  const fullName = item.nombre || `${item.nombres || ''} ${item.ape_pat || ''} ${item.ape_mat || ''}`.trim();
  const turnoLabel = item.turno === 'DIA' ? 'DIURNO' : item.turno === 'TARDE' ? 'TARDE' : item.turno;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => onPress(item)}
      >
        <Surface style={[styles.card, { borderLeftColor: cfg.avatar }]} elevation={1}>
          {/* Fila de encabezado */}
          <View style={styles.cardHeader}>
            <WorkerAvatar worker={item} />
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.cardName} numberOfLines={1}>{fullName.toUpperCase()}</Text>
              <Text style={styles.cardCargo} numberOfLines={1}>
                {(item.cargo || '—').toUpperCase()}
              </Text>
            </View>
            <TipoBadge tipo={tipo} />
          </View>

          <Divider style={styles.cardDivider} />

          {/* Fila de DNI + Turno */}
          <View style={styles.cardMeta}>
            <View style={styles.cardMetaItem}>
              <MaterialCommunityIcons name="card-account-details" size={18} color={COLORS.blue} />
              <Text style={styles.cardMetaText}>{item.dni || item.doc_identidad || '—'}</Text>
            </View>
            {item.turno ? (
              <View style={styles.cardMetaItem}>
                <MaterialCommunityIcons
                  name={item.turno === 'DIA' ? 'weather-sunny' : 'weather-night'}
                  size={18} color={COLORS.orange}
                />
                <Text style={styles.cardMetaText}>{turnoLabel.toUpperCase()}</Text>
              </View>
            ) : null}
            {item.hora_ingreso ? (
              <View style={styles.cardMetaItem}>
                <MaterialCommunityIcons name="clock-fast" size={18} color={COLORS.muted} />
                <Text style={styles.cardMetaText}>{item.hora_ingreso?.substring(0, 5)}</Text>
              </View>
            ) : null}
          </View>

          {/* Fila de sedes */}
          {(item.sede_reg || item.sede_juris) ? (
            <View style={styles.sedeRow}>
              <SedePill icon="map-marker" label="REGIONAL" value={item.sede_reg} />
              {item.sede_reg && item.sede_juris ? (
                <MaterialCommunityIcons name="chevron-right" size={16} color={COLORS.subtle} />
              ) : null}
              <SedePill icon="map-marker-radius" label="JURIS." value={item.sede_juris} />
            </View>
          ) : null}

          {/* Aula + Local */}
          {(item.local || item.area || item.aula) ? (
            <View style={styles.cardFooter}>
              <MaterialCommunityIcons name="office-building-marker" size={16} color={COLORS.muted} />
              <Text style={styles.cardFooterText} numberOfLines={1}>
                {[item.local || item.area, item.aula ? `AULA ${item.aula}` : null]
                  .filter(Boolean).join(' · ').toUpperCase()}
              </Text>
            </View>
          ) : null}
        </Surface>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Paginación ───────────────────────────────────────────────────────────────
const PaginationBar = ({ page, totalPages, onPrev, onNext }) => {
  const PageBtn = ({ icon, onPress, disabled }) => {
    if (disabled) {
      return (
        <View style={[styles.pageBtn, styles.pageBtnDisabled, { borderWidth: 2.5 }]}>
          <MaterialCommunityIcons name={icon} size={24} color={COLORS.subtle} />
        </View>
      );
    }
    return (
      <TouchableOpacity onPress={onPress}>
        <View style={{ width: 43, height: 43, borderRadius: 22, borderWidth: 2.5, borderColor: COLORS.blue, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' }}>
          <MaterialCommunityIcons name={icon} size={24} color={COLORS.blue} />
        </View>
      </TouchableOpacity>
    );
  };

  return totalPages > 1 ? (
    <View style={styles.pagination}>
      <PageBtn icon="chevron-left" onPress={onPrev} disabled={page <= 1} />
      <Text style={styles.pageLabel}>PAG. {page} / {totalPages}</Text>
      <PageBtn icon="chevron-right" onPress={onNext} disabled={page >= totalPages} />
    </View>
  ) : null;
};

// ═══════════════════════════════════════════════════════════════
//  PersonalListScreen
// ═══════════════════════════════════════════════════════════════
const PersonalListScreen = ({ navigation }) => {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [filterTipo, setFilterTipo] = useState('TODOS');
  const [filterCargo, setFilterCargo] = useState('TODOS');
  const [sortOrder, setSortOrder] = useState('ASC');

  const [cargos, setCargos] = useState([]);
  const [userRole, setUserRole] = useState('');

  useEffect(() => {
    const loadUserRole = async () => {
      try {
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

  const [editModal, setEditModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [editForm, setEditForm] = useState({
    sede_reg: '', sede_juris: '', local: '', aula: '',
    cargo_id: '', turno: 'DIA', hora_ingreso: '08:00'
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / LIMIT));
  const currentOffset = (page - 1) * LIMIT;

  useEffect(() => {
    setPage(1);
  }, [filterTipo, filterCargo, sortOrder]);

  useEffect(() => {
    fetchWorkers();
    fetchCargos();
  }, [filterTipo, filterCargo, sortOrder, page]);

  // ── Obtener cargos ──────────────────────────────────────────
  const fetchCargos = async () => {
    try {
      const isOnline = global.dbHelper.isOnline();
      if (!isOnline) {
        const local = await global.dbHelper.getCargos();
        setCargos(local);
        return;
      }
      const token = await AsyncStorage.getItem('userToken');
      const res = await fetch(`${API_URL}/api/config/cargos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setCargos(await res.json());
    } catch {
      try { setCargos(await global.dbHelper.getCargos()); } catch { }
    }
  };

  // ── Obtener postulantes ───────────────────────────────────────
  const fetchWorkers = async () => {
    setLoading(true);
    const offset = (page - 1) * LIMIT;
    const isOnline = global.dbHelper.isOnline();

    try {
      if (!isOnline) {
        const tipoFilter = filterTipo === 'TODOS' ? null : filterTipo;
        const data = await global.dbHelper.getWorkersOffline(LIMIT, offset, tipoFilter);
        let list = data.data || [];
        if (filterCargo !== 'TODOS') list = list.filter(w => w.cargo === filterCargo);
        list.sort((a, b) => {
          const na = `${a.ape_pat} ${a.ape_mat}`.toUpperCase();
          const nb = `${b.ape_pat} ${b.ape_mat}`.toUpperCase();
          return sortOrder === 'ASC' ? na.localeCompare(nb) : nb.localeCompare(na);
        });
        setWorkers(list);
        setTotalCount(data.total || list.length);
        return;
      }

      const token = await AsyncStorage.getItem('userToken');
      let url = `${API_URL}/api/attendance/workers?limit=${LIMIT}&offset=${offset}`;
      if (filterTipo !== 'TODOS') url += `&tipo=${encodeURIComponent(filterTipo)}`;

      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.status === 401 || res.status === 403) {
        await AsyncStorage.multiRemove(['userToken', 'userData']);
        navigation.replace('Login');
        return;
      }
      if (!res.ok) { Alert.alert('Error', 'No se pudo obtener el personal'); return; }

      const data = await res.json();
      let list = data.data || [];
      if (filterCargo !== 'TODOS') list = list.filter(w => w.cargo === filterCargo);
      list.sort((a, b) => {
        const na = `${a.ape_pat} ${a.ape_mat}`.toUpperCase();
        const nb = `${b.ape_pat} ${b.ape_mat}`.toUpperCase();
        return sortOrder === 'ASC' ? na.localeCompare(nb) : nb.localeCompare(na);
      });
      setWorkers(list);
      setTotalCount(data.total || list.length);
    } catch (err) {
      console.error('Error fetching workers:', err);
      try {
        const tipoFilter = filterTipo === 'TODOS' ? null : filterTipo;
        const data = await global.dbHelper.getWorkersOffline(LIMIT, offset, tipoFilter);
        setWorkers(data.data || []);
        setTotalCount(data.total || 0);
      } catch { }
    } finally {
      setLoading(false);
    }
  };

  // ── Edición ──────────────────────────────────────────────────
  const openEdit = (worker) => {
    setSelectedWorker(worker);
    setEditForm({
      sede_reg: worker.sede_reg || '',
      sede_juris: worker.sede_juris || '',
      local: worker.local || worker.area || '',
      aula: worker.aula?.toString() || '',
      cargo_id: worker.cargo_id?.toString() || '',
      turno: worker.turno || 'DIA',
      hora_ingreso: worker.hora_ingreso ? worker.hora_ingreso.substring(0, 5) : '08:00'
    });
    setEditModal(true);
  };

  const saveEdit = async () => {
    const isOnline = global.dbHelper.isOnline();
    if (!isOnline) {
      try {
        await global.dbHelper.updateWorkerOffline(selectedWorker.id, editForm, selectedWorker.dni);
        setEditModal(false);
        fetchWorkers();
        Alert.alert('Guardado', 'Actualizado localmente (Modo Offline)');
      } catch (e) { Alert.alert('Error', e.message); }
      return;
    }
    try {
      const token = await AsyncStorage.getItem('userToken');
      const body = {
        ...editForm,
        cargo_id: editForm.cargo_id ? parseInt(editForm.cargo_id) : null,
        hora_ingreso: editForm.hora_ingreso + ':00',
        aula: editForm.aula ? parseInt(editForm.aula) : 99,
      };
      const res = await fetch(`${API_URL}/api/attendance/workers/${selectedWorker.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // Sincronizar local
        try {
          const db = global.dbHelper.db;
          if (db) {
            await db.runAsync(
              'UPDATE principal SET sede_reg=?, sede_juris=?, local=?, aula=?, cargo_id=?, turno=?, hora_ingreso=? WHERE id=?',
              [editForm.sede_reg, editForm.sede_juris, editForm.local,
              editForm.aula ? parseInt(editForm.aula) : 99,
              editForm.cargo_id ? parseInt(editForm.cargo_id) : null,
              editForm.turno, editForm.hora_ingreso + ':00', selectedWorker.id]
            );
          }
        } catch { }
        setEditModal(false);
        fetchWorkers();
      } else {
        const err = await res.json();
        Alert.alert('Error', err.message || 'No se pudo actualizar');
      }
    } catch (e) {
      Alert.alert('Error de conexión', '¿Guardar localmente?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Guardar Local', onPress: async () => {
            try {
              await global.dbHelper.updateWorkerOffline(selectedWorker.id, editForm, selectedWorker.dni);
              setEditModal(false);
              fetchWorkers();
            } catch (err) { Alert.alert('Error', err.message); }
          }
        }
      ]);
    }
  };

  // ─── Renderización ─────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerAccent} />
          <Text style={styles.headerTitle}>PERSONAL</Text>
        </View>
        <TouchableOpacity
          style={[styles.sortBtn, { borderWidth: 2.5 }]}
          onPress={() => setSortOrder(s => s === 'ASC' ? 'DESC' : 'ASC')}
        >
          <MaterialCommunityIcons
            name={sortOrder === 'ASC' ? 'sort-alphabetical-ascending' : 'sort-alphabetical-descending'}
            size={20} color={COLORS.blue}
          />
          <Text style={styles.sortBtnText}>{sortOrder === 'ASC' ? 'A - Z' : 'Z - A'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tipo switch ─────────────────────────────────────── */}
      <View style={styles.tipoBar}>
        {[
          { key: 'TODOS', label: 'TODOS', color: COLORS.blue },
          { key: 'Titular', label: 'TITULAR', color: COLORS.success },
          { key: 'Reserva', label: 'RESERVA', color: COLORS.orangeDark },
        ].map(({ key, label, color }) => {
          const isActive = filterTipo === key;
          return (
            <TouchableOpacity
              key={key}
              style={{ flex: 1 }}
              onPress={() => setFilterTipo(key)}
              activeOpacity={0.9}
            >
              {isActive ? (
                <View style={{ backgroundColor: color, borderRadius: 20, borderWidth: 2.5, borderColor: color, paddingVertical: 7, alignItems: 'center' }}>
                  <Text style={[styles.tipoBtnText, { color: '#FFF' }]}>{label}</Text>
                </View>
              ) : (
                <View style={[styles.tipoBtn, { borderWidth: 2.5, borderColor: COLORS.border, paddingVertical: 7.5 }]}>
                  <Text style={[styles.tipoBtnText, { color: COLORS.muted }]}>{label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Filtro de cargo mediante DropdownModal ────────────────────────────────── */}
      <View style={styles.cargoBar}>
        <DropdownModal
          label="Cargo"
          value={filterCargo}
          displayText={filterCargo === 'TODOS' ? 'TODOS LOS CARGOS' : filterCargo.toUpperCase()}
          options={[{ value: 'TODOS', label: 'TODOS LOS CARGOS' }, ...cargos.map(c => ({ value: c.nombre, label: c.nombre }))]}
          onSelect={(val) => { setFilterCargo(val); }}
          activeColor={COLORS.blue}
          style={styles.cargoHeader}
        />
      </View>

      {/* ── Lista ───────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator animating color={COLORS.blue} size="large" />
          <Text style={styles.loadingText}>Cargando personal...</Text>
        </View>
      ) : workers.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="account-search" size={64} color={COLORS.border} />
          <Text style={styles.emptyTitle}>Sin resultados</Text>
          <Text style={styles.emptyText}>No hay postulantes para los filtros seleccionados</Text>
        </View>
      ) : (
        <FlatList
          data={workers}
          keyExtractor={item => (item.dni || item.doc_identidad || item.id?.toString() || Math.random().toString())}
          renderItem={({ item }) => <WorkerCard item={item} onPress={openEdit} />}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={() => (
            <PaginationBar
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage(p => Math.max(1, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages, p + 1))}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Modal de edición ─────────────────────────────────── */}
      <Portal>
        <Modal visible={editModal} onDismiss={() => setEditModal(false)} contentContainerStyle={styles.modal}>
          <View style={styles.modalHeader}>
            <View style={[styles.headerAccent, { marginRight: 8 }]} />
            <Text style={styles.modalTitle}>EDITAR POSTULANTE</Text>
          </View>

          {selectedWorker && (
            <View style={styles.modalWorkerInfo}>
              <WorkerAvatar worker={selectedWorker} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.modalWorkerName} numberOfLines={2}>
                  {(() => {
                    const fullName = (selectedWorker.nombres || selectedWorker.ape_pat || selectedWorker.ape_mat)
                      ? `${selectedWorker.nombres || ''} ${selectedWorker.ape_pat || ''} ${selectedWorker.ape_mat || ''}`.trim()
                      : (selectedWorker.nombre || '');
                    return fullName.toUpperCase();
                  })()}
                </Text>
                <Text style={{ color: COLORS.inkLight, fontSize: 11, fontWeight: '800', marginTop: 3, marginBottom: 4 }}>
                  DNI: {selectedWorker.dni || selectedWorker.doc_identidad || '—'}
                </Text>
                <TipoBadge tipo={selectedWorker.tipo_postulante} />
              </View>
            </View>
          )}

          <ScrollView 
            style={{ maxHeight: 380 }} 
            showsVerticalScrollIndicator
          >
            {[
              { label: 'Sede Regional', key: 'sede_reg', icon: 'map-marker', disabled: userRole?.toLowerCase() !== 'su' && userRole?.toLowerCase() !== 'admin' },
              { label: 'Sede Jurisdiccional', key: 'sede_juris', icon: 'map-marker-radius' },
              { label: 'Local', key: 'local', icon: 'office-building-marker' },
              { label: 'Aula', key: 'aula', icon: 'door', numeric: true },
            ].map(field => (
              <TextInput
                key={field.key}
                label={field.label}
                value={editForm[field.key]}
                onChangeText={t => setEditForm({ ...editForm, [field.key]: t })}
                mode="outlined"
                keyboardType={field.numeric ? 'numeric' : 'default'}
                style={styles.input}
                textColor={COLORS.ink}
                activeOutlineColor={COLORS.blue}
                outlineColor={COLORS.border}
                left={<TextInput.Icon icon={field.icon} color={COLORS.blue} />}
                disabled={field.disabled}
              />
            ))}

            <Text style={styles.fieldLabel}>CARGO</Text>
            <DropdownModal
              label="Cargo"
              value={editForm.cargo_id}
              displayText={cargos.find(c => c.id.toString() === editForm.cargo_id?.toString())?.nombre || 'Seleccione Cargo'}
              options={cargos.map(c => ({ value: c.id.toString(), label: c.nombre }))}
              onSelect={(val) => setEditForm({ ...editForm, cargo_id: val })}
              activeColor={COLORS.blue}
              style={{ marginBottom: 10 }}
            />

            <Text style={styles.fieldLabel}>TURNO</Text>
            <SegmentedButtons
              value={editForm.turno}
              onValueChange={v => setEditForm({ ...editForm, turno: v, hora_ingreso: v === 'DIA' ? '08:00' : '12:00' })}
              buttons={[
                { label: 'Diurno', value: 'DIA', icon: 'weather-sunny' },
                { label: 'Tarde', value: 'TARDE', icon: 'weather-night' },
              ]}
              style={{ marginBottom: 10 }}
              theme={{ colors: { secondaryContainer: COLORS.blue, onSecondaryContainer: '#FFF' } }}
            />

            <Text style={styles.fieldLabel}>HORA DE INGRESO</Text>
            <DropdownModal
              label="Hora de Ingreso"
              value={editForm.hora_ingreso}
              displayText={editForm.hora_ingreso}
              options={(editForm.turno === 'DIA' ? HORARIOS_DIA : HORARIOS_TARDE).map(h => ({
                value: h,
                label: h,
                icon: 'clock-outline',
              }))}
              onSelect={(h) => setEditForm({ ...editForm, hora_ingreso: h })}
              activeColor={COLORS.blue}
              style={styles.horaHeader}
            />
          </ScrollView>

          <View style={styles.modalActions}>
            <Button textColor={COLORS.muted} labelStyle={{ fontWeight: '900' }} onPress={() => setEditModal(false)}>CANCELAR</Button>
            <TouchableOpacity 
              onPress={saveEdit}
              style={{ borderWidth: 2.5, borderColor: COLORS.blue, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <MaterialCommunityIcons name="content-save" size={20} color={COLORS.blue} />
              <Text style={{ color: COLORS.blue, fontWeight: '900', fontSize: 13, letterSpacing: 0.5 }}>GUARDAR</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </Portal>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════
//  Styles
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // ── Header ──────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: COLORS.blue,
    elevation: 2,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerAccent: {
    width: 6, height: 22, borderRadius: 3,
    backgroundColor: COLORS.blue, marginRight: 8,
  },
  headerTitle: {
    color: COLORS.ink, fontSize: 16, fontWeight: '900',
    letterSpacing: 1.2,
  },
  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.blueSoft,
    borderWidth: 2.5, borderColor: COLORS.blueBorder,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
  },
  sortBtnText: { color: COLORS.blue, fontSize: 12, fontWeight: '800' },

  // ── Tipo bar ─────────────────────────────────────────────────
  tipoBar: {
    flexDirection: 'row', gap: 8,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1.5, borderBottomColor: COLORS.border,
  },
  tipoBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 20,
    borderWidth: 2.5, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, alignItems: 'center',
  },
  tipoBtnText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },

  // ── Cargo bar ─────────────────────────────────────────────────
  cargoBar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1.5, borderBottomColor: COLORS.border,
    zIndex: 20,
  },
  cargoHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.blueSoft,
    borderWidth: 2.5, borderColor: COLORS.blueBorder,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9,
  },
  cargoHeaderText: { flex: 1, color: COLORS.blue, fontSize: 13, fontWeight: '800' },
  cargoList: {
    backgroundColor: COLORS.white,
    borderRadius: 8, borderWidth: 2, borderColor: COLORS.border,
    marginTop: 4, overflow: 'hidden',
  },
  cargoOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1.5, borderBottomColor: COLORS.surface,
  },
  cargoOptionActive: { backgroundColor: COLORS.blue },

  // ── Lista ────────────────────────────────────────────────────
  listContent: { padding: 14, paddingBottom: 30, gap: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  loadingText: { color: COLORS.muted, marginTop: 12, fontSize: 13, fontWeight: '800' },
  emptyTitle: { color: COLORS.inkLight, fontSize: 16, fontWeight: '900', marginTop: 12 },
  emptyText: { color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 4, fontWeight: '700' },

  // ── Card ─────────────────────────────────────────────────────
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderLeftWidth: 6,
    borderLeftColor: COLORS.blue,
    overflow: 'hidden',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 8,
  },
  cardHeaderInfo: { flex: 1 },
  cardName: {
    color: COLORS.ink, fontSize: 14, fontWeight: '900',
    letterSpacing: 0.1,
  },
  cardCargo: {
    color: COLORS.muted, fontSize: 11, fontWeight: '800',
    marginTop: 2, letterSpacing: 0.2,
  },
  cardDivider: { backgroundColor: COLORS.surface, marginBottom: 8, height: 1.5 },
  cardMeta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 6 },
  cardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMetaText: { color: COLORS.inkLight, fontSize: 12, fontWeight: '800' },

  sedeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: 6, flexWrap: 'wrap',
  },
  sedePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.blueSoft,
    borderWidth: 2, borderColor: COLORS.blueBorder,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
    maxWidth: width * 0.42,
  },
  sedePillText: {
    color: COLORS.blue, fontSize: 10, fontWeight: '800',
    letterSpacing: 0.2, flexShrink: 1,
  },

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardFooterText: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },

  // ── Tipo badge ────────────────────────────────────────────────
  tipoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 2.5, alignSelf: 'flex-start',
  },
  tipoBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  // ── Avatar ────────────────────────────────────────────────────
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: '900' },

  // ── Paginación ───────────────────────────────────────────────
  pagination: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 16, paddingVertical: 12,
  },
  pageBtn: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.white, borderWidth: 2.5, borderColor: COLORS.blueBorder,
  },
  pageBtnDisabled: { borderColor: COLORS.border, backgroundColor: COLORS.surface },
  pageLabel: { color: COLORS.inkLight, fontSize: 13, fontWeight: '900' },

  // ── Edit Modal ────────────────────────────────────────────────
  modal: {
    backgroundColor: COLORS.white,
    padding: 20, margin: 16,
    borderRadius: 16,
    borderTopWidth: 5, borderTopColor: COLORS.blue,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  modalTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '900', letterSpacing: 0.8 },
  modalWorkerInfo: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.blueSoft,
    borderRadius: 10, padding: 12, marginBottom: 14,
    borderWidth: 2, borderColor: COLORS.blueBorder,
  },
  modalWorkerName: { color: COLORS.ink, fontWeight: '900', fontSize: 14 },
  input: { backgroundColor: COLORS.surface, marginBottom: 8, height: 46 },
  fieldLabel: {
    color: COLORS.muted, fontSize: 10, fontWeight: '900',
    letterSpacing: 0.8, marginBottom: 5, marginTop: 6,
    textTransform: 'uppercase',
  },
  cargoPickerContainer: {
    borderRadius: 8, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, marginBottom: 10, overflow: 'hidden',
  },
  cargoPickerOpt: {
    padding: 10, borderBottomWidth: 1.5, borderBottomColor: COLORS.surface,
  },
  cargoPickerOptActive: { backgroundColor: COLORS.blue },
  horaHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4,
  },
  horaHeaderText: { flex: 1, color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  horaList: {
    borderRadius: 8, borderWidth: 2, borderColor: COLORS.border,
    backgroundColor: COLORS.white, marginBottom: 10, overflow: 'hidden',
  },
  horaOption: {
    padding: 11, borderBottomWidth: 1.5, borderBottomColor: COLORS.surface,
  },
  horaOptionActive: { backgroundColor: COLORS.blue },
  modalActions: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 12,
  },
});

export default PersonalListScreen;
