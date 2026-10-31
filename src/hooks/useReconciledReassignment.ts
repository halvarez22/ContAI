import { useCallback, useRef, useState } from 'react';
import type { CatalogAccount } from '../types/chartOfAccounts';
import { AUDIT_RECLASIFICACION_CONCILIADO } from '../types/reconciledReassignment';
import type { ReconciledReassignmentPatch } from '../types/reconciledReassignment';
import { logAuditEntry } from '../services/auditService';
import {
  commitTransactionUpdatesBatch,
  deleteField,
  serverTimestamp,
} from '../services/firestoreService';
import { validateReconciledReassignment } from '../services/reconciledReassignmentService';

const ROLE_HINT = 'Solo el dueño o un administrador puede reclasificar un movimiento conciliado.';

export function useReconciledReassignment(input: {
  transactionId: string;
  fecha: string;
  status?: string | null;
  tipo: string;
  monto: number;
  fiscalSubtotal?: number | null;
  fiscalIva?: number | null;
  accountCode?: string | null;
  metodoPagoSat?: string | null;
  concepto?: string | null;
  proveedor?: string | null;
  isNomina?: boolean;
  cfdiTipo?: string | null;
  confidenceScore?: number | null;
  canManage: boolean;
  atajoPueBancos: boolean;
  periodosCerrados: readonly string[];
  chart: readonly CatalogAccount[];
  organizationId?: string;
  actorUserId?: string;
}) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const save = useCallback(
    async (
      newAccountCode: string
    ): Promise<{ ok: true; patch: ReconciledReassignmentPatch } | { ok: false; reason: string }> => {
      if (savingRef.current) return { ok: false, reason: 'Espera a que termine el guardado.' };
      if (!input.canManage || !input.organizationId || !input.actorUserId) {
        return { ok: false, reason: ROLE_HINT };
      }
      const planned = validateReconciledReassignment({
        transaction_id: input.transactionId,
        fecha: input.fecha,
        status: input.status,
        tipo: input.tipo,
        monto: input.monto,
        fiscal_subtotal: input.fiscalSubtotal,
        fiscal_iva: input.fiscalIva,
        account_code: input.accountCode,
        new_account_code: newAccountCode,
        metodo_pago_sat: input.metodoPagoSat,
        concepto: input.concepto,
        proveedor: input.proveedor,
        is_nomina: input.isNomina,
        cfdi_tipo_comprobante: input.cfdiTipo,
        confidence_score: input.confidenceScore,
        canManage: input.canManage,
        atajoPueBancos: input.atajoPueBancos,
        periodosCerrados: input.periodosCerrados,
        chart: input.chart,
      });
      if (!planned.ok) return planned;

      const patch = planned.patch;
      savingRef.current = true;
      setSaving(true);
      try {
        await commitTransactionUpdatesBatch([
          {
            id: input.transactionId,
            payload: {
              status: patch.status,
              account_code: patch.account_code,
              account_name: patch.account_name,
              account_source: patch.account_source,
              asiento_devengo: patch.asiento_devengo,
              policy_review_reason: patch.policy_review_reason,
              aprobado_por: deleteField(),
              aprobado_en: deleteField(),
              actualizado_en: serverTimestamp(),
            },
          },
        ]);
        await logAuditEntry(AUDIT_RECLASIFICACION_CONCILIADO, 'transactions', {
          organization_id: input.organizationId,
          transaction_id: input.transactionId,
          old_account_code: input.accountCode ?? '',
          new_account_code: patch.account_code,
          usuario_id: input.actorUserId,
          fecha: input.fecha,
        });
        return planned;
      } catch (error: unknown) {
        const message = 'No se pudo reclasificar el movimiento.';
        return { ok: false, reason: error instanceof Error ? message : message };
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [input]
  );

  return { save, saving };
}
