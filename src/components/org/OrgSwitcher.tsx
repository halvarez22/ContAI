import { Building2, ChevronsUpDown } from 'lucide-react';
import { Button } from '../ui/Button';
import type { OrganizationSummary } from '../../types/organization';

export type OrgSwitcherProps = {
  summaries: OrganizationSummary[];
  activeOrganizationId: string | null;
  onSelect: (organizationId: string) => void;
  disabled?: boolean;
};

export function OrgSwitcher({
  summaries,
  activeOrganizationId,
  onSelect,
  disabled,
}: OrgSwitcherProps) {
  const active = summaries.find((s) => s.organization.id === activeOrganizationId);

  if (summaries.length === 0) {
    return (
      <div className="flex items-center gap-2 text-ink-muted text-xs">
        <Building2 className="w-4 h-4" />
        <span>Sin empresa</span>
      </div>
    );
  }

  if (summaries.length === 1) {
    return (
      <div className="hidden md:flex flex-col items-center justify-center px-2 text-center min-w-0">
        <p className="text-xs font-semibold text-ink truncate max-w-md">
          {active?.organization.nombre || 'Empresa'}
        </p>
        {active?.organization.rfc ? (
          <p className="text-[10px] text-ink-muted font-mono mt-0.5">
            RFC {active.organization.rfc}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="hidden md:flex items-center gap-1 min-w-0 max-w-xs">
      <Building2 className="w-4 h-4 text-brand shrink-0" aria-hidden />
      <label htmlFor="org-switcher" className="sr-only">
        Organización activa
      </label>
      <div className="relative min-w-0 flex-1">
        <select
          id="org-switcher"
          disabled={disabled}
          value={activeOrganizationId ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full appearance-none bg-surface-muted border border-border rounded-lg pl-3 pr-8 py-1.5 text-xs font-semibold text-ink truncate focus-visible:ring-2 focus-visible:ring-focus outline-none"
        >
          {summaries.map((s) => (
            <option key={s.organization.id} value={s.organization.id}>
              {s.organization.nombre}
              {s.organization.rfc ? ` · ${s.organization.rfc}` : ''}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="w-3.5 h-3.5 text-ink-subtle absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
}

/** Variante compacta para cuando no hay select (smoke tests) */
export function OrgSwitcherLabel({
  nombre,
  rfc,
}: {
  nombre: string;
  rfc?: string;
}) {
  return (
    <Button type="button" variant="ghost" className="text-xs gap-2" tabIndex={-1}>
      <Building2 className="w-4 h-4" />
      <span className="truncate">{nombre}</span>
      {rfc ? <span className="font-mono text-ink-muted">{rfc}</span> : null}
    </Button>
  );
}
