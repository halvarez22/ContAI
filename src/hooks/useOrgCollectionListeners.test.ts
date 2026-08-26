import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('useOrgCollectionListeners source contract', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/hooks/useOrgCollectionListeners.ts'),
    'utf8'
  );

  it('transactions: YTD fecha >= + orderBy fecha desc + limit 5000', () => {
    expect(src).toMatch(/ytdStartIso\(periodYear\)/);
    expect(src).toMatch(/where\('fecha',\s*'>='/);
    expect(src).toMatch(/orderBy\('fecha',\s*'desc'\)/);
    expect(src).toMatch(/limit\(TRANSACTIONS_YTD_LIMIT\)/);
  });

  it('audit_logs: orderBy timestamp desc + limit 100', () => {
    expect(src).toMatch(/where\('usuario_id'/);
    expect(src).toMatch(/orderBy\('timestamp',\s*'desc'\)/);
    expect(src).toMatch(/limit\(AUDIT_LOGS_LIMIT\)/);
  });

  it('cleanup unsubscribe en return del useEffect', () => {
    expect(src).toMatch(/unsubTransactions\(\)/);
    expect(src).toMatch(/return \(\) => \{/);
  });

  it('deps incluyen periodYear para re-subscribe al cambiar año', () => {
    expect(src).toMatch(/\[userId,\s*organizationId,\s*periodYear\]/);
  });
});

describe('firestore.indexes.json audit_logs', () => {
  it('incluye índice compuesto usuario_id + timestamp DESC', () => {
    const raw = readFileSync(
      join(process.cwd(), 'firestore.indexes.json'),
      'utf8'
    );
    const json = JSON.parse(raw) as {
      indexes: Array<{
        collectionGroup: string;
        fields: Array<{ fieldPath: string; order: string }>;
      }>;
    };
    const hit = json.indexes.find(
      (i) =>
        i.collectionGroup === 'audit_logs' &&
        i.fields[0]?.fieldPath === 'usuario_id' &&
        i.fields[1]?.fieldPath === 'timestamp' &&
        i.fields[1]?.order === 'DESCENDING'
    );
    expect(hit).toBeTruthy();
  });
});
