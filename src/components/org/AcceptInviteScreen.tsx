import { useEffect, useState } from 'react';
import { Building2, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Alert } from '../ui/Alert';
import {
  acceptOrgInvite,
  previewOrgInvite,
} from '../../services/organizationInviteService';
import type { OrgInvitePreview } from '../../types/organizationInvite';

export type AcceptInviteScreenProps = {
  token: string;
  isAuthenticated: boolean;
  userEmail?: string | null;
  onLogin: () => void;
  onAccepted: (organizationId: string) => void | Promise<void>;
};

export function AcceptInviteScreen({
  token,
  isAuthenticated,
  userEmail,
  onLogin,
  onAccepted,
}: AcceptInviteScreenProps) {
  const [preview, setPreview] = useState<OrgInvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isAuthenticated) {
        setLoading(false);
        setPreview(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await previewOrgInvite(token);
        if (!cancelled) setPreview(data);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Invitación no válida o expirada'
          );
          setPreview(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, isAuthenticated]);

  const handleAccept = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await acceptOrgInvite(token);
      await onAccepted(result.organizationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aceptar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-elevated p-4">
      <Card className="max-w-md w-full p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-brand-muted rounded-2xl flex items-center justify-center">
            <Building2 className="w-6 h-6 text-brand" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">Invitación a ContAI</h1>
            <p className="text-xs text-ink-muted">Revisa los datos antes de aceptar</p>
          </div>
        </div>

        {!isAuthenticated ? (
          <>
            <p className="text-sm text-ink-muted">
              Inicia sesión con Google usando el email al que te invitaron para
              ver el detalle y aceptar.
            </p>
            <Button type="button" className="w-full gap-2" onClick={onLogin}>
              <ShieldCheck className="w-4 h-4" />
              Iniciar sesión con Google
            </Button>
          </>
        ) : loading ? (
          <p className="text-sm text-ink-subtle">Cargando invitación…</p>
        ) : preview ? (
          <div className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-ink-muted">Organización</dt>
                <dd className="font-semibold text-ink">{preview.orgNombre}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">RFC</dt>
                <dd className="font-mono text-ink">{preview.orgRfc || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Rol asignado</dt>
                <dd className="font-medium text-ink">{preview.role}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-muted">Invitado por</dt>
                <dd className="text-ink">{preview.invitedByNombre}</dd>
              </div>
              {preview.expiresAt ? (
                <div>
                  <dt className="text-xs text-ink-muted">Expira</dt>
                  <dd className="text-ink text-xs">
                    {new Date(preview.expiresAt).toLocaleString()}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-ink-muted">Email de la invitación</dt>
                <dd className="text-ink text-xs">{preview.emailNormalized}</dd>
              </div>
              {userEmail ? (
                <div>
                  <dt className="text-xs text-ink-muted">Tu sesión</dt>
                  <dd className="text-ink text-xs">{userEmail}</dd>
                </div>
              ) : null}
            </dl>
            {error ? <Alert variant="error">{error}</Alert> : null}
            <Button
              type="button"
              className="w-full"
              disabled={busy}
              onClick={() => void handleAccept()}
            >
              {busy ? 'Aceptando…' : 'Aceptar invitación'}
            </Button>
          </div>
        ) : (
          <Alert variant="error">
            {error || 'Invitación no válida o expirada'}
          </Alert>
        )}
      </Card>
    </div>
  );
}
