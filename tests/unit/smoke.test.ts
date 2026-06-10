import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCaGameType } from '../../lambda-ingest-lobby/src/fieldMapper';
import { CatalogFilterService } from '../../src/catalog/CatalogFilterService';

test('parseCaGameType extrae tipo desde tag cl_live_*', () => {
  const result = parseCaGameType(['cl_live_blackjack', 'other']);
  assert.equal(result, 'blackjack');
});

test('CatalogFilterService allowAllInDev deshabilita filtro', () => {
  const service = new CatalogFilterService({ enabled: true });
  service.setMockAuthorizedIds(['only-one']);
  service.allowAllInDev();
  assert.equal(service.isAuthorized('any-table-id'), true);
});
