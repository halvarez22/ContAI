export type InviteEmailParams = {
  orgNombre: string;
  orgRfc: string;
  role: string;
  invitedByNombre: string;
  acceptUrl: string;
  expiresLabel: string;
};

export function buildInviteEmailHtml(p: InviteEmailParams): string {
  const safe = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; color: #111; line-height: 1.5;">
  <h2>Invitación a ContAI</h2>
  <p><strong>${safe(p.invitedByNombre)}</strong> te invita a colaborar en:</p>
  <ul>
    <li><strong>Organización:</strong> ${safe(p.orgNombre)}</li>
    <li><strong>RFC:</strong> ${safe(p.orgRfc || '—')}</li>
    <li><strong>Rol:</strong> ${safe(p.role)}</li>
  </ul>
  <p><a href="${safe(p.acceptUrl)}" style="display:inline-block;padding:10px 16px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px;">Aceptar invitación</a></p>
  <p style="font-size:12px;color:#666;">Este enlace expira el ${safe(p.expiresLabel)} (72 horas). Si no esperabas esta invitación, ignora este correo.</p>
</body>
</html>`;
}

export function buildInviteEmailText(p: InviteEmailParams): string {
  return [
    'Invitación a ContAI',
    `${p.invitedByNombre} te invita a: ${p.orgNombre} (RFC ${p.orgRfc || '—'})`,
    `Rol: ${p.role}`,
    `Aceptar: ${p.acceptUrl}`,
    `Expira: ${p.expiresLabel}`,
  ].join('\n');
}
