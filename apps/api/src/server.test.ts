import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from './server.js';

test('rollback endpoint enqueues the requested remediation action', async () => {
  let actionId = '';
  const app = await buildApp({
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
