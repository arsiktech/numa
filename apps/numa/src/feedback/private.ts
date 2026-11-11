import { Platform } from 'react-native';

/** Web-only marker for a field. The capture paints it over before anything is drawn. */
export const fbField = Platform.OS === 'web' ? { dataSet: { fbPrivate: true } } : {};
