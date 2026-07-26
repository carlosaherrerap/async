import React, { useState, useEffect } from 'react';
import {
  View, StyleSheet, Text, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions
} from 'react-native';
import { Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { COLORS, TIPO_CONFIG } from '../theme/colors';
import { API_URL } from '../config';

const { width } = Dimensions.get('window');

// ─── Mini avatar ──────────────────────────────────────────────────────────────
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
    <View style={[styles.tipoBadge, { backgroundColor: cfg.bg, borderColor: cfg.border, borderWidth: 1.5 }]}>
      <MaterialCommunityIcons name={cfg.icon} size={13} color={cfg.text} />
      <Text style={[styles.tipoBadgeText, { color: cfg.text }]}>
        {(tipo || 'SIN TIPO').toUpperCase()}
      </Text>
    </View>
  );
};

// ─── Pill de Sede ─────────────────────────────────────────────────────────────
const SedePill = ({ icon, value }) => (
  value && value.trim() ? (
    <View style={styles.sedePill}>
      <MaterialCommunityIcons name={icon} size={12} color={COLORS.blue} />
      <Text style={styles.sedePillText} numberOfLines={1}>{value.toUpperCase()}</Text>
    </View>
  ) : null
);

const StatDetailScreen = ({ route, navigation }) => {
  const {
    type = 'faltas',
    title = 'FALTAS DE HOY',
    color = COLORS.danger,
    shift = 'dia',
    filterSede = 'TODOS'
  } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchDni, setSearchDni] = useState('');
  const [dataList, setDataList] = useState([]);

  useEffect(() => {
    navigation.setOptions({
      title: title.toUpperCase(),
      headerStyle: { backgroundColor: color, elevation: 0, shadowOpacity: 0 },
    });
    fetchData();
  }, [type, shift, filterSede]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
      let rawData = null;

      const netState = await NetInfo.fetch();
      const online = !!netState.isConnected;

      if (online) {
        try {
          const token = await AsyncStorage.getItem('userToken');
          const res = await fetch(`${API_URL}/api/asistencia/reporte-diario?date=${today}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            rawData = await res.json();
          }
        } catch (fetchErr) {
          console.log('Error fetch online, fallback SQLite:', fetchErr);
        }
      }

      if (!rawData) {
        rawData = await global.dbHelper.getDailyAttendance(today);
      }

      const presentes = rawData?.presentes || [];
      const ausentes = rawData?.ausentes || [];
      const todayStr = today;

      // Helper para verificar marcacion_2 válida hoy
      const hasMarcacion2Hoy = (item) => {
        const m2 = item.marcacion_2;
        return m2 && m2 !== '0' && m2 !== 'null' && m2.substring(0, 10) === todayStr;
      };

      // Consolidar todos los postulantes combinando presentes y ausentes sin duplicados
      const allWorkersMap = new Map();
      
      presentes.forEach(p => {
        allWorkersMap.set(p.id, { ...p, isPresentIn1stTurn: true });
      });

      ausentes.forEach(a => {
        if (!allWorkersMap.has(a.id)) {
          allWorkersMap.set(a.id, { ...a, isPresentIn1stTurn: false });
        }
      });

      const allWorkers = Array.from(allWorkersMap.values());

      // 1. Filtrar por Turno (DÍA vs TARDE)
      const shiftFiltered = allWorkers.filter(item => {
        const condStr = String(item.condicion ?? 1).trim();
        const hora1 = item.hora_ingreso || '08:00';
        const h1 = parseInt(hora1.split(':')[0], 10);

        if (shift === 'tarde') {
          // En turno TARDE: entran los que tienen hora_ingreso >= 13 O los de condicion=2
          return h1 >= 13 || condStr === '2';
        } else {
          // En turno DÍA: entran los que tienen hora_ingreso < 13
          return h1 < 13;
        }
      });

      // 2. Filtrar por Sede Regional
      const sedeFiltered = shiftFiltered.filter(item => {
        if (!filterSede || filterSede === 'TODOS') return true;
        const s = item.sede_regional || item.sede_reg || '';
        return s === filterSede;
      });

      // 3. Categorizar según tipo (presentes, faltas, tardanzas, temprano)
      let finalResult = [];

      if (shift === 'tarde') {
        if (type === 'faltas') {
          // FALTAS en Turno Tarde:
          // - Si condicion=2: FALTA si NO tiene marcacion_2 hoy (incluso si marcó 1er turno)
          // - Si condicion=1: FALTA si NO tiene marcación en asistencias
          finalResult = sedeFiltered.filter(item => {
            const isCond2 = String(item.condicion ?? 1).trim() === '2';
            if (isCond2) {
              return !hasMarcacion2Hoy(item);
            } else {
              return !item.isPresentIn1stTurn;
            }
          }).sort((a, b) => (a.ape_pat || '').localeCompare(b.ape_pat || ''));
        } else {
          // PRESENTES / TARDANZAS / TEMPRANO en Turno Tarde:
          // - Si condicion=2: PRESENTES sólo si tiene marcacion_2 hoy
          // - Si condicion=1: PRESENTES si tiene registro en asistencias
          const presentesTarde = sedeFiltered.filter(item => {
            const isCond2 = String(item.condicion ?? 1).trim() === '2';
            if (isCond2) {
              return hasMarcacion2Hoy(item);
            } else {
              return item.isPresentIn1stTurn;
            }
          });

          if (type === 'tardanzas') {
            finalResult = presentesTarde.filter(item => {
              const isCond2 = String(item.condicion ?? 1).trim() === '2';
              const est = isCond2 ? item.estado_turno_2 : item.estado;
              return est === 'T';
            });
          } else if (type === 'temprano') {
            finalResult = presentesTarde.filter(item => {
              const isCond2 = String(item.condicion ?? 1).trim() === '2';
              const est = isCond2 ? item.estado_turno_2 : item.estado;
              return est === 'P';
            });
          } else {
            // presentes
            finalResult = presentesTarde;
          }

          // Ordenar por hora de marcación descendente (más reciente primero)
          finalResult.sort((a, b) => {
            const timeA = String(a.condicion ?? 1).trim() === '2' ? (a.marcacion_2 || a.fecha_hora) : a.fecha_hora;
            const timeB = String(b.condicion ?? 1).trim() === '2' ? (b.marcacion_2 || b.fecha_hora) : b.fecha_hora;
            return new Date(timeB) - new Date(timeA);
          });
        }
      } else {
        // shift === 'dia'
        if (type === 'faltas') {
          finalResult = sedeFiltered.filter(item => !item.isPresentIn1stTurn)
            .sort((a, b) => (a.ape_pat || '').localeCompare(b.ape_pat || ''));
        } else {
          const presentesDia = sedeFiltered.filter(item => item.isPresentIn1stTurn);
          if (type === 'tardanzas') {
            finalResult = presentesDia.filter(item => item.estado === 'T');
          } else if (type === 'temprano') {
            finalResult = presentesDia.filter(item => item.estado === 'P');
          } else {
            finalResult = presentesDia;
          }

          finalResult.sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
        }
      }

      setDataList(finalResult);
    } catch (e) {
      console.error('Error fetching stat detail:', e);
      setDataList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Filtrar por DNI o Nombre con la barra de búsqueda
  const filteredList = dataList.filter(item => {
    if (!searchDni.trim()) return true;
    const query = searchDni.trim().toLowerCase();
    const dniStr = String(item.dni || item.doc_identidad || '').toLowerCase();
    const fullName = `${item.nombres || ''} ${item.ape_pat || ''} ${item.ape_mat || ''}`.toLowerCase();
    return dniStr.includes(query) || fullName.includes(query);
  });

  const renderCard = (item) => {
    const isCond2 = String(item.condicion ?? 1).trim() === '2';
    const tipo = item.tipo_postulante;
    const cfg = TIPO_CONFIG[tipo] || TIPO_CONFIG.default;
    const fullName = `${item.nombres || ''} ${item.ape_pat || ''} ${item.ape_mat || ''}`.trim();

    // Determinar estado P / T
    const estadoActual = (shift === 'tarde' && isCond2) ? (item.estado_turno_2 || 'P') : item.estado;
    const isPuntual = estadoActual === 'P';
    const statusColor = isPuntual ? '#2563EB' : '#F1C40F';
    const statusLabel = isPuntual ? 'TEMPRANO' : 'TARDE';

    // Determinar hora de marcación a mostrar
    let marcacionDisplay = null;
    if (shift === 'tarde' && isCond2) {
      const m2Raw = item.marcacion_2;
      if (m2Raw && m2Raw !== '0' && m2Raw !== 'null') {
        marcacionDisplay = new Date(m2Raw.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    } else if (item.fecha_hora) {
      marcacionDisplay = new Date(item.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const isFalta = type === 'faltas';
    const borderAccentColor = isFalta ? '#DC2626' : cfg.avatar;

    return (
      <Surface key={`${item.id}-${item.dni}`} style={[styles.card, { borderLeftColor: borderAccentColor }]} elevation={1}>
        {/* Encabezado: Avatar + Nombre + Cargo + Badge */}
        <View style={styles.cardHeader}>
          <WorkerAvatar worker={item} />
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{fullName.toUpperCase()}</Text>
            <Text style={styles.cardCargo} numberOfLines={1}>
              {(item.cargo || '—').toUpperCase()}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <TipoBadge tipo={tipo} />
            {!isFalta && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: statusColor + '18', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <MaterialCommunityIcons name={isPuntual ? 'clock-check' : 'clock-alert'} size={12} color={statusColor} />
                <Text style={{ color: statusColor, fontWeight: 'bold', fontSize: 10 }}>
                  {statusLabel}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.cardDivider} />

        {/* Fila Meta: DNI + Turno + Horas programadas */}
        <View style={styles.cardMeta}>
          <View style={styles.cardMetaItem}>
            <MaterialCommunityIcons name="card-account-details" size={16} color={COLORS.blue} />
            <Text style={styles.cardMetaText}>{item.dni || item.doc_identidad || '—'}</Text>
          </View>

          {item.turno ? (
            <View style={styles.cardMetaItem}>
              <MaterialCommunityIcons
                name={item.turno === 'DIA' ? 'weather-sunny' : 'weather-night'}
                size={16} color={COLORS.orange}
              />
              <Text style={styles.cardMetaText}>{(item.turno === 'DIA' ? 'DIURNO' : item.turno).toUpperCase()}</Text>
            </View>
          ) : null}

          {/* Hora programada 1er turno */}
          {item.hora_ingreso && item.hora_ingreso !== '0' && item.hora_ingreso !== '00:00' && (
            <View style={[styles.cardMetaItem, styles.horaPill]}>
              <MaterialCommunityIcons name="clock-outline" size={13} color={COLORS.blue} />
              <Text style={styles.horaPillText}>{item.hora_ingreso.substring(0, 5)}</Text>
            </View>
          )}

          {/* Hora programada 2do turno */}
          {isCond2 && (
            <View style={[styles.cardMetaItem, styles.horaPill, styles.horaPillTurno2]}>
              <MaterialCommunityIcons name="clock-fast" size={13} color="#7C3AED" />
              <Text style={[styles.horaPillText, { color: '#7C3AED' }]}>
                {(item.hora_ingreso_2 && item.hora_ingreso_2 !== '0') ? item.hora_ingreso_2.substring(0, 5) : '13:00'}
              </Text>
            </View>
          )}

          {/* Timestamp real de marcación */}
          {marcacionDisplay && (
            <View style={[styles.cardMetaItem, { backgroundColor: '#D1FAE5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }]}>
              <MaterialCommunityIcons name="check-circle" size={13} color="#15803D" />
              <Text style={[styles.horaPillText, { color: '#15803D', fontSize: 10 }]}>
                {isCond2 && shift === 'tarde' ? `2T: ${marcacionDisplay}` : `MARCA: ${marcacionDisplay}`}
              </Text>
            </View>
          )}
        </View>

        {/* Fila de Sedes */}
        {(item.sede_reg || item.sede_juris || item.sede_regional) ? (
          <View style={styles.sedeRow}>
            <SedePill icon="map-marker" value={item.sede_reg || item.sede_regional} />
            {(item.sede_reg || item.sede_regional) && item.sede_juris ? (
              <MaterialCommunityIcons name="chevron-right" size={14} color={COLORS.subtle} />
            ) : null}
            <SedePill icon="map-marker-radius" value={item.sede_juris} />
          </View>
        ) : null}

        {/* Local y Aula */}
        <View style={styles.cardFooter}>
          <MaterialCommunityIcons name="office-building-marker" size={14} color={COLORS.muted} />
          <Text style={styles.cardFooterText} numberOfLines={1}>
            {[
              item.local || item.area,
              item.aula ? `AULA ${item.aula}` : 'AULA NO ASIGNADA'
            ].filter(Boolean).join(' · ').toUpperCase()}
          </Text>
        </View>
      </Surface>
    );
  };

  return (
    <View style={styles.container}>
      {/* Subencabezado de información de turno y sede */}
      <View style={styles.subHeaderWrap}>
        <View style={styles.subHeaderPill}>
          <MaterialCommunityIcons
            name={shift === 'tarde' ? 'weather-night' : 'weather-sunny'}
            size={16}
            color={shift === 'tarde' ? COLORS.orange : COLORS.blue}
          />
          <Text style={styles.subHeaderText}>
            {shift === 'tarde' ? 'TURNO TARDE' : 'TURNO DÍA'}
          </Text>
        </View>

        <View style={styles.subHeaderPill}>
          <MaterialCommunityIcons name="map-marker-multiple" size={16} color={COLORS.purple} />
          <Text style={styles.subHeaderText}>
            {filterSede === 'TODOS' ? 'TODAS LAS SEDES' : filterSede.toUpperCase()}
          </Text>
        </View>

        <View style={[styles.subHeaderPill, { backgroundColor: color + '15' }]}>
          <Text style={[styles.subHeaderText, { color, fontWeight: '900' }]}>
            TOTAL: {filteredList.length}
          </Text>
        </View>
      </View>

      {/* Buscador por DNI o Nombre */}
      <View style={styles.searchRow}>
        <MaterialCommunityIcons name="magnify" size={20} color="#64748B" />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por DNI o Apellidos..."
          placeholderTextColor="#94A3B8"
          value={searchDni}
          onChangeText={setSearchDni}
          keyboardType="default"
        />
        {searchDni.length > 0 && (
          <TouchableOpacity onPress={() => setSearchDni('')}>
            <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* Contenido principal */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator animating={true} color={color} size="large" />
        </View>
      ) : filteredList.length === 0 ? (
        <View style={styles.center}>
          <MaterialCommunityIcons name="account-search-outline" size={56} color="#CBD5E1" />
          <Text style={styles.emptyText}>No se encontraron postulantes para los filtros seleccionados.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item) => `${item.id}-${item.dni}`}
          renderItem={({ item }) => renderCard(item)}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 6 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color} />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  subHeaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  subHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    height: 42,
    fontSize: 13,
    color: '#0F172A',
    marginLeft: 6,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderLeftWidth: 5,
    padding: 12,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
  },
  cardHeaderInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  cardCargo: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 1,
  },
  tipoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tipoBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 8,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardMetaText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '700',
  },
  horaPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  horaPillTurno2: {
    backgroundColor: '#F3E8FF',
  },
  horaPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.blue,
  },
  sedeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  sedePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sedePillText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  cardFooterText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
  },
});

export default StatDetailScreen;
