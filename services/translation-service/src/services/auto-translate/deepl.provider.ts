import { InternalError } from '@inavitas/shared';
import { config } from '../../config.ts';
import type { TranslationProvider } from './provider.ts';

const DEEPL_ENDPOINT = 'https://api-free.deepl.com/v2/translate';

interface DeepLResponse {
  translations: { text: string }[];
}

/** DeepL API ile native `fetch` üzerinden çeviri yapar — SDK kurulmaz. */
export class DeepLTranslationProvider implements TranslationProvider {
  async translate(texts: string[], from: string | undefined, to: string): Promise<string[]> {
    const body = new URLSearchParams();
    for (const text of texts) body.append('text', text);
    body.append('target_lang', to);
    if (from) body.append('source_lang', from);

    let res: Response;
    try {
      res = await fetch(DEEPL_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `DeepL-Auth-Key ${config.DEEPL_API_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    } catch (err) {
      // Sağlayıcı yanıt gövdesi/ağ hatası istemciye sızdırılmaz, yalnız loglanır.
      throw new InternalError('DeepL çeviri isteği başarısız', err);
    }

    if (!res.ok) {
      throw new InternalError(`DeepL çeviri isteği başarısız (HTTP ${res.status})`);
    }

    const data = (await res.json()) as DeepLResponse;
    return data.translations.map((t) => t.text);
  }
}
