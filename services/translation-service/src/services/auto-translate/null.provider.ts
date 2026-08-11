import { InternalError } from '@inavitas/shared';
import type { TranslationProvider } from './provider.ts';

export class NullTranslationProvider implements TranslationProvider {
  async translate(): Promise<string[]> {
    throw new InternalError('Otomatik makine çevirisi devre dışı (TRANSLATION_PROVIDER=none)');
  }
}
