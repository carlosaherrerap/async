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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, TIPO_CONFIG } from '../theme/colors';

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
    <View style={[styles.tipoBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      <MaterialCommunityIcons name={cfg.icon} size={11} color={cfg.text} />
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
      <MaterialCommunityIcons name={icon} size={11} color={COLORS.blue} />
      <Text style={styles.sedePillText} numberOfLines={1}>{value}</Text>
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
          {/* Header row */}
          <View style={styles.cardHeader}>
            <WorkerAvatar worker={item} />
            <View style={styles.cardHeaderInfo}>
              <Text style={styles.cardName} numberOfLines={1}>{fullName}</Text>
              <Text style={styles.cardCargo} numberOfLines={1}>
                {item.cargo || '—'}
              </Text>
            </View>
            <TipoBadge tipo={tipo} />
          </View>

          <Divider style={styles.cardDivider} />

          {/* DNI + Turno row */}
          <View style={styles.cardMeta}>
            <View style={styles.cardMetaItem}>
              <MaterialCommunityIcons name="card-account-details" size={13} color={COLORS.blue} />
              <Text style={styles.cardMetaText}>{item.dni || item.doc_identidad || '—'}</Text>
            </View>
            {item.turno ? (
              <View style={styles.cardMetaItem}>
                <MaterialCommunityIcons
                  name={item.turno === 'DIA' ? 'weather-sunny' : 'weather-night'}
                  size={13} color={COLORS.orange}
                />
                <Text style={styles.cardMetaText}>{turnoLabel}</Text>
              </View>
            ) : null}
            {item.hora_ingreso ? (
              <View style={styles.cardMetaItem}>
                <MaterialCommunityIcons name="clock-fast" size={13} color={COLORS.muted} />
                <Text style={styles.cardMetaText}>{item.hora_ingreso?.substring(0, 5)}</Text>
              </View>
            ) : null}
          </View>

          {/* Sedes row */}
          {(item.sede_reg || item.sede_juris) ? (
            <View style={styles.sedeRow}>
              <SedePill icon="map-marker" label="REGIONAL" value={item.sede_reg} />
              {item.sede_reg && item.sede_juris ? (
                <MaterialCommunityIcons name="chevron-right" size={13} color={COLORS.subtle} />
              ) : null}
              <SedePill icon="map-marker-radius" label="JURIS." value={item.sede_juris} />
            </View>
          ) : null}

          {/* Aula + Local */}
          {(item.local || item.area || item.aula) ? (
            <View style={styles.cardFooter}>
              <MaterialCommunityIcons name="office-building-marker" size={12} color={COLORS.muted} />
              <Text style={styles.cardFooterText} numberOfLines={1}>
                {[item.local || item.area, item.aula ? `Aula ${item.aula}` : null]
                  .filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}
        </Surface>
      </TouchableOpacity>
    </Animated.View>
  );
};

// ─── Paginación ───────────────────────────────────────────────────────────────
const PaginationBar = ({ page, totalPages, onPrev, onNext }) => (
  totalPages > 1 ? (
    <View style={styles.pagination}>
      <TouchableOpacity
        style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
        onPress={onPrev} disabled={page <= 1}
      >
        <MaterialCommunityIcons name="chevron-left" size={20} color={page > 1 ? COLORS.blue : COLORS.subtle} />
      </TouchableOpacity>
      <Text style={styles.pageLabel}>Pág. {page} / {totalPages}</Text>
      <TouchableOpacity
        style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
        onPress={onNext} disabled={page >= totalPages}
      >
        <MaterialCommunityIcons name="chevron-right" size={20} color={page < totalPages ? COLORS.blue : COLORS.subtle} />
      </TouchableOpacity>
    </View>
  ) : null
);

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
  const [cargoDropdownOpen, setCargoDropdownOpen] = useState(false);
  const [horarioDropdownOpen, setHorarioDropdownOpen] = useState(false);

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

  // ── Fetch cargos ────────────────────────────────────────────
  const fetchCargos = async () => {
    try {
      const isOnline = global.dbHelper.isOnline();
      if (!isOnline) {
        const local = await global.dbHelper.getCargos();
        setCargos(local);
        return;
      }
      const token = await AsyncStorage.getItem('userToken');
      const res = await fetch('https://backend-6oio.onrender.com/api/config/cargos', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setCargos(await res.json());
    } catch {
      try { setCargos(await global.dbHelper.getCargos()); } catch { }
    }
  };

  // ── Fetch workers ───────────────────────────────────────────
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
      let url = `https://backend-6oio.onrender.com/api/attendance/workers?limit=${LIMIT}&offset=${offset}`;
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
    setHorarioDropdownOpen(false);
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
      const res = await fetch(`https://backend-6oio.onrender.com/api/attendance/workers/${selectedWorker.id}`, {
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

  // ─── Render ────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerAccent} />
          <Text style={styles.headerTitle}>PERSONAL</Text>
        </View>
        <TouchableOpacity
          style={styles.sortBtn}
          onPress={() => setSortOrder(s => s === 'ASC' ? 'DESC' : 'ASC')}
        >
          <MaterialCommunityIcons
            name={sortOrder === 'ASC' ? 'sort-alphabetical-ascending' : 'sort-alphabetical-descending'}
            size={16} color={COLORS.blue}
          />
          <Text style={styles.sortBtnText}>{sortOrder === 'ASC' ? 'A → Z' : 'Z → A'}</Text>
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
              style={[styles.tipoBtn, isActive && { backgroundColor: color, borderColor: color }]}
              onPress={() => setFilterTipo(key)}
            >
              <Text style={[styles.tipoBtnText, { color: isActive ? '#FFF' : COLORS.muted }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Cargo dropdown ──────────────────────────────────── */}
      <View style={styles.cargoBar}>
        <TouchableOpacity
          style={styles.cargoHeader}
          onPress={() => setCargoDropdownOpen(!cargoDropdownOpen)}
        >
          <MaterialCommunityIcons name="briefcase" size={15} color={COLORS.blue} />
          <Text style={styles.cargoHeaderText} numberOfLines={1}>
            {filterCargo === 'TODOS' ? 'Todos los Cargos' : filterCargo}
          </Text>
          <MaterialCommunityIcons
            name={cargoDropdownOpen ? 'chevron-up' : 'chevron-down'}
            size={18} color={COLORS.blue}
          />
        </TouchableOpacity>
        {cargoDropdownOpen && (
          <Surface style={styles.cargoList} elevation={4}>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              {[{ id: 0, nombre: 'TODOS' }, ...cargos].map(c => {
                const isSelected = filterCargo === c.nombre;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.cargoOption, isSelected && styles.cargoOptionActive]}
                    onPress={() => { setFilterCargo(c.nombre); setCargoDropdownOpen(false); }}
                  >
                    {isSelected && <MaterialCommunityIcons name="check-circle" size={14} color="#FFF" style={{ marginRight: 6 }} />}
                    <Text style={{ color: isSelected ? '#FFF' : COLORS.ink, fontSize: 13, fontWeight: isSelected ? 'bold' : 'normal' }}>
                      {c.nombre}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Surface>
        )}
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

      {/* ── Edit Modal ──────────────────────────────────────── */}
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
                <Text style={styles.modalWorkerName} numberOfLines={1}>
                  {selectedWorker.nombre || `${selectedWorker.nombres} ${selectedWorker.ape_pat}`}
                </Text>
                <TipoBadge tipo={selectedWorker.tipo_postulante} />
              </View>
            </View>
          )}

          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator>
            {[
              { label: 'Sede Regional', key: 'sede_reg', icon: 'map-marker' },
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
              />
            ))}

            <Text style={styles.fieldLabel}>CARGO</Text>
            <View style={styles.cargoPickerContainer}>
              <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled>
                {cargos.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.cargoPickerOpt, editForm.cargo_id?.toString() === c.id.toString() && styles.cargoPickerOptActive]}
                    onPress={() => setEditForm({ ...editForm, cargo_id: c.id.toString() })}
                  >
                    <Text style={{ color: editForm.cargo_id?.toString() === c.id.toString() ? '#FFF' : COLORS.ink, fontSize: 13 }}>
                      {c.nombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

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
            <TouchableOpacity
              style={styles.horaHeader}
              onPress={() => setHorarioDropdownOpen(!horarioDropdownOpen)}
            >
              <MaterialCommunityIcons name="clock-fast" size={18} color={COLORS.blue} />
              <Text style={styles.horaHeaderText}>{editForm.hora_ingreso}</Text>
              <MaterialCommunityIcons name={horarioDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.blue} />
            </TouchableOpacity>
            {horarioDropdownOpen && (
              <Surface style={styles.horaList} elevation={2}>
                {(editForm.turno === 'DIA' ? HORARIOS_DIA : HORARIOS_TARDE).map(h => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.horaOption, editForm.hora_ingreso === h && styles.horaOptionActive]}
                    onPress={() => { setEditForm({ ...editForm, hora_ingreso: h }); setHorarioDropdownOpen(false); }}
                  >
                    <Text style={{ color: editForm.hora_ingreso === h ? '#FFF' : COLORS.ink, fontWeight: editForm.hora_ingreso === h ? 'bold' : 'normal' }}>{h}</Text>
                  </TouchableOpacity>
                ))}
              </Surface>
            )}
          </ScrollView>

          <View style={styles.modalActions}>
            <Button textColor={COLORS.muted} onPress={() => setEditModal(false)}>CANCELAR</Button>
            <Button
              mode="contained"
              buttonColor={COLORS.blue}
              textColor="#FFF"
              onPress={saveEdit}
              icon="content-save"
            >
              GUARDAR
            </Button>
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
    borderBottomWidth: 2,
    borderBottomColor: COLORS.blue,
    elevation: 2,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerAccent: {
    width: 4, height: 20, borderRadius: 2,
    backgroundColor: COLORS.blue, marginRight: 8,
  },
  headerTitle: {
    color: COLORS.ink, fontSize: 15, fontWeight: '800',
    letterSpacing: 1.2,
  },
  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.blueSoft,
    borderWidth: 1, borderColor: COLORS.blueBorder,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
  },
  sortBtnText: { color: COLORS.blue, fontSize: 12, fontWeight: '700' },

  // ── Tipo bar ─────────────────────────────────────────────────
  tipoBar: {
    flexDirection: 'row', gap: 8,
    backgroundColor: COLORS.white,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  tipoBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, alignItems: 'center',
  },
  tipoBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  // ── Cargo bar ─────────────────────────────────────────────────
  cargoBar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    zIndex: 20,
  },
  cargoHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.blueSoft,
    borderWidth: 1, borderColor: COLORS.blueBorder,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9,
  },
  cargoHeaderText: { flex: 1, color: COLORS.blue, fontSize: 13, fontWeight: '700' },
  cargoList: {
    backgroundColor: COLORS.white,
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
    marginTop: 4, overflow: 'hidden',
  },
  cargoOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: COLORS.surface,
  },
  cargoOptionActive: { backgroundColor: COLORS.blue },

  // ── List ─────────────────────────────────────────────────────
  listContent: { padding: 14, paddingBottom: 30, gap: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  loadingText: { color: COLORS.muted, marginTop: 12, fontSize: 13 },
  emptyTitle: { color: COLORS.inkLight, fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptyText: { color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 4 },

  // ── Card ─────────────────────────────────────────────────────
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderLeftWidth: 4,
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
    color: COLORS.ink, fontSize: 14, fontWeight: '800',
    letterSpacing: 0.1,
  },
  cardCargo: {
    color: COLORS.muted, fontSize: 11, fontWeight: '600',
    marginTop: 2, letterSpacing: 0.2,
  },
  cardDivider: { backgroundColor: COLORS.surface, marginBottom: 8 },
  cardMeta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 6 },
  cardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMetaText: { color: COLORS.inkLight, fontSize: 12, fontWeight: '600' },

  sedeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: 6, flexWrap: 'wrap',
  },
  sedePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.blueSoft,
    borderWidth: 1, borderColor: COLORS.blueBorder,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
    maxWidth: width * 0.42,
  },
  sedePillText: {
    color: COLORS.blue, fontSize: 10, fontWeight: '700',
    letterSpacing: 0.2, flexShrink: 1,
  },

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardFooterText: { color: COLORS.muted, fontSize: 11 },

  // ── Tipo badge ────────────────────────────────────────────────
  tipoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1, alignSelf: 'flex-start',
  },
  tipoBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // ── Avatar ────────────────────────────────────────────────────
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: '800' },

  // ── Pagination ────────────────────────────────────────────────
  pagination: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 16, paddingVertical: 12,
  },
  pageBtn: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.blueBorder,
  },
  pageBtnDisabled: { borderColor: COLORS.border, backgroundColor: COLORS.surface },
  pageLabel: { color: COLORS.inkLight, fontSize: 13, fontWeight: '700' },

  // ── Edit Modal ────────────────────────────────────────────────
  modal: {
    backgroundColor: COLORS.white,
    padding: 20, margin: 16,
    borderRadius: 16,
    borderTopWidth: 4, borderTopColor: COLORS.blue,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  modalTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '800', letterSpacing: 0.8 },
  modalWorkerInfo: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.blueSoft,
    borderRadius: 10, padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.blueBorder,
  },
  modalWorkerName: { color: COLORS.ink, fontWeight: '700', fontSize: 14 },
  input: { backgroundColor: COLORS.surface, marginBottom: 8, height: 46 },
  fieldLabel: {
    color: COLORS.muted, fontSize: 10, fontWeight: '800',
    letterSpacing: 0.8, marginBottom: 5, marginTop: 6,
    textTransform: 'uppercase',
  },
  cargoPickerContainer: {
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, marginBottom: 10, overflow: 'hidden',
  },
  cargoPickerOpt: {
    padding: 10, borderBottomWidth: 1, borderBottomColor: COLORS.surface,
  },
  cargoPickerOptActive: { backgroundColor: COLORS.blue },
  horaHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4,
  },
  horaHeaderText: { flex: 1, color: COLORS.ink, fontSize: 14, fontWeight: '700' },
  horaList: {
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.white, marginBottom: 10, overflow: 'hidden',
  },
  horaOption: {
    padding: 11, borderBottomWidth: 1, borderBottomColor: COLORS.surface,
  },
  horaOptionActive: { backgroundColor: COLORS.blue },
  modalActions: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12,
  },
});

export default PersonalListScreen;
