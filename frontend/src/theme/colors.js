
export const COLORS = {
  // ── Primarios (logo) 
  blue: '#1565C0',
  blueLight: '#1E88E5',
  blueDark: '#0D47A1',
  blueSoft: '#E3F2FD',
  blueBorder: '#BBDEFB',

  orange: '#F5A623',
  orangeLight: '#FFB74D',
  orangeDark: '#E65100',
  orangeSoft: '#FFF3E0',
  orangeBorder: '#FFE0B2',

  purple: '#9C27B0',
  purpleLight: '#AB47BC',
  purpleSoft: '#F3E5F5',
  purpleBorder: '#E1BEE7',

  magenta: '#E91E8A',
  magentaDark: '#C2185B',
  magentaSoft: '#FCE4EC',
  magentaBorder: '#F8BBD9',

  // ── Semánticos 
  success: '#15803D',
  successLight: '#16A34A',
  successSoft: '#F0FDF4',
  successBorder: '#DCFCE7',

  warning: '#D97706',
  warningSoft: '#FFFBEB',
  warningBorder: '#FDE68A',

  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',

  // ── Neutrales 
  ink: '#0A1628',
  inkMid: '#1E293B',
  inkLight: '#334155',
  muted: '#64748B',
  subtle: '#94A3B8',
  border: '#E2E8F0',
  surface: '#F8FAFC',
  bg: '#F1F5F9',
  white: '#FFFFFF',
};

// Configuración del tipo de postulante
export const TIPO_CONFIG = {
  Titular: {
    bg: COLORS.successSoft,
    border: COLORS.successBorder,
    text: COLORS.success,
    avatar: COLORS.success,
    icon: 'account-check',
    tag: '#15803D',
  },
  Reserva: {
    bg: COLORS.orangeSoft,
    border: COLORS.orangeBorder,
    text: COLORS.orangeDark,
    avatar: '#E65100',
    icon: 'account-clock',
    tag: '#E65100',
  },
  default: {
    bg: COLORS.blueSoft,
    border: COLORS.blueBorder,
    text: COLORS.blue,
    avatar: COLORS.blue,
    icon: 'account',
    tag: COLORS.blue,
  },
};
