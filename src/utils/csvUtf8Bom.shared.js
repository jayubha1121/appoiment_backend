/** Excel Hindi / commas ke liye UTF-8 BOM — double-click se columns sahi. */
export function withUtf8Bom(csvString) {
  return `\ufeff${String(csvString ?? "")}`;
}
