/**
 * Minimal RFC 4180 CSV reader for the official reference datasets (GEN-12): quoted fields,
 * escaped quotes, delimiters and newlines inside quotes, CRLF, and a UTF-8 BOM. The delimiter
 * (comma, tab or semicolon) is detected from the header line, so files exported from Excel or
 * Google Sheets both work. The first row is the header; each data row becomes { header: value }.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const headerLine = src.slice(0, src.search(/\r?\n|$/));
  const delimiter = [',', '\t', ';'].reduce((best, d) =>
    headerLine.split(d).length > headerLine.split(best).length ? d : best,
  );

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...data] = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return data.map((cells) => Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? '').trim()])));
}
