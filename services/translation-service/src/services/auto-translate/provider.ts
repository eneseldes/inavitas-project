export interface TranslationProvider {
  translate(text: string, from: string | undefined, to: string): Promise<string>;
}
