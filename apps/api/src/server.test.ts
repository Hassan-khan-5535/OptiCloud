import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from './server.js';
import type { Db } from '@cindr/db';

test('rollback endpoint enqueues the requested remediation action', async () => {
  let actionId = '';
  const app = await buildApp({
    authResolver: async () => ({ subject: 'user-a', orgId: 'org-a', role: 'admin' }),
    remediationQueue: {
      async enqueue() {},
      async enqueueRollback(id) { actionId = id; },
    },
  });

  const response = await app.inject({ method: 'POST', url: '/api/remediations/action-123/rollback' });
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.json(), { ok: true, remediationActionId: 'action-123', status: 'rollback_queued' });
  assert.equal(actionId, 'action-123');
  await app.close();
});

test('dashboard endpoints reject requests without authentication', async () => {
  const app = await buildApp({ dashboardDb: {} as Db });
  const response = await app.inject({ method: 'GET', url: '/api/overview' });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, 'Authentication required');
  await app.close();
});

test('organization A cannot read organization B findings through a guessed ID', async () => {
  let requestedOrg = '';
  const app = await buildApp({
    dashboardDb: {} as Db,
    authResolver: async () => ({ subject: 'user-a', orgId: 'org-a', role: 'member' }),
    dashboardQueries: {
      getFindingDetail: async (_db, findingId, orgId) => {
        requestedOrg = orgId;
        assert.equal(findingId, 'finding-from-org-b');
        return null;
      },
    },
  });
  const response = await app.inject({ method: 'GET', url: '/api/findings/finding-from-org-b' });
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error, 'Waste finding not found');
  assert.equal(requestedOrg, 'org-a');
  await app.close();
});
