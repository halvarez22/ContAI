import { useEffect, useState } from 'react';

type Props = {
  enabled: boolean;
  canManage: boolean;
  saving: boolean;
  onSave: (enabled: boolean) => Promise<void>;
};

export function AtajoPueSection({ enabled, canManage, saving, onSave }: Props) {
  const [draft, setDraft] = useState(enabled);

  useEffect(() => {
    setDraft(enabled);
  }, [enabled]);

  return (
    <section className="space-y-3" aria-label="Atajo PUE a Bancos">
      <h4 className="text-sm font-medium text-ink">PUE contra Bancos</h4>
      <p className="text-xs text-ink-muted">
        Si se activa, un CFDI PUE se devenga contra Bancos en lugar de Clientes o Proveedores.
        Por defecto está apagado. Un PPD no usa este atajo.
      </p>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          aria-label="Activar atajo PUE a Bancos"
          checked={draft}
          disabled={!canManage || saving}
          onChange={(event) => setDraft(event.target.checked)}
        />
        Activar atajo PUE a Bancos
      </label>
      {!canManage && (
        <p className="text-xs text-ink-muted">Solo el dueño o un administrador puede cambiarlo.</p>
      )}
      {canManage && (
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md bg-brand px-3 py-2 text-sm text-brand-foreground disabled:opacity-60"
            disabled={saving || draft === enabled}
            title={saving ? 'Espera a que termine el guardado.' : undefined}
            onClick={() => void onSave(draft)}
          >
            {saving ? 'Guardando…' : 'Guardar atajo'}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 text-sm text-ink"
            disabled={saving}
            onClick={() => setDraft(enabled)}
          >
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}
