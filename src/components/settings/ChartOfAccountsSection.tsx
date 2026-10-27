import { useEffect, useState } from 'react';
import { mappingRuleIssue } from '../../services/accountMappingService';
import type {
  AccountMappingMatch,
  AccountMappingRule,
  AccountNaturaleza,
  CatalogAccount,
  IvaTipo,
} from '../../types/chartOfAccounts';
import { ACCOUNT_NATURALEZAS } from '../../types/chartOfAccounts';

type DraftAccount = {
  code: string;
  name: string;
  naturaleza: AccountNaturaleza;
  tipo_iva: '' | IvaTipo;
  activa: boolean;
};

const EMPTY_ACCOUNT: DraftAccount = {
  code: '',
  name: '',
  naturaleza: 'gasto',
  tipo_iva: '',
  activa: true,
};

type Props = {
  accounts: CatalogAccount[];
  pendientes: string[];
  rules: AccountMappingRule[];
  canManage: boolean;
  saving: boolean;
  error: string | null;
  onSaveAccounts: (accounts: CatalogAccount[], pendientes: string[]) => Promise<void>;
  onSaveRule: (rule: AccountMappingRule) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
};

function matchSummary(match: AccountMappingMatch): string {
  const parts: string[] = [];
  if (match.tipo) parts.push(match.tipo);
  if (match.cfdi_tipo) parts.push(`CFDI ${match.cfdi_tipo}`);
  if (match.clave_prod_serv) parts.push(`clave ${match.clave_prod_serv}`);
  if (match.metodo_pago_sat) parts.push(match.metodo_pago_sat);
  if (match.uso_cfdi) parts.push(`uso ${match.uso_cfdi}`);
  if (match.rfc_contraparte) parts.push(match.rfc_contraparte);
  return parts.join(' · ');
}

const fieldClass =
  'mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-ink';

export function ChartOfAccountsSection({
  accounts,
  pendientes,
  rules,
  canManage,
  saving,
  error,
  onSaveAccounts,
  onSaveRule,
  onDeleteRule,
}: Props) {
  const [drafts, setDrafts] = useState<CatalogAccount[]>(accounts);
  const [pending, setPending] = useState<string[]>(pendientes);
  const [form, setForm] = useState<DraftAccount>(EMPTY_ACCOUNT);
  const [localError, setLocalError] = useState<string | null>(null);
  const [rulePriority, setRulePriority] = useState('10');
  const [ruleCode, setRuleCode] = useState('');
  const [ruleTipo, setRuleTipo] = useState('');
  const [ruleCfdi, setRuleCfdi] = useState('');
  const [ruleClave, setRuleClave] = useState('');
  const [ruleMetodo, setRuleMetodo] = useState('');
  const [ruleUso, setRuleUso] = useState('');
  const [ruleRfc, setRuleRfc] = useState('');
  const [ruleEnabled, setRuleEnabled] = useState(true);

  useEffect(() => {
    setDrafts(accounts);
    setPending(pendientes);
  }, [accounts, pendientes]);

  const active = drafts.filter((a) => a.activa).sort((a, b) => a.code.localeCompare(b.code));

  const cancel = () => {
    setDrafts(accounts);
    setPending(pendientes);
    setForm(EMPTY_ACCOUNT);
    setLocalError(null);
  };

  const addAccount = () => {
    if (!canManage) return;
    if (form.naturaleza === 'iva' && !form.tipo_iva) {
      setLocalError('Elige si el IVA es trasladado o acreditable.');
      return;
    }
    const next: CatalogAccount = {
      code: form.code.trim(),
      name: form.name.trim(),
      naturaleza: form.naturaleza,
      activa: form.activa,
      ...(form.naturaleza === 'iva' && form.tipo_iva ? { tipo_iva: form.tipo_iva } : {}),
    };
    const without = drafts.filter((a) => a.code !== next.code);
    setDrafts([...without, next].sort((a, b) => a.code.localeCompare(b.code)));
    setPending((prev) => prev.filter((name) => name !== next.name));
    setForm(EMPTY_ACCOUNT);
    setLocalError(null);
  };

  return (
    <section className="space-y-6" aria-label="Catálogo de cuentas">
      <div>
        <h4 className="text-sm font-medium text-ink">Catálogo de cuentas</h4>
        <p className="text-xs text-ink-muted">
          Cada cuenta tiene código y naturaleza. Los nombres pendientes no se usan hasta asignarles ambos.
        </p>
      </div>

      {(error || localError) && (
        <p className="text-sm text-danger" role="alert">
          {localError || error}
        </p>
      )}

      <ul className="space-y-1 text-sm">
        {drafts.map((account) => (
          <li key={account.code} className="flex justify-between gap-3 font-mono text-ink">
            <span>
              {account.code} {account.name}
            </span>
            <span className="text-ink-muted">
              {account.naturaleza}
              {account.tipo_iva ? ` · ${account.tipo_iva}` : ''}
              {account.activa ? '' : ' · inactiva'}
            </span>
          </li>
        ))}
      </ul>

      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-ink">Pendientes sin naturaleza</p>
          <ul>
            {pending.map((name) => (
              <li key={name} className="flex items-center justify-between gap-2 text-sm">
                <span>{name}</span>
                {canManage && (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className="text-brand"
                      onClick={() =>
                        setForm({ ...EMPTY_ACCOUNT, name, naturaleza: 'gasto' })
                      }
                    >
                      Asignar
                    </button>
                    <button
                      type="button"
                      className="text-ink-muted"
                      onClick={() => setPending((prev) => prev.filter((item) => item !== name))}
                    >
                      Descartar
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canManage && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm text-ink">
            Código
            <input
              aria-label="Código de cuenta"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-ink"
            />
          </label>
          <label className="text-sm text-ink">
            Nombre
            <input
              aria-label="Nombre de cuenta"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-ink"
            />
          </label>
          <label className="text-sm text-ink">
            Naturaleza
            <select
              aria-label="Naturaleza"
              value={form.naturaleza}
              onChange={(e) =>
                setForm({
                  ...form,
                  naturaleza: e.target.value as AccountNaturaleza,
                  tipo_iva: e.target.value === 'iva' ? form.tipo_iva : '',
                })
              }
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-ink"
            >
              {ACCOUNT_NATURALEZAS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          {form.naturaleza === 'iva' && (
            <label className="text-sm text-ink">
              Tipo de IVA
              <select
                aria-label="Tipo de IVA"
                value={form.tipo_iva}
                onChange={(e) =>
                  setForm({ ...form, tipo_iva: e.target.value as '' | IvaTipo })
                }
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-ink"
              >
                <option value="">Elige</option>
                <option value="trasladado">trasladado</option>
                <option value="acreditable">acreditable</option>
              </select>
            </label>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" className="rounded-md bg-brand px-3 py-2 text-sm text-brand-foreground" onClick={addAccount}>
              Agregar al borrador
            </button>
            <button type="button" className="rounded-md border border-border px-3 py-2 text-sm text-ink" onClick={cancel}>
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm text-ink"
              disabled={saving}
              onClick={() => void onSaveAccounts(drafts, pending)}
            >
              {saving ? 'Guardando…' : 'Guardar catálogo'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-ink">Reglas de mapeo</h4>
        <ul className="text-sm text-ink">
          {rules.map((rule) => (
            <li key={rule.id} className="flex justify-between gap-2">
              <span>
                {rule.priority} → {rule.account_code}
                {matchSummary(rule.match) ? ` · ${matchSummary(rule.match)}` : ''}
                {rule.enabled ? '' : ' (apagada)'}
              </span>
              {canManage && (
                <button type="button" className="text-ink-muted" onClick={() => void onDeleteRule(rule.id)}>
                  Borrar
                </button>
              )}
            </li>
          ))}
        </ul>
        {canManage && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm text-ink">
              Prioridad
              <input
                aria-label="Prioridad de la regla"
                value={rulePriority}
                onChange={(e) => setRulePriority(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="text-sm text-ink">
              Cuenta destino
              <select
                aria-label="Cuenta destino de la regla"
                value={ruleCode}
                onChange={(e) => setRuleCode(e.target.value)}
                className={fieldClass}
              >
                <option value="">Elige</option>
                {active.map((account) => (
                  <option key={account.code} value={account.code}>
                    {account.code} {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-ink">
              Tipo de movimiento
              <select
                aria-label="Tipo de movimiento"
                value={ruleTipo}
                onChange={(e) => setRuleTipo(e.target.value)}
                className={fieldClass}
              >
                <option value="">—</option>
                <option value="ingreso">ingreso</option>
                <option value="egreso">egreso</option>
              </select>
            </label>
            <label className="text-sm text-ink">
              Tipo de CFDI
              <select
                aria-label="Tipo de CFDI"
                value={ruleCfdi}
                onChange={(e) => setRuleCfdi(e.target.value)}
                className={fieldClass}
              >
                <option value="">—</option>
                <option value="I">Ingreso</option>
                <option value="E">Egreso</option>
                <option value="N">Nómina</option>
                <option value="P">Pago</option>
                <option value="T">Traslado</option>
              </select>
            </label>
            <label className="text-sm text-ink">
              Clave de producto
              <input
                aria-label="Clave de producto"
                value={ruleClave}
                onChange={(e) => setRuleClave(e.target.value)}
                className={`${fieldClass} font-mono`}
              />
            </label>
            <label className="text-sm text-ink">
              Método de pago
              <select
                aria-label="Método de pago"
                value={ruleMetodo}
                onChange={(e) => setRuleMetodo(e.target.value)}
                className={fieldClass}
              >
                <option value="">—</option>
                <option value="PUE">PUE</option>
                <option value="PPD">PPD</option>
              </select>
            </label>
            <label className="text-sm text-ink">
              Uso de CFDI
              <input
                aria-label="Uso de CFDI"
                value={ruleUso}
                onChange={(e) => setRuleUso(e.target.value)}
                className={`${fieldClass} font-mono`}
              />
            </label>
            <label className="text-sm text-ink">
              RFC de la contraparte
              <input
                aria-label="RFC de la contraparte"
                value={ruleRfc}
                onChange={(e) => setRuleRfc(e.target.value)}
                className={`${fieldClass} font-mono`}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
              <input
                type="checkbox"
                aria-label="Regla activa"
                checked={ruleEnabled}
                onChange={(e) => setRuleEnabled(e.target.checked)}
              />
              Regla activa
            </label>
            <button
              type="button"
              className="rounded-md bg-brand px-3 py-2 text-sm text-brand-foreground sm:col-span-2 disabled:opacity-60"
              disabled={saving}
              title={saving ? 'Espera a que termine el guardado.' : undefined}
              onClick={() => {
                const match: AccountMappingMatch = {
                  ...(ruleTipo === 'ingreso' || ruleTipo === 'egreso' ? { tipo: ruleTipo } : {}),
                  ...(ruleCfdi === 'I' || ruleCfdi === 'E' || ruleCfdi === 'N' || ruleCfdi === 'P' || ruleCfdi === 'T'
                    ? { cfdi_tipo: ruleCfdi }
                    : {}),
                  ...(ruleClave.trim() ? { clave_prod_serv: ruleClave.trim() } : {}),
                  ...(ruleMetodo === 'PUE' || ruleMetodo === 'PPD' ? { metodo_pago_sat: ruleMetodo } : {}),
                  ...(ruleUso.trim() ? { uso_cfdi: ruleUso.trim().toUpperCase() } : {}),
                  ...(ruleRfc.trim() ? { rfc_contraparte: ruleRfc.trim().toUpperCase() } : {}),
                };
                const draft: AccountMappingRule = {
                  id: crypto.randomUUID(),
                  organization_id: '',
                  priority: Number(rulePriority),
                  enabled: ruleEnabled,
                  account_code: ruleCode,
                  match,
                };
                const issue = mappingRuleIssue(draft);
                if (issue) {
                  setLocalError(issue);
                  return;
                }
                setLocalError(null);
                void onSaveRule(draft);
              }}
            >
              Guardar regla
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export function AccountCodeOptions({ accounts }: { accounts: readonly CatalogAccount[] }) {
  return (
    <>
      {accounts
        .filter((a) => a.activa)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((account) => (
          <option key={account.code} value={account.code}>
            {account.code} {account.name}
          </option>
        ))}
    </>
  );
}
