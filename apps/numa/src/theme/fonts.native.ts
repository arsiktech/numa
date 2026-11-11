import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { Manrope_300Light } from '@expo-google-fonts/manrope/300Light';
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import { useFonts } from '@expo-google-fonts/manrope/useFonts';

/** iOS and Android still load the used weights from the font packages. */
export function useAppFonts() {
  const [loaded, error] = useFonts({
    Manrope_300Light, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
    JetBrainsMono_500Medium,
  });
  return loaded || !!error;
}
