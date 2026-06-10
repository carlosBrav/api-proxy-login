import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogFilterService } from '../../src/catalog/CatalogFilterService';
import { ProviderRegistry } from '../../src/providers/ProviderRegistry';
import {
  generateMockPatches,
  registerAllAdapters,
} from '../../src/providers/mock/MockPatchGenerator';

test('generateMockPatches devuelve parches cuando el catálogo tiene ca_table_id reales', () => {
  ProviderRegistry.clear();
  registerAllAdapters();
  catalogFilterService.setMockAuthorizedIds(['2601', 'THBTable00000001']);

  const patches = generateMockPatches();

  assert.ok(patches.length > 0, 'debe generar al menos un parche autorizado');
  assert.ok(
    patches.every((p) =>
      catalogFilterService.isAuthorizedExternalId(p.external_id)
    ),
    'todos los external_id deben estar en el catálogo mock'
  );
  assert.ok(
    patches.some((p) => p.external_id === '2601'),
    'debe incluir parche Pragmatic 2601'
  );
  assert.ok(
    patches.some((p) => p.external_id === 'THBTable00000001'),
    'debe incluir parche Evolution THBTable00000001'
  );
});
