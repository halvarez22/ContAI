/**
 * Reportes del periodo (E17). Orquesta el cálculo puro y la bitácora.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { CatalogAccount } from '../types/chartOfAccounts';
import {
  AUDIT_BALANZA_COMPROBACION_GENERADA,
  AUDIT_ESTADO_RESULTADOS_GENERADO,
} from '../types/financialReports';
import { logAuditEntry } from '../services/auditService';
import {
  buildFinancialReports,
  type ReportTransaction,
} from '../services/financialReportsService';

export function useFinancialReports(input: {
  transactions: readonly ReportTransaction[];
  chart: readonly CatalogAccount[];
  year: number;
  monthIndex: number;
  truncated: boolean;
  organizationId?: string;
}) {
  const reports = useMemo(
    () =>
      buildFinancialReports({
        transactions: input.transactions,
        chart: input.chart,
        year: input.year,
        monthIndex: input.monthIndex,
        truncated: input.truncated,
      }),
    [input.transactions, input.chart, input.year, input.monthIndex, input.truncated]
  );
  const [registering, setRegistering] = useState(false);
  const [registeredKey, setRegisteredKey] = useState<string | null>(null);
  const registeringRef = useRef(false);

  const register = useCallback(async () => {
    if (!input.organizationId || registeringRef.current) return;
    registeringRef.current = true;
    const balance = reports.trialBalance;
    const statement = reports.incomeStatement;
    setRegistering(true);
    try {
      const shared = {
        organization_id: input.organizationId,
        periodKey: balance.periodKey,
        total_cargos: balance.total_cargos,
        total_abonos: balance.total_abonos,
        is_balanced: balance.is_balanced,
      };
      await logAuditEntry(AUDIT_BALANZA_COMPROBACION_GENERADA, 'financial_reports', shared);
      await logAuditEntry(AUDIT_ESTADO_RESULTADOS_GENERADO, 'financial_reports', {
        ...shared,
        total_ingresos: statement.total_ingresos,
        total_gastos: statement.total_gastos,
        utilidad_neta: statement.utilidad_neta,
      });
      setRegisteredKey(balance.periodKey);
    } finally {
      registeringRef.current = false;
      setRegistering(false);
    }
  }, [input.organizationId, reports]);

  return {
    trialBalance: reports.trialBalance,
    incomeStatement: reports.incomeStatement,
    balanceSheet: reports.balanceSheet,
    register,
    registering,
    registered: registeredKey === reports.trialBalance.periodKey,
    canRegister: Boolean(input.organizationId),
  };
}
