import { useCallback, useEffect, useState } from 'react';
import { resolveEffectiveChart } from '../services/accountMappingService';
import {
  addMissingSeedAccounts,
  deleteMappingRule,
  listMappingRules,
  saveMappingRule,
  updateAtajoPueBancos,
  updateOrganizationChart,
} from '../services/organizationService';
import type { AccountMappingRule, CatalogAccount } from '../types/chartOfAccounts';
import type { Organization } from '../types/organization';

export function useAccountCatalog(org: Organization | null, canManage: boolean) {
  const [accounts, setAccounts] = useState<CatalogAccount[]>([]);
  const [pendientes, setPendientes] = useState<string[]>([]);
  const [rules, setRules] = useState<AccountMappingRule[]>([]);
  const [atajoPueBancos, setAtajoPueBancos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org) {
      setAccounts([]);
      setPendientes([]);
      setRules([]);
      setAtajoPueBancos(false);
      return;
    }
    setAtajoPueBancos(org.atajo_pue_bancos === true);
    setSyncMessage(null);
    const resolved = resolveEffectiveChart(org);
    setAccounts(resolved.accounts);
    setPendientes(resolved.pendientes);
    let cancelled = false;
    listMappingRules(org.id)
      .then((loaded) => {
        if (!cancelled) setRules(loaded);
      })
      .catch(() => {
        if (!cancelled) setError('No se pudieron leer las reglas de mapeo.');
      });
    return () => {
      cancelled = true;
    };
  }, [org]);

  const saveAccounts = useCallback(
    async (next: CatalogAccount[], nextPendientes: string[]) => {
      if (!org || !canManage) return;
      setSaving(true);
      setError(null);
      try {
        await updateOrganizationChart(org.id, next, nextPendientes);
        setAccounts(next);
        setPendientes(nextPendientes);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo guardar el catálogo.');
      } finally {
        setSaving(false);
      }
    },
    [org, canManage]
  );

  const syncMissingSeed = useCallback(async () => {
    if (!org || !canManage) return;
    setSyncing(true);
    setSaving(true);
    setError(null);
    setSyncMessage(null);
    try {
      const result = await addMissingSeedAccounts(org.id, org.catalogo_cuentas, pendientes);
      if (result.addedCount === 0) {
        setSyncMessage('El catálogo ya tiene las cuentas oficiales.');
        return;
      }
      setAccounts(result.accounts);
      setSyncMessage(
        result.addedCount === 1
          ? 'Se agregó 1 cuenta del catálogo oficial.'
          : `Se agregaron ${result.addedCount} cuentas del catálogo oficial.`
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el catálogo.');
    } finally {
      setSyncing(false);
      setSaving(false);
    }
  }, [org, canManage, pendientes]);

  const saveRule = useCallback(
    async (rule: AccountMappingRule) => {
      if (!org || !canManage) return;
      setSaving(true);
      setError(null);
      try {
        await saveMappingRule({ ...rule, organization_id: org.id });
        setRules((prev) => {
          const rest = prev.filter((item) => item.id !== rule.id);
          return [...rest, { ...rule, organization_id: org.id }].sort(
            (a, b) => a.priority - b.priority || a.id.localeCompare(b.id)
          );
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo guardar la regla.');
      } finally {
        setSaving(false);
      }
    },
    [org, canManage]
  );

  const removeRule = useCallback(
    async (ruleId: string) => {
      if (!org || !canManage) return;
      setSaving(true);
      setError(null);
      try {
        await deleteMappingRule(org.id, ruleId);
        setRules((prev) => prev.filter((item) => item.id !== ruleId));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo borrar la regla.');
      } finally {
        setSaving(false);
      }
    },
    [org, canManage]
  );

  const saveAtajoPueBancos = useCallback(
    async (enabled: boolean) => {
      if (!org || !canManage) return;
      setSaving(true);
      setError(null);
      try {
        await updateAtajoPueBancos(org.id, enabled);
        setAtajoPueBancos(enabled);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo guardar el atajo PUE.');
      } finally {
        setSaving(false);
      }
    },
    [org, canManage]
  );

  return {
    accounts,
    pendientes,
    rules,
    atajoPueBancos,
    saveAtajoPueBancos,
    saving,
    syncing,
    syncMessage,
    error,
    saveAccounts,
    syncMissingSeed,
    saveRule,
    removeRule,
  };
}
