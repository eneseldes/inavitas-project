import type { Logger } from '@inavitas/shared';
import { config } from '../../config.ts';
import { redis } from '../../redis.ts';

const DEEPL_LANGUAGES_ENDPOINT = 'https://api-free.deepl.com/v2/languages';
const CACHE_KEY = 'i18n:meta:provider-languages';
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // haftalık — DeepL dil listesi neredeyse hiç değişmiyor

export interface ProviderLanguage {
  code: string;
  name: string;
}

export interface ProviderLanguages {
  source: ProviderLanguage[];
  target: ProviderLanguage[];
}

const EMPTY: ProviderLanguages = { source: [], target: [] };

interface DeeplLanguageEntry {
  language: string;
  name: string;
}

async function fetchFromDeepl(type: 'source' | 'target'): Promise<ProviderLanguage[]> {
  const res = await fetch(`${DEEPL_LANGUAGES_ENDPOINT}?type=${type}`, {
    headers: { Authorization: `DeepL-Auth-Key ${config.DEEPL_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`DeepL dil listesi alınamadı (HTTP ${res.status}, type=${type})`);
  }
  const data = (await res.json()) as DeeplLanguageEntry[];
  return data.map((l) => ({ code: l.language, name: l.name }));
}

async function fetchAndCache(log: Logger): Promise<ProviderLanguages> {
  const [source, target] = await Promise.all([fetchFromDeepl('source'), fetchFromDeepl('target')]);
  const result: ProviderLanguages = { source, target };

  try {
    await redis.set(CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    log.error({ err }, 'Redis setProviderLanguages hatası');
  }

  return result;
}

/**
 * Uygulama başlangıcında bir kez çağrılır — Redis cache'i ısıtır (haftalık TTL).
 * DEEPL_API_KEY yoksa veya sağlayıcı 'deepl' değilse hiçbir şey yapmaz. Hata
 * durumunda süreci düşürmez, sadece loglar — ilk admin isteğinde tekrar denenir.
 */
export async function warmProviderLanguageCache(log: Logger): Promise<void> {
  if (config.TRANSLATION_PROVIDER !== 'deepl' || !config.DEEPL_API_KEY) return;

  try {
    const { source, target } = await fetchAndCache(log);
    log.info({ sourceCount: source.length, targetCount: target.length }, 'DeepL dil listesi önbelleğe alındı');
  } catch (err) {
    log.error({ err }, 'DeepL dil listesi çekilemedi, önbellek boş kalacak');
  }
}

/** Admin dropdown'ı ve kod doğrulaması için desteklenen dil listesini döner. */
export async function getProviderLanguages(log: Logger): Promise<ProviderLanguages> {
  if (config.TRANSLATION_PROVIDER !== 'deepl' || !config.DEEPL_API_KEY) return EMPTY;

  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as ProviderLanguages;
  } catch (err) {
    log.error({ err }, 'Redis getProviderLanguages hatası, DeepL API fallback yapılıyor');
  }

  try {
    return await fetchAndCache(log);
  } catch (err) {
    log.error({ err }, 'DeepL dil listesi alınamadı');
    return EMPTY;
  }
}

/** Verilen kodun DeepL hedef dil listesinde gerçekten var olup olmadığını kontrol eder. */
export async function isValidProviderTargetCode(code: string, log: Logger): Promise<boolean> {
  const { target } = await getProviderLanguages(log);
  return target.some((l) => l.code === code);
}
