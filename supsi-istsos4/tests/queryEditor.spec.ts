import { test, expect } from '@grafana/plugin-e2e';

test('renders the SensorThings query editor', async ({ panelEditPage, readProvisionedDataSource }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  const editor = panelEditPage.getQueryEditorRow('A');
  await expect(editor.getByPlaceholder('ID or $variable')).toBeVisible();
  await expect(editor.getByPlaceholder('Query alias')).toBeVisible();
  await expect(editor.getByPlaceholder("e.g., $filter=name eq 'sensor1'")).toBeVisible();
});

test('sends the edited SensorThings expression to the backend', async ({
  panelEditPage,
  readProvisionedDataSource,
  page,
}) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  const resultOptions = panelEditPage
    .getQueryEditorRow('A')
    .getByRole('group', { name: 'Result Options', exact: true });
  await resultOptions.getByRole('combobox').first().click();
  await page.getByTestId('data-testid Select menu').getByText('Disabled', { exact: true }).click();
  await panelEditPage.getQueryEditorRow('A').getByPlaceholder("e.g., $filter=name eq 'sensor1'").fill('$top=1');
  const queryRequest = panelEditPage.waitForQueryDataRequest();
  await expect(panelEditPage.refreshPanel()).toBeOK();
  const request = await queryRequest;
  expect(request.postDataJSON().queries[0].expression).toBe('$top=1');
});

test('renders SensorThings results in a table', async ({ panelEditPage, readProvisionedDataSource, page }) => {
  const ds = await readProvisionedDataSource({ fileName: 'datasources.yml' });
  await panelEditPage.datasource.set(ds.name);
  const resultOptions = panelEditPage
    .getQueryEditorRow('A')
    .getByRole('group', { name: 'Result Options', exact: true });
  await resultOptions.getByRole('combobox').first().click();
  await page.getByTestId('data-testid Select menu').getByText('Disabled', { exact: true }).click();
  await panelEditPage.getQueryEditorRow('A').getByPlaceholder("e.g., $filter=name eq 'sensor1'").fill('$top=1');
  await panelEditPage.setVisualization('Table');
  await expect(panelEditPage.refreshPanel()).toBeOK();
  await expect(page.getByRole('columnheader', { name: 'thing_name', exact: true })).toBeVisible();
  await expect(panelEditPage.panel.data.first()).not.toBeEmpty();
});
