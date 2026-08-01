/** Replace tabs in leading whitespace with spaces so the document can be parsed. */
export function tabsToSpaces(text: string, width: number): string {
  return text
    .split('\n')
    .map((line) => {
      const lead = /^[ \t]*/.exec(line)![0];
      if (!lead.includes('\t')) return line;
      let column = 0;
      for (const ch of lead) column += ch === '\t' ? width - (column % width) : 1;
      return ' '.repeat(column) + line.slice(lead.length);
    })
    .join('\n');
}

export interface FormatOptions {
  indent: number;
  printWidth?: number;
}

/**
 * Normalise indentation, spacing and quoting. Throws when the document cannot be
 * parsed — the caller surfaces the message instead of silently mangling the file.
 */
export async function formatYaml(text: string, { indent, printWidth = 100 }: FormatOptions): Promise<string> {
  // Prettier is ~70 kB gzipped, so it is fetched the first time someone formats.
  const [{ format }, yamlPlugin] = await Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/yaml'),
  ]);

  return format(tabsToSpaces(text, indent), {
    parser: 'yaml',
    plugins: [yamlPlugin],
    tabWidth: indent,
    printWidth,
    singleQuote: false,
    endOfLine: 'lf',
  });
}
