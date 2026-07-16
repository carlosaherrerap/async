import React, { useState, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, Alert, TouchableOpacity, Image,
  TextInput as RNTextInput, ActivityIndicator, FlatList, Dimensions,
} from 'react-native';
import { Text, Surface, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { COLORS } from '../theme/colors';

const { width } = Dimensions.get('window');

const FILTROS = ['TODOS', 'ASISTIERON', 'FALTAN'];

const PhotoAttendanceScreen = () => {
  // ─── SECCIÓN A: SUBIR FOTOS ───────────────────────────────────────────────
  const [aula, setAula]         = useState('');
  const [fotos, setFotos]       = useState([]);   // [{ uri, base64, name }]
  const [cargando, setCargando] = useState(false);
  const [resultados, setResultados] = useState(null); // { total, registros }

  // ─── SECCIÓN B: VER POR AULA ──────────────────────────────────────────────
  const [aulasDisponibles, setAulasDisponibles] = useState([]);
  const [aulaVer, setAulaVer]                   = useState('');
  const [listaPersonas, setListaPersonas]        = useState([]);
  const [filtro, setFiltro]                      = useState('TODOS');
  const [loadingLista, setLoadingLista]          = useState(false);
  const [activeTab, setActiveTab]                = useState('CARGAR'); // 'CARGAR' | 'VER'

  // ─── EFECTOS ──────────────────────────────────────────────────────────────
  useEffect(() => {
    cargarAulasDisponibles();
  }, []);

  const cargarAulasDisponibles = async () => {
    try {
      const db = global.dbHelper?.db;
      if (!db) return;
      const rows = await db.getAllAsync(
        "SELECT DISTINCT aula FROM cookie WHERE aula IS NOT NULL AND aula != '' ORDER BY aula ASC"
      );
      setAulasDisponibles(rows.map(r => r.aula));
    } catch (e) {
      console.error('[COOKIE] Error cargando aulas:', e);
    }
  };

  const cargarPersonasPorAula = useCallback(async (aulaSeleccionada) => {
    if (!aulaSeleccionada) return;
    setLoadingLista(true);
    try {
      const db = global.dbHelper?.db;
      if (!db) return;
      const rows = await db.getAllAsync(
        'SELECT * FROM cookie WHERE aula = ? ORDER BY numero_orden ASC, nombres_apellidos ASC',
        [aulaSeleccionada]
      );
      setListaPersonas(rows);
    } catch (e) {
      console.error('[COOKIE] Error cargando personas:', e);
    } finally {
      setLoadingLista(false);
    }
  }, []);

  useEffect(() => {
    if (aulaVer) cargarPersonasPorAula(aulaVer);
  }, [aulaVer]);

  // ─── SELECCIONAR FOTO (GALERÍA) ───────────────────────────────────────────
  const pickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Se necesita acceso a la galería de fotos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        base64: true,
        quality: 0.85,
      });
      if (!result.canceled && result.assets) {
        const nuevas = result.assets.map((a, i) => ({
          uri:    a.uri,
          base64: a.base64,
          name:   `imagen_${Date.now()}_${i}.jpg`,
        }));
        setFotos(prev => [...prev, ...nuevas]);
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir la galería.');
    }
  };

  // ─── TOMAR FOTO (CÁMARA) ─────────────────────────────────────────────────
  const pickFromCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Se necesita acceso a la cámara.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        base64: true,
        quality: 0.85,
      });
      if (!result.canceled && result.assets?.[0]) {
        const a = result.assets[0];
        setFotos(prev => [...prev, { uri: a.uri, base64: a.base64, name: `foto_${Date.now()}.jpg` }]);
      }
    } catch (e) {
      Alert.alert('Error', 'No se pudo abrir la cámara.');
    }
  };

  const eliminarFoto = (idx) => {
    setFotos(prev => prev.filter((_, i) => i !== idx));
  };

  // ─── CARGAR LISTA (OCR) ───────────────────────────────────────────────────
  const handleCargar = async () => {
    if (!aula.trim()) {
      Alert.alert('Campo requerido', 'Ingresa el número de aula antes de cargar.');
      return;
    }
    if (fotos.length === 0) {
      Alert.alert('Sin fotos', 'Agrega al menos una foto de la lista.');
      return;
    }

    setCargando(true);
    setResultados(null);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const db    = global.dbHelper?.db;
      let totalInsertados = 0;
      let totalRegistros  = 0;

      for (let i = 0; i < fotos.length; i++) {
        const foto = fotos[i];
        try {
          console.log(`[OCR] Procesando foto ${i + 1}/${fotos.length}...`);
          const resp = await fetch(`${API_URL}/api/asistencia/procesar-foto-lista`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ imageBase64: foto.base64, aula: aula.trim() }),
          });

          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            console.warn(`[OCR] Foto ${i + 1} error:`, err.message);
            continue;
          }

          const data = await resp.json();
          totalRegistros += data.total;
          console.log(`[OCR] Foto ${i + 1}: ${data.total} registros encontrados`);

          // Insertar en tabla cookie (local)
          if (db && data.registros?.length > 0) {
            for (const reg of data.registros) {
              try {
                await db.runAsync(
                  `INSERT INTO cookie (numero_orden, sede_regional, nombres_apellidos, dni, estado, aula)
                   VALUES (?, ?, ?, ?, 0, ?)`,
                  [
                    reg.numero_orden || null,
                    reg.sede_regional || '',
                    (reg.nombres_apellidos || '').toUpperCase(),
                    reg.dni || '',
                    aula.trim(),
                  ]
                );
                totalInsertados++;
              } catch (dbErr) {
                console.error('[COOKIE] Error insertando registro:', dbErr);
              }
            }
          }
        } catch (fotoErr) {
          console.error(`[OCR] Error procesando foto ${i + 1}:`, fotoErr);
        }
      }

      setResultados({ total: totalRegistros, insertados: totalInsertados });
      await cargarAulasDisponibles();
      Alert.alert(
        '✅ Carga Completada',
        `Se procesaron ${fotos.length} foto(s).\nRegistros encontrados: ${totalRegistros}\nRegistros guardados: ${totalInsertados}\n\nAhora puedes ver la lista en la pestaña VER.`,
        [{ text: 'OK', onPress: () => { setActiveTab('VER'); setAulaVer(aula.trim()); } }]
      );
    } catch (e) {
      Alert.alert('Error', 'Ocurrió un error al procesar las fotos: ' + e.message);
    } finally {
      setCargando(false);
    }
  };

  // ─── LIMPIAR COOKIE TABLE (por aula) ─────────────────────────────────────
  const handleLimpiarAula = () => {
    Alert.alert(
      '¿Limpiar lista?',
      `Se eliminarán todos los registros del AULA ${aulaVer} de la tabla local.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpiar', style: 'destructive', onPress: async () => {
            const db = global.dbHelper?.db;
            if (db) {
              await db.runAsync('DELETE FROM cookie WHERE aula = ?', [aulaVer]);
              setListaPersonas([]);
              await cargarAulasDisponibles();
              setAulaVer('');
            }
          }
        }
      ]
    );
  };

  // ─── ESTADÍSTICAS ─────────────────────────────────────────────────────────
  const totalLista    = listaPersonas.length;
  const totalAsistio  = listaPersonas.filter(p => p.estado === 1).length;
  const totalFaltan   = totalLista - totalAsistio;

  const listaFiltrada = listaPersonas.filter(p => {
    if (filtro === 'ASISTIERON') return p.estado === 1;
    if (filtro === 'FALTAN')     return p.estado === 0;
    return true;
  });

  // ─── RENDER ITEM ─────────────────────────────────────────────────────────
  const renderPersona = ({ item }) => {
    const asistio = item.estado === 1;
    return (
      <View style={[styles.personaRow, asistio && styles.personaRowAsistio]}>
        <View style={[styles.estadoDot, { backgroundColor: asistio ? '#10B981' : '#F87171' }]} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.personaNombre} numberOfLines={1}>
            {item.numero_orden ? `${item.numero_orden}. ` : ''}{item.nombres_apellidos || 'SIN NOMBRE'}
          </Text>
          <Text style={styles.personaDni}>
            {item.dni ? `DNI: ${item.dni}` : 'DNI: —'}
            {item.sede_regional ? `  |  ${item.sede_regional}` : ''}
          </Text>
        </View>
        <View style={[styles.estadoBadge, { backgroundColor: asistio ? '#D1FAE5' : '#FEE2E2', borderColor: asistio ? '#6EE7B7' : '#FCA5A5' }]}>
          <Text style={[styles.estadoBadgeText, { color: asistio ? '#065F46' : '#991B1B' }]}>
            {asistio ? 'ASISTIÓ' : 'FALTA'}
          </Text>
        </View>
      </View>
    );
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── TABS ───────────────────────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        {['CARGAR', 'VER'].map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <MaterialCommunityIcons
              name={tab === 'CARGAR' ? 'camera-plus' : 'clipboard-list-outline'}
              size={18}
              color={activeTab === tab ? '#FFFFFF' : '#64748B'}
            />
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ══════════════ TAB: CARGAR ══════════════ */}
      {activeTab === 'CARGAR' && (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

          {/* AULA INPUT */}
          <Surface style={styles.card} elevation={1}>
            <Text style={styles.fieldLabel}>NÚMERO DE AULA</Text>
            <View style={styles.aulaRow}>
              <MaterialCommunityIcons name="door-open" size={22} color={COLORS.blue} style={{ marginRight: 10 }} />
              <RNTextInput
                style={styles.aulaInput}
                value={aula}
                onChangeText={t => setAula(t.replace(/[^0-9]/g, ''))}
                keyboardType="numeric"
                maxLength={3}
                placeholder="Ej: 5"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </Surface>

          {/* FOTOS */}
          <Surface style={styles.card} elevation={1}>
            <Text style={styles.fieldLabel}>FOTOS DE LA LISTA ({fotos.length})</Text>

            {fotos.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fotosScroll}>
                {fotos.map((foto, idx) => (
                  <View key={idx} style={styles.fotoItem}>
                    <Image source={{ uri: foto.uri }} style={styles.fotoThumb} />
                    <TouchableOpacity style={styles.fotoDeleteBtn} onPress={() => eliminarFoto(idx)}>
                      <MaterialCommunityIcons name="close-circle" size={22} color="#EF4444" />
                    </TouchableOpacity>
                    <Text style={styles.fotoName} numberOfLines={1}>Foto {idx + 1}</Text>
                  </View>
                ))}
              </ScrollView>
            )}

            <View style={styles.fotoBtnsRow}>
              <TouchableOpacity style={styles.fotoBtn} onPress={pickFromGallery}>
                <MaterialCommunityIcons name="image-multiple-outline" size={22} color={COLORS.blue} />
                <Text style={[styles.fotoBtnText, { color: COLORS.blue }]}>Galería</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.fotoBtn, { borderColor: '#10B981' }]} onPress={pickFromCamera}>
                <MaterialCommunityIcons name="camera-outline" size={22} color="#10B981" />
                <Text style={[styles.fotoBtnText, { color: '#10B981' }]}>Cámara</Text>
              </TouchableOpacity>
            </View>
          </Surface>

          {/* BOTÓN CARGAR */}
          <TouchableOpacity
            style={[styles.cargarBtn, (cargando || fotos.length === 0 || !aula) && styles.cargarBtnDisabled]}
            onPress={handleCargar}
            disabled={cargando || fotos.length === 0 || !aula}
          >
            {cargando ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <MaterialCommunityIcons name="text-recognition" size={22} color="#FFFFFF" />
            )}
            <Text style={styles.cargarBtnText}>
              {cargando ? 'PROCESANDO OCR...' : 'CARGAR LISTA'}
            </Text>
          </TouchableOpacity>

          {/* RESULTADO */}
          {resultados && (
            <Surface style={[styles.card, { borderLeftColor: '#10B981', borderLeftWidth: 5 }]} elevation={1}>
              <Text style={styles.resultadoTitle}>✅ Última carga</Text>
              <Text style={styles.resultadoText}>Registros detectados: <Text style={{ fontWeight: '900' }}>{resultados.total}</Text></Text>
              <Text style={styles.resultadoText}>Guardados en local: <Text style={{ fontWeight: '900' }}>{resultados.insertados}</Text></Text>
              <Text style={[styles.resultadoText, { color: '#64748B', marginTop: 4 }]}>
                Ir a la pestaña VER para revisar la lista.
              </Text>
            </Surface>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* ══════════════ TAB: VER ══════════════ */}
      {activeTab === 'VER' && (
        <View style={{ flex: 1 }}>
          {/* DROPDOWN AULA */}
          <View style={styles.aulaVerRow}>
            <MaterialCommunityIcons name="door-open" size={20} color={COLORS.blue} />
            <Text style={styles.aulaVerLabel}>AULA:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              {aulasDisponibles.length === 0 ? (
                <Text style={styles.aulaVerEmpty}>Sin datos cargados</Text>
              ) : (
                aulasDisponibles.map(a => (
                  <TouchableOpacity
                    key={a}
                    style={[styles.aulaChip, aulaVer === a && styles.aulaChipActive]}
                    onPress={() => setAulaVer(a)}
                  >
                    <Text style={[styles.aulaChipText, aulaVer === a && styles.aulaChipTextActive]}>
                      {a}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>

          {/* CONTADORES */}
          {aulaVer ? (
            <>
              <View style={styles.statsRow}>
                <View style={[styles.statBox, { borderTopColor: COLORS.blue }]}>
                  <Text style={[styles.statNum, { color: COLORS.blue }]}>{totalLista}</Text>
                  <Text style={styles.statLbl}>TOTAL</Text>
                </View>
                <View style={[styles.statBox, { borderTopColor: '#10B981' }]}>
                  <Text style={[styles.statNum, { color: '#10B981' }]}>{totalAsistio}</Text>
                  <Text style={styles.statLbl}>ASISTIERON</Text>
                </View>
                <View style={[styles.statBox, { borderTopColor: '#F87171' }]}>
                  <Text style={[styles.statNum, { color: '#F87171' }]}>{totalFaltan}</Text>
                  <Text style={styles.statLbl}>FALTAN</Text>
                </View>
              </View>

              {/* BARRA DE PROGRESO */}
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: totalLista > 0 ? `${(totalAsistio / totalLista) * 100}%` : '0%' }]} />
              </View>

              {/* FILTROS */}
              <View style={styles.filtroRow}>
                {FILTROS.map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.filtroBtn, filtro === f && styles.filtroBtnActive]}
                    onPress={() => setFiltro(f)}
                  >
                    <Text style={[styles.filtroBtnText, filtro === f && styles.filtroBtnTextActive]}>{f}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.filtroRefresh} onPress={() => cargarPersonasPorAula(aulaVer)}>
                  <MaterialCommunityIcons name="refresh" size={18} color={COLORS.blue} />
                </TouchableOpacity>
              </View>

              {/* LISTA */}
              {loadingLista ? (
                <ActivityIndicator color={COLORS.blue} style={{ marginTop: 40 }} />
              ) : listaFiltrada.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialCommunityIcons name="account-question" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyText}>No hay registros para este filtro</Text>
                </View>
              ) : (
                <FlatList
                  data={listaFiltrada}
                  keyExtractor={item => item.id.toString()}
                  renderItem={renderPersona}
                  contentContainerStyle={styles.listaContent}
                  showsVerticalScrollIndicator={false}
                  ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#F1F5F9' }} />}
                />
              )}

              {/* BOTÓN LIMPIAR */}
              <TouchableOpacity style={styles.limpiarBtn} onPress={handleLimpiarAula}>
                <MaterialCommunityIcons name="delete-sweep-outline" size={16} color="#EF4444" />
                <Text style={styles.limpiarBtnText}>LIMPIAR AULA {aulaVer}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="clipboard-arrow-up-outline" size={64} color="#CBD5E1" />
              <Text style={styles.emptyText}>Selecciona un aula para ver la lista</Text>
              {aulasDisponibles.length === 0 && (
                <Text style={[styles.emptyText, { fontSize: 12, marginTop: 6 }]}>
                  Primero carga fotos en la pestaña CARGAR
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },

  // Tabs
  tabBar: { flexDirection: 'row', backgroundColor: '#1E293B', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 8 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  tabActive: { backgroundColor: COLORS.blue },
  tabText: { color: '#94A3B8', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  tabTextActive: { color: '#FFFFFF' },

  // Cards
  scrollContent: { padding: 16, gap: 14 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, elevation: 1 },
  fieldLabel: { color: '#475569', fontWeight: '900', fontSize: 11, letterSpacing: 1, marginBottom: 10 },

  // Aula input (cargar)
  aulaRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1.5, borderColor: '#E2E8F0', paddingHorizontal: 12, height: 48 },
  aulaInput: { flex: 1, fontSize: 22, fontWeight: '900', color: '#0F172A' },

  // Fotos
  fotosScroll: { marginBottom: 12 },
  fotoItem: { marginRight: 10, alignItems: 'center', width: 90 },
  fotoThumb: { width: 80, height: 80, borderRadius: 10, backgroundColor: '#E2E8F0' },
  fotoDeleteBtn: { position: 'absolute', top: -6, right: -6 },
  fotoName: { fontSize: 10, color: '#64748B', marginTop: 4, textAlign: 'center' },
  fotoBtnsRow: { flexDirection: 'row', gap: 10 },
  fotoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: COLORS.blue, borderRadius: 10, paddingVertical: 12 },
  fotoBtnText: { fontWeight: '800', fontSize: 13 },

  // Botón CARGAR
  cargarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#1E293B', borderRadius: 14, paddingVertical: 16, marginTop: 4 },
  cargarBtnDisabled: { backgroundColor: '#94A3B8' },
  cargarBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 },

  // Resultado
  resultadoTitle: { fontWeight: '900', fontSize: 14, color: '#065F46', marginBottom: 6 },
  resultadoText: { color: '#0F172A', fontSize: 13, marginBottom: 2 },

  // TAB VER — Aula selector
  aulaVerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', gap: 8 },
  aulaVerLabel: { color: '#64748B', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },
  aulaVerEmpty: { color: '#94A3B8', fontSize: 12, fontStyle: 'italic', paddingVertical: 6 },
  aulaChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: '#CBD5E1', marginRight: 8, backgroundColor: '#F8FAFC' },
  aulaChipActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  aulaChipText: { fontWeight: '800', color: '#64748B', fontSize: 13 },
  aulaChipTextActive: { color: '#FFFFFF' },

  // Estadísticas
  statsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  statBox: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, alignItems: 'center', borderTopWidth: 4, elevation: 1 },
  statNum: { fontWeight: '900', fontSize: 26, lineHeight: 30 },
  statLbl: { color: '#94A3B8', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },

  // Barra de progreso
  progressBar: { height: 6, backgroundColor: '#E2E8F0', marginHorizontal: 12, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#10B981', borderRadius: 3 },

  // Filtros
  filtroRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, gap: 6, alignItems: 'center' },
  filtroBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: '#E2E8F0', alignItems: 'center', backgroundColor: '#F8FAFC' },
  filtroBtnActive: { backgroundColor: '#1E293B', borderColor: '#1E293B' },
  filtroBtnText: { fontWeight: '800', fontSize: 11, color: '#64748B', letterSpacing: 0.3 },
  filtroBtnTextActive: { color: '#FFFFFF' },
  filtroRefresh: { padding: 8 },

  // Lista de personas
  listaContent: { paddingHorizontal: 12, paddingBottom: 80 },
  personaRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6 },
  personaRowAsistio: { backgroundColor: '#F0FDF4' },
  estadoDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  personaNombre: { fontWeight: '800', color: '#0F172A', fontSize: 13 },
  personaDni: { color: '#64748B', fontSize: 11, marginTop: 2 },
  estadoBadge: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  estadoBadgeText: { fontWeight: '900', fontSize: 10, letterSpacing: 0.3 },

  // Botón limpiar
  limpiarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, margin: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#FECACA', backgroundColor: '#FFF5F5' },
  limpiarBtnText: { color: '#EF4444', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },

  // Estado vacío
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyText: { color: '#94A3B8', fontWeight: '700', fontSize: 14, marginTop: 12, textAlign: 'center', paddingHorizontal: 20 },
});

export default PhotoAttendanceScreen;
