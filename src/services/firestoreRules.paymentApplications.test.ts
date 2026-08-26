/**
 * @vitest-environment node
 * Requiere emulador Firestore (npm run test:rules).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { memberDocId } from '../types/organization';

const PROJECT_ID = 'contai-rules-test';
const ORG = 'org_main';
const CONTADOR_UID = 'contador_uid';
const VIEWER_UID = 'viewer_uid';

let testEnv: RulesTestEnvironment;

function validApplication(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    organization_id: ORG,
    usuario_id: CONTADOR_UID,
    source_type: 'cfdi_pago',
    source_id: 'pago-uuid-1',
    target_transaction_id: 'tx-target-1',
    amount: 100,
    ...overrides,
  };
}

async function seedOrgMember(
  uid: string,
  orgId: string,
  role: 'owner' | 'admin' | 'contador' | 'viewer'
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'organization_members', memberDocId(uid, orgId)), {
      organization_id: orgId,
      user_id: uid,
      role,
      activo: true,
    });
  });
}

const runRulesTests = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

(runRulesTests ? describe : describe.skip)(
  'firestore.rules payment_applications (E9.2 F3)',
  () => {
    beforeAll(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
        },
      });
    });

    afterAll(async () => {
      await testEnv?.cleanup();
    });

    beforeEach(async () => {
      await testEnv.clearFirestore();
      await seedOrgMember(CONTADOR_UID, ORG, 'contador');
      await seedOrgMember(VIEWER_UID, ORG, 'viewer');
    });

    it('contador autenticado puede crear aplicación válida', async () => {
      const db = testEnv.authenticatedContext(CONTADOR_UID).firestore();
      await assertSucceeds(
        addDoc(collection(db, 'payment_applications'), validApplication())
      );
    });

    it('rechaza create sin autenticación', async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(
        addDoc(collection(db, 'payment_applications'), validApplication())
      );
    });

    it('viewer no puede crear (canWriteOrgData)', async () => {
      const db = testEnv.authenticatedContext(VIEWER_UID).firestore();
      await assertFails(
        addDoc(
          collection(db, 'payment_applications'),
          validApplication({ usuario_id: VIEWER_UID })
        )
      );
    });

    it('rechaza amount <= 0 y source_type inválido', async () => {
      const db = testEnv.authenticatedContext(CONTADOR_UID).firestore();
      await assertFails(
        addDoc(
          collection(db, 'payment_applications'),
          validApplication({ amount: 0 })
        )
      );
      await assertFails(
        addDoc(
          collection(db, 'payment_applications'),
          validApplication({ source_type: 'invalid' })
        )
      );
    });

    it('update y delete están prohibidos (inmutabilidad)', async () => {
      const appId = 'app-immutable';
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'payment_applications', appId),
          validApplication()
        );
      });

      const db = testEnv.authenticatedContext(CONTADOR_UID).firestore();
      const ref = doc(db, 'payment_applications', appId);
      await assertFails(updateDoc(ref, { amount: 50 }));
      await assertFails(deleteDoc(ref));
    });

    it('miembro de org puede leer aplicaciones de su organización', async () => {
      const appId = 'app-read';
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'payment_applications', appId),
          validApplication()
        );
      });

      const db = testEnv.authenticatedContext(CONTADOR_UID).firestore();
      await assertSucceeds(getDoc(doc(db, 'payment_applications', appId)));
    });
  }
);
