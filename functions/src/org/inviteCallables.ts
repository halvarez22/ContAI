/**
 * Callables de invitaciones E8.2.
 * Tokens: raw solo en email/respuesta al invitante; en Firestore solo token_hash.
 */

import { createHash } from 'crypto';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { Resend } from 'resend';
import {
  assertCanManageOrg,
  memberDocId,
  normalizeInviteEmail,
} from './membership';
import { generateInviteToken, hashInviteToken } from './inviteCrypto';
import {
  buildInviteEmailHtml,
  buildInviteEmailText,
} from './inviteEmailTemplate';
import {
  INVITE_MAX_RESENDS,
  INVITE_RATE_LIMIT_PER_ORG_HOUR,
  INVITE_TTL_MS,
  canInviteRole,
  isInviteExpired,
  type InvitableRole,
} from './invitePolicy';

const INVITES = 'organization_invitations';
const MEMBERS = 'organization_members';
const ORGS = 'organizations';

export const resendApiKey = defineSecret('RESEND_API_KEY');

function assertAuth(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  }
  return uid;
}

function appOrigin(): string {
  const fromEnv = process.env.APP_ORIGIN?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'https://contai.web.app';
}

function inviteFromEmail(): string {
  return process.env.INVITE_FROM_EMAIL?.trim() || 'ContAI <onboarding@resend.dev>';
}

function buildAcceptUrl(rawToken: string): string {
  return `${appOrigin()}/invite?token=${encodeURIComponent(rawToken)}`;
}

async function countRecentInviteOps(orgId: string, nowMs: number): Promise<number> {
  const since = Timestamp.fromMillis(nowMs - 60 * 60 * 1000);
  const snap = await getFirestore()
    .collection(INVITES)
    .where('organization_id', '==', orgId)
    .where('updated_at', '>=', since)
    .get();
  return snap.size;
}

async function findPendingInvite(
  orgId: string,
  emailNormalized: string
) {
  const snap = await getFirestore()
    .collection(INVITES)
    .where('organization_id', '==', orgId)
    .where('email_normalized', '==', emailNormalized)
    .where('status', '==', 'pending')
    .limit(5)
    .get();
  if (snap.empty) return null;
  return snap.docs[0] ?? null;
}

async function sendInviteEmail(params: {
  to: string;
  orgNombre: string;
  orgRfc: string;
  role: string;
  invitedByNombre: string;
  acceptUrl: string;
  expiresAt: Date;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = resendApiKey.value();
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY no configurada' };
  }
  const expiresLabel = params.expiresAt.toISOString();
  const html = buildInviteEmailHtml({
    orgNombre: params.orgNombre,
    orgRfc: params.orgRfc,
    role: params.role,
    invitedByNombre: params.invitedByNombre,
    acceptUrl: params.acceptUrl,
    expiresLabel,
  });
  const text = buildInviteEmailText({
    orgNombre: params.orgNombre,
    orgRfc: params.orgRfc,
    role: params.role,
    invitedByNombre: params.invitedByNombre,
    acceptUrl: params.acceptUrl,
    expiresLabel,
  });
  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: inviteFromEmail(),
      to: params.to,
      subject: `Invitación a ${params.orgNombre} — ContAI`,
      html,
      text,
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Error al enviar email',
    };
  }
}

async function loadOrgSnapshots(orgId: string): Promise<{
  nombre: string;
  rfc: string;
}> {
  const snap = await getFirestore().collection(ORGS).doc(orgId).get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Organización no encontrada.');
  }
  const data = snap.data() ?? {};
  return {
    nombre: String(data.nombre || orgId),
    rfc: String(data.rfc || ''),
  };
}

async function inviterNombre(uid: string): Promise<string> {
  const snap = await getFirestore().collection('users').doc(uid).get();
  const nombre = snap.data()?.nombre;
  if (typeof nombre === 'string' && nombre.trim()) return nombre.trim();
  return uid;
}

export const createOrgInvite = onCall(
  { secrets: [resendApiKey], region: 'us-central1' },
  async (request) => {
    const uid = assertAuth(request.auth?.uid);
    const organizationId = String(request.data?.organizationId || '').trim();
    const emailRaw = String(request.data?.email || '');
    const roleRaw = String(request.data?.role || '');
    const emailNormalized = normalizeInviteEmail(emailRaw);

    if (!emailNormalized || !emailNormalized.includes('@')) {
      throw new HttpsError('invalid-argument', 'Email inválido.');
    }

    const { orgId, role: inviterRole } = await assertCanManageOrg(
      uid,
      organizationId
    );
    if (!canInviteRole(inviterRole, roleRaw)) {
      throw new HttpsError(
        'permission-denied',
        'No puedes asignar ese rol con tu permiso actual.'
      );
    }
    const role = roleRaw as InvitableRole;

    const nowMs = Date.now();
    const recent = await countRecentInviteOps(orgId, nowMs);
    if (recent >= INVITE_RATE_LIMIT_PER_ORG_HOUR) {
      throw new HttpsError(
        'resource-exhausted',
        'Límite de invitaciones por hora alcanzado.'
      );
    }

    const org = await loadOrgSnapshots(orgId);
    const byNombre = await inviterNombre(uid);
    const rawToken = generateInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(nowMs + INVITE_TTL_MS);
    const acceptUrl = buildAcceptUrl(rawToken);

    const existing = await findPendingInvite(orgId, emailNormalized);
    const db = getFirestore();
    let inviteId: string;

    if (existing) {
      inviteId = existing.id;
      const resendCount = Number(existing.data()?.resend_count || 0);
      if (resendCount >= INVITE_MAX_RESENDS) {
        throw new HttpsError(
          'resource-exhausted',
          'Máximo de reenvíos alcanzado para esta invitación.'
        );
      }
      await existing.ref.update({
        token_hash: tokenHash,
        role,
        invited_by_uid: uid,
        invited_by_nombre: byNombre,
        org_nombre: org.nombre,
        org_rfc: org.rfc,
        expires_at: Timestamp.fromDate(expiresAt),
        updated_at: FieldValue.serverTimestamp(),
        resend_count: resendCount + 1,
        last_email_error: FieldValue.delete(),
      });
    } else {
      const ref = db.collection(INVITES).doc();
      inviteId = ref.id;
      await ref.set({
        organization_id: orgId,
        email_normalized: emailNormalized,
        role,
        invited_by_uid: uid,
        invited_by_nombre: byNombre,
        org_nombre: org.nombre,
        org_rfc: org.rfc,
        token_hash: tokenHash,
        status: 'pending',
        expires_at: Timestamp.fromDate(expiresAt),
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
        resend_count: 0,
      });
    }

    const emailResult = await sendInviteEmail({
      to: emailNormalized,
      orgNombre: org.nombre,
      orgRfc: org.rfc,
      role,
      invitedByNombre: byNombre,
      acceptUrl,
      expiresAt,
    });

    if (!emailResult.ok) {
      await db.collection(INVITES).doc(inviteId).set(
        { last_email_error: emailResult.error || 'send_failed', updated_at: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }

    return {
      inviteId,
      expiresAt: expiresAt.toISOString(),
      inviteUrl: acceptUrl,
      emailSent: emailResult.ok,
      emailError: emailResult.error,
    };
  }
);

export const resendOrgInvite = onCall(
  { secrets: [resendApiKey], region: 'us-central1' },
  async (request) => {
    const uid = assertAuth(request.auth?.uid);
    const inviteId = String(request.data?.inviteId || '').trim();
    if (!inviteId) {
      throw new HttpsError('invalid-argument', 'inviteId requerido.');
    }

    const ref = getFirestore().collection(INVITES).doc(inviteId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Invitación no encontrada.');
    }
    const data = snap.data() ?? {};
    const orgId = String(data.organization_id || '');
    const { role: inviterRole } = await assertCanManageOrg(uid, orgId);

    if (data.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'La invitación no está pendiente.');
    }
    if (isInviteExpired(data.expires_at as Timestamp)) {
      await ref.update({ status: 'expired', updated_at: FieldValue.serverTimestamp() });
      throw new HttpsError('failed-precondition', 'La invitación expiró.');
    }

    const role = String(data.role || '');
    if (!canInviteRole(inviterRole, role)) {
      throw new HttpsError('permission-denied', 'No puedes reenviar con ese rol.');
    }

    const nowMs = Date.now();
    if ((await countRecentInviteOps(orgId, nowMs)) >= INVITE_RATE_LIMIT_PER_ORG_HOUR) {
      throw new HttpsError('resource-exhausted', 'Límite de invitaciones por hora alcanzado.');
    }

    const resendCount = Number(data.resend_count || 0);
    if (resendCount >= INVITE_MAX_RESENDS) {
      throw new HttpsError('resource-exhausted', 'Máximo de reenvíos alcanzado.');
    }

    const rawToken = generateInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(nowMs + INVITE_TTL_MS);
    const acceptUrl = buildAcceptUrl(rawToken);
    const byNombre = await inviterNombre(uid);

    await ref.update({
      token_hash: tokenHash,
      expires_at: Timestamp.fromDate(expiresAt),
      invited_by_uid: uid,
      invited_by_nombre: byNombre,
      updated_at: FieldValue.serverTimestamp(),
      resend_count: resendCount + 1,
    });

    const emailResult = await sendInviteEmail({
      to: String(data.email_normalized || ''),
      orgNombre: String(data.org_nombre || ''),
      orgRfc: String(data.org_rfc || ''),
      role,
      invitedByNombre: byNombre,
      acceptUrl,
      expiresAt,
    });

    if (!emailResult.ok) {
      await ref.set(
        { last_email_error: emailResult.error || 'send_failed' },
        { merge: true }
      );
    }

    return {
      inviteId,
      expiresAt: expiresAt.toISOString(),
      inviteUrl: acceptUrl,
      emailSent: emailResult.ok,
      emailError: emailResult.error,
    };
  }
);

export const revokeOrgInvite = onCall(
  { region: 'us-central1' },
  async (request) => {
    const uid = assertAuth(request.auth?.uid);
    const inviteId = String(request.data?.inviteId || '').trim();
    if (!inviteId) {
      throw new HttpsError('invalid-argument', 'inviteId requerido.');
    }
    const ref = getFirestore().collection(INVITES).doc(inviteId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Invitación no encontrada.');
    }
    const orgId = String(snap.data()?.organization_id || '');
    await assertCanManageOrg(uid, orgId);
    await ref.update({
      status: 'revoked',
      updated_at: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  }
);

export const previewOrgInvite = onCall(
  { region: 'us-central1' },
  async (request) => {
    assertAuth(request.auth?.uid);
    const rawToken = String(request.data?.token || '').trim();
    if (!rawToken) {
      throw new HttpsError('invalid-argument', 'token requerido.');
    }
    const tokenHash = hashInviteToken(rawToken);
    const snap = await getFirestore()
      .collection(INVITES)
      .where('token_hash', '==', tokenHash)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (snap.empty) {
      throw new HttpsError(
        'invalid-argument',
        'Invitación no válida o expirada'
      );
    }
    const doc = snap.docs[0];
    const data = doc.data();
    if (isInviteExpired(data.expires_at as Timestamp)) {
      await doc.ref.update({
        status: 'expired',
        updated_at: FieldValue.serverTimestamp(),
      });
      throw new HttpsError(
        'invalid-argument',
        'Invitación no válida o expirada'
      );
    }

    const expiresAt = data.expires_at as Timestamp | undefined;
    return {
      organizationId: String(data.organization_id || ''),
      orgNombre: String(data.org_nombre || ''),
      orgRfc: String(data.org_rfc || ''),
      role: String(data.role || ''),
      invitedByNombre: String(data.invited_by_nombre || ''),
      expiresAt: expiresAt?.toDate?.()?.toISOString?.() ?? null,
      emailNormalized: String(data.email_normalized || ''),
    };
  }
);

export const acceptOrgInvite = onCall(
  { region: 'us-central1' },
  async (request) => {
    const uid = assertAuth(request.auth?.uid);
    const rawToken = String(request.data?.token || '').trim();
    if (!rawToken) {
      throw new HttpsError('invalid-argument', 'token requerido.');
    }

    const authEmail = request.auth?.token?.email;
    if (!authEmail || typeof authEmail !== 'string') {
      throw new HttpsError(
        'failed-precondition',
        'Tu cuenta de Google no tiene email verificado.'
      );
    }
    const authEmailNormalized = normalizeInviteEmail(authEmail);

    const tokenHash = hashInviteToken(rawToken);
    const snap = await getFirestore()
      .collection(INVITES)
      .where('token_hash', '==', tokenHash)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (snap.empty) {
      throw new HttpsError(
        'invalid-argument',
        'Invitación no válida o expirada'
      );
    }

    const inviteDoc = snap.docs[0];
    const data = inviteDoc.data();
    if (isInviteExpired(data.expires_at as Timestamp)) {
      await inviteDoc.ref.update({
        status: 'expired',
        updated_at: FieldValue.serverTimestamp(),
      });
      throw new HttpsError(
        'invalid-argument',
        'Invitación no válida o expirada'
      );
    }

    const inviteEmail = normalizeInviteEmail(String(data.email_normalized || ''));
    if (authEmailNormalized !== inviteEmail) {
      throw new HttpsError(
        'permission-denied',
        `Usa la cuenta ${inviteEmail} para aceptar esta invitación.`
      );
    }

    const orgId = String(data.organization_id || '');
    const role = String(data.role || '');
    if (!canInviteRole('owner', role)) {
      throw new HttpsError('failed-precondition', 'Rol de invitación inválido.');
    }

    const memberId = memberDocId(uid, orgId);
    const memberRef = getFirestore().collection(MEMBERS).doc(memberId);
    const existingMember = await memberRef.get();
    if (existingMember.exists && existingMember.data()?.activo !== false) {
      await inviteDoc.ref.update({
        status: 'accepted',
        accepted_by_uid: uid,
        accepted_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
        token_hash: createHash('sha256')
          .update(`used:${inviteDoc.id}:${Date.now()}`, 'utf8')
          .digest('hex'),
      });
      await getFirestore()
        .collection('users')
        .doc(uid)
        .set({ active_organization_id: orgId }, { merge: true });
      return { organizationId: orgId, role: String(existingMember.data()?.role || role) };
    }

    const displayName =
      typeof request.auth?.token?.name === 'string'
        ? request.auth.token.name
        : authEmailNormalized;

    const batch = getFirestore().batch();
    batch.set(
      memberRef,
      {
        organization_id: orgId,
        user_id: uid,
        role,
        activo: true,
        email: authEmailNormalized,
        nombre: displayName,
        updated_at: FieldValue.serverTimestamp(),
        ...(existingMember.exists ? {} : { creado_en: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );
    batch.update(inviteDoc.ref, {
      status: 'accepted',
      accepted_by_uid: uid,
      accepted_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      // Invalidar reuso: rotar hash a valor muerto
      token_hash: createHash('sha256')
        .update(`used:${inviteDoc.id}:${Date.now()}`, 'utf8')
        .digest('hex'),
    });
    batch.set(
      getFirestore().collection('users').doc(uid),
      { active_organization_id: orgId },
      { merge: true }
    );
    await batch.commit();

    return { organizationId: orgId, role };
  }
);
