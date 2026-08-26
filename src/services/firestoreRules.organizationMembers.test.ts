/**
 * @vitest-environment node
 * E8.3 — get de organization_members inexistente (bootstrap).
 * Requiere emulador: npm run test:rules (o FIRESTORE_EMULATOR_HOST).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { memberDocId, personalOrgIdForUser } from '../types/organization';

const PROJECT_ID = 'contai-rules-org-members';
const UID = 'user_bootstrap_uid';
const OTHER = 'other_user_uid';

let testEnv: RulesTestEnvironment;
const runRulesTests = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

(runRulesTests ? describe : describe.skip)(
  'firestore.rules organization_members bootstrap get (E8.3)',
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
    });

    it('permite get de member inexistente {uid}_personal_{uid}', async () => {
      const memberId = memberDocId(UID, personalOrgIdForUser(UID));
      const ctx = testEnv.authenticatedContext(UID);
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'organization_members', memberId)));
    });

    it('deniega get de member inexistente de otro uid', async () => {
      const memberId = memberDocId(OTHER, personalOrgIdForUser(OTHER));
      const ctx = testEnv.authenticatedContext(UID);
      await assertFails(getDoc(doc(ctx.firestore(), 'organization_members', memberId)));
    });
  }
);
