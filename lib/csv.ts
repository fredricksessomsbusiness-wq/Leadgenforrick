import { stringify } from 'csv-stringify/sync';

export const exportCsv = (rows: Record<string, string | number | null>[], columns: string[]) =>
  stringify(rows, {
    header: true,
    columns,
    cast: {
      boolean: (v) => (v ? 'true' : 'false')
    }
  });
