import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  patchMatchesAnyExternalId,
  patchMatchesExternalId,
  stripMockProviderPrefix,
} from '../../src/domain/externalIdMatch';

test('stripMockProviderPrefix quita prefijos de proveedor mock', () => {
  assert.equal(stripMockProviderPrefix('pragmatic_301'), '301');
  assert.equal(stripMockProviderPrefix('evolution_ev-bj-classic1'), 'ev-bj-classic1');
  assert.equal(stripMockProviderPrefix('THBTable00000001'), 'THBTable00000001');
});

test('patchMatchesExternalId: match exacto', () => {
  assert.equal(patchMatchesExternalId('THBTable00000001', 'THBTable00000001'), true);
  assert.equal(patchMatchesExternalId('pragmatic_301', 'pragmatic_301'), true);
});

test('patchMatchesExternalId: ca_table_id sin prefijo vs parche mock', () => {
  assert.equal(patchMatchesExternalId('pragmatic_301', '301'), true);
  assert.equal(patchMatchesExternalId('evolution_ev-bj-classic1', 'ev-bj-classic1'), true);
});

test('patchMatchesExternalId: no hace match por sufijo ambiguo', () => {
  assert.equal(patchMatchesExternalId('pragmatic_1301', '301'), false);
  assert.equal(patchMatchesExternalId('prefix_THBTable00000001', 'THBTable00000001'), false);
});

test('patchMatchesExternalId: sin coincidencia', () => {
  assert.equal(patchMatchesExternalId('pragmatic_999', '301'), false);
  assert.equal(patchMatchesExternalId('pragmatic_301', 'THBTable00000001'), false);
});

test('patchMatchesAnyExternalId con lista de query params', () => {
  assert.equal(
    patchMatchesAnyExternalId('pragmatic_301', ['999', '301']),
    true
  );
  assert.equal(
    patchMatchesAnyExternalId('pragmatic_301', ['THBTable00000001']),
    false
  );
});
