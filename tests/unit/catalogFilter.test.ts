import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatalogFilterService } from '../../src/catalog/CatalogFilterService';

test('CatalogFilterService permite todo cuando filtro deshabilitado', () => {
  const service = new CatalogFilterService({ enabled: false });
  service.allowAllInDev();
  assert.equal(service.isAuthorized('any-table-id'), true);
  assert.equal(service.isAuthorizedExternalId('evolution_any'), true);
});

test('CatalogFilterService filtra por ca_table_id en set mock', () => {
  const service = new CatalogFilterService({ enabled: true });
  service.setMockAuthorizedIds(['301', 'ev-bj-classic1']);

  assert.equal(service.isAuthorized('301'), true);
  assert.equal(service.isAuthorized('999'), false);
  assert.equal(service.isAuthorizedExternalId('301'), true);
  assert.equal(service.isAuthorizedExternalId('unknown'), false);
});

test('CatalogFilterService en mock acepta external_id con prefijo proveedor', () => {
  const service = new CatalogFilterService({ enabled: true });
  service.setMockAuthorizedIds(['301', 'ev-bj-classic1']);

  assert.equal(service.isAuthorizedExternalId('pragmatic_301'), true);
  assert.equal(service.isAuthorizedExternalId('evolution_ev-bj-classic1'), true);
  assert.equal(service.isAuthorizedExternalId('evolution_unknown'), false);
});

test('CatalogFilterService con catálogo vacío rechaza todo', () => {
  const service = new CatalogFilterService({ enabled: true });
  service.setMockAuthorizedIds([]);

  assert.equal(service.isAuthorized('301'), false);
  assert.equal(service.isDegraded(), true);
});

test('CatalogFilterService filterPatches respeta set autorizado', () => {
  const service = new CatalogFilterService({ enabled: true });
  service.setMockAuthorizedIds(['301']);

  const patches = [
    {
      external_id: 'pragmatic_301',
      idProveedor: 2,
      realtime: { updatedAt: '2026-06-10T12:00:00.000Z' },
    },
    {
      external_id: 'pragmatic_999',
      idProveedor: 2,
      realtime: { updatedAt: '2026-06-10T12:00:00.000Z' },
    },
  ];

  const filtered = service.filterPatches(patches);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].external_id, 'pragmatic_301');
});
