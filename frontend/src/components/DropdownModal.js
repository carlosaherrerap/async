/**
 * DropdownModal.js
 * Reusable dropdown that renders via Portal/Modal so it works inside
 * any ScrollView on Android without the nested-scroll limitation.
 *
 * Usage:
 *   <DropdownModal
 *     label="Cargo"
 *     value={selectedId}
 *     displayText={selectedLabel}
 *     options={[{ value: '1', label: 'Opcion A' }, ...]}
 *     onSelect={(val) => setSelectedId(val)}
 *   />
 */

import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  StatusBar,
  Platform,
} from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const DropdownModal = ({
  label,
  displayText,
  value,
  options = [],       // [{ value, label, icon? }]
  onSelect,
  icon = 'chevron-down',
  activeColor = '#334155',
  style,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger button */}
      <TouchableOpacity
        style={[styles.trigger, style]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.triggerText} numberOfLines={1}>
          {displayText || label || 'Seleccionar'}
        </Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={activeColor}
        />
      </TouchableOpacity>

      {/* Full-screen modal overlay */}
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent={Platform.OS === 'android'}
      >
        {/* Dim overlay — tap to close */}
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setOpen(false)}
        >
          {/* Sheet — stop tap propagation */}
          <TouchableOpacity
            activeOpacity={1}
            style={styles.sheet}
            onPress={() => {}} // swallow taps inside sheet
          >
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {label ? label.toUpperCase() : 'SELECCIONAR'}
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Options list — full ScrollView, no nesting issues */}
            <ScrollView
              style={styles.optionsList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.option, isSelected && { backgroundColor: activeColor }]}
                    onPress={() => {
                      onSelect(opt.value);
                      setOpen(false);
                    }}
                  >
                    {opt.icon && (
                      <MaterialCommunityIcons
                        name={opt.icon}
                        size={18}
                        color={isSelected ? '#FFF' : '#334155'}
                        style={{ marginRight: 8 }}
                      />
                    )}
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {isSelected && (
                      <MaterialCommunityIcons
                        name="check"
                        size={18}
                        color="#FFF"
                        style={{ marginLeft: 'auto' }}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
              {/* Extra padding at bottom */}
              <View style={{ height: 20 }} />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  triggerText: {
    flex: 1,
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 8,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '65%',
    minHeight: '25%',
    paddingTop: 6,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1.5,
    borderBottomColor: '#F1F5F9',
  },
  sheetTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  optionsList: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  optionText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  optionTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
});

export default DropdownModal;
