import { config } from '../../config.ts';
import { DeepLTranslationProvider } from './deepl.provider.ts';
import { NullTranslationProvider } from './null.provider.ts';
import type { TranslationProvider } from './provider.ts';

let provider: TranslationProvider | undefined;

/** Config'e göre sağlayıcı örneğini döner (modül seviyesinde tek örnek). */
export function getProvider(): TranslationProvider {
  if (!provider) {
    provider =
      config.TRANSLATION_PROVIDER === 'deepl' && config.DEEPL_API_KEY
        ? new DeepLTranslationProvider()
        : new NullTranslationProvider();
  }
  return provider;
}
