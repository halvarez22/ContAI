import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ContAILogo } from '../brand/ContAILogo';
import type { OrganizationSummary } from '../../types/organization';

export type OrgPickerScreenProps = {
  summaries: OrganizationSummary[];
  onSelect: (organizationId: string) => void | Promise<void>;
  onCreate?: (nombre: string, rfc: string) => void | Promise<void>;
};

export function OrgPickerScreen({
  summaries,
  onSelect,
  onCreate,
}: OrgPickerScreenProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [nombre, setNombre] = useState('');
  const [rfc, setRfc] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await onSelect(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo seleccionar');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async () => {
    if (!onCreate) return;
    setCreating(true);
    setError(null);
    try {
      await onCreate(nombre, rfc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-elevated flex flex-col items-center justify-center p-4">
      <ContAILogo variant="full" size="lg" className="mb-6" />
      <div className="w-full max-w-lg space-y-6">
        <PageHeader
          title="Selecciona una empresa"
          description="Elige la organización con la que trabajarás en esta sesión."
        />
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="space-y-3">
          {summaries.map((s) => (
            <Card key={s.organization.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-start gap-3">
                <Building2 className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate">{s.organization.nombre}</p>
                  {s.organization.rfc ? (
                    <p className="text-xs font-mono text-ink-muted">RFC {s.organization.rfc}</p>
                  ) : (
                    <p className="text-xs text-ink-subtle">Sin RFC</p>
                  )}
                  <p className="text-[10px] text-ink-subtle mt-1 capitalize">{s.membership.role}</p>
                </div>
              </div>
              <Button
                type="button"
                disabled={busyId !== null}
                onClick={() => {
                  void handleSelect(s.organization.id);
                }}
              >
                {busyId === s.organization.id ? 'Entrando…' : 'Entrar'}
              </Button>
            </Card>
          ))}
        </div>
        {onCreate ? (
          <Card className="p-4 space-y-3">
            <p className="text-sm font-semibold text-ink">Crear nueva empresa</p>
            <Input
              label="Nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              id="new-org-nombre"
            />
            <Input
              label="RFC"
              value={rfc}
              onChange={(e) => setRfc(e.target.value.toUpperCase())}
              id="new-org-rfc"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={creating || !nombre.trim()}
              onClick={() => {
                void handleCreate();
              }}
            >
              {creating ? 'Creando…' : 'Crear y entrar'}
            </Button>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
