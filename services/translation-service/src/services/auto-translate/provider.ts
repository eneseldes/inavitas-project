export interface TranslationProvider {
  /** Metinleri tek toplu istekte çevirir — anahtar başına N istek atılmaz. */
  translate(texts: string[], from: string | undefined, to: string): Promise<string[]>;
}
