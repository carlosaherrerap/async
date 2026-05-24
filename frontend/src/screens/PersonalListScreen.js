import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const PersonalListScreen = () => {
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1e1e1e', '#000000']} style={styles.background} />
      <Text style={styles.text}>Lista de Personal - Próximamente</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  background: { ...StyleSheet.absoluteFillObject },
  text: { color: '#fff', fontSize: 18 }
});

export default PersonalListScreen;
