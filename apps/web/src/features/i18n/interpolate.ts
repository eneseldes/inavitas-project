/** Regex metakarakterlerini kaçırır — parametre adı desenin kendisini bozmasın. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** '{name}' biçimindeki yer tutucuları değerlerle doldurur. */
export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;

  return Object.entries(params).reduce(
    (acc, [key, val]) => acc.replace(new RegExp(`\\{\\s*${escapeRegex(key)}\\s*\\}`, 'g'), String(val)),
    template,
  );
}
