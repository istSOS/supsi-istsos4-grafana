import { test, expect } from '@grafana/plugin-e2e';
import { MyDataSourceOptions } from '../src/types';

test('renders the SensorThings configuration editor', async ({
  createDataSourceConfigPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await createDataSourceConfigPage({ type: ds.type });
  await expect(page.getByRole('textbox', { name: 'API URL', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Path', exact: true })).toBeVisible();
  await expect(page.getByText('Anonymous', { exact: true })).toBeVisible();
});

test('Save & test connects to the provisioned SensorThings API', async ({
  createDataSourceConfigPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource<MyDataSourceOptions>({ fileName: 'datasources.yml' });
  const configPage = await createDataSourceConfigPage({ type: ds.type });
  await page.getByRole('textbox', { name: 'API URL', exact: true }).fill(ds.jsonData.apiUrl ?? '');
  await page.getByRole('textbox', { name: 'Path', exact: true }).fill(ds.jsonData.path ?? '');
  await expect(configPage.saveAndTest()).toBeOK();
});

test('Save & test reports a missing API URL', async ({ createDataSourceConfigPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  const configPage = await createDataSourceConfigPage({ type: ds.type });
  await expect(configPage.saveAndTest()).not.toBeOK();
  await expect(configPage).toHaveAlert('error', { hasText: 'API URL is missing' });
});
