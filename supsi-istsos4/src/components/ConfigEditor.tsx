import React, { ChangeEvent, useEffect } from 'react';
import { InlineField, Input, SecretInput, Select } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps, SelectableValue } from '@grafana/data';
import { MyDataSourceOptions, MySecureJsonData } from '../types';

interface Props extends DataSourcePluginOptionsEditorProps<MyDataSourceOptions, MySecureJsonData> {}

export function ConfigEditor(props: Props) {
  const { onOptionsChange, options } = props;
  const { jsonData, secureJsonFields, secureJsonData } = options;
  const authType = jsonData.authType || 'anonymous';
  const oauth2TokenUrl = jsonData.oauth2TokenUrl ?? 'Login';
  const authOptions: Array<SelectableValue<MyDataSourceOptions['authType']>> = [
    { label: 'Anonymous', value: 'anonymous', description: 'Connect without authentication' },
    { label: 'OAuth2', value: 'oauth2', description: 'Use OAuth2 password grant credentials' },
  ];

  useEffect(() => {
    if (jsonData.authType && jsonData.oauth2TokenUrl) {
      return;
    }

    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        authType,
        oauth2TokenUrl,
      },
    });
  }, [authType, jsonData, oauth2TokenUrl, onOptionsChange, options]);

  const onApiUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        apiUrl: event.target.value,
      },
    });
  };

  const onPathChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        path: event.target.value,
      },
    });
  };

  const onAuthTypeChange = (value: SelectableValue<MyDataSourceOptions['authType']>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        authType: value.value || 'anonymous',
      },
    });
  };

  const onOAuth2TokenUrlChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        oauth2TokenUrl: event.target.value,
      },
    });
  };

  const onOAuth2UsernameChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        oauth2Username: event.target.value,
      },
    });
  };

  const onOAuth2ClientIdChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        oauth2ClientId: event.target.value,
      },
    });
  };

  const onDefaultTopChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        defaultTop: isNaN(value) ? undefined : value,
      },
    });
  };

  const onDefaultExpandedObservationsTopChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10);
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        defaultExpandedObservationsTop: isNaN(value) ? undefined : value,
      },
    });
  };

  const onOAuth2PasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...secureJsonData,
        oauth2Password: event.target.value,
      },
    });
  };

  const onOAuth2ClientSecretChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...secureJsonData,
        oauth2ClientSecret: event.target.value,
      },
    });
  };

  const onResetOAuth2Password = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...options.secureJsonFields,
        oauth2Password: false,
      },
      secureJsonData: {
        ...options.secureJsonData,
        oauth2Password: '',
      },
    });
  };

  const onResetOAuth2ClientSecret = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...options.secureJsonFields,
        oauth2ClientSecret: false,
      },
      secureJsonData: {
        ...options.secureJsonData,
        oauth2ClientSecret: '',
      },
    });
  };

  return (
    <>
      <InlineField label="API URL" labelWidth={14} interactive tooltip={'SensorThings API base URL'}>
        <Input
          id="config-editor-api-url"
          onChange={onApiUrlChange}
          value={jsonData.apiUrl || ''}
          placeholder="https://your-sensorthings-api.com"
          width={40}
          required
        />
      </InlineField>

      <InlineField label="Path" labelWidth={14} interactive tooltip={'API path (optional)'}>
        <Input
          id="config-editor-path"
          onChange={onPathChange}
          value={jsonData.path || ''}
          placeholder="Specific API path or leave empty"
          width={40}
        />
      </InlineField>

      <InlineField label="Authentication" labelWidth={14} interactive tooltip={'Authentication mode'}>
        <Select
          id="config-editor-auth-type"
          options={authOptions}
          value={authOptions.find((option) => option.value === authType)}
          onChange={onAuthTypeChange}
          width={40}
        />
      </InlineField>

      {authType === 'oauth2' && (
        <>
          <InlineField label="Token URL" labelWidth={14} interactive tooltip={'OAuth2 token endpoint path'}>
            <Input
              id="config-editor-token-url"
              onChange={onOAuth2TokenUrlChange}
              value={oauth2TokenUrl}
              placeholder="login"
              width={40}
              required
            />
          </InlineField>

          <InlineField label="Username" labelWidth={14} interactive tooltip={'OAuth2 username'}>
            <Input
              id="config-editor-oauth2-username"
              onChange={onOAuth2UsernameChange}
              value={jsonData.oauth2Username || ''}
              placeholder="Enter username"
              width={40}
              required
            />
          </InlineField>

          <InlineField label="Password" labelWidth={14} interactive tooltip={'OAuth2 password (stored securely)'}>
            <SecretInput
              id="config-editor-oauth2-password"
              isConfigured={secureJsonFields?.oauth2Password}
              value={secureJsonData?.oauth2Password || ''}
              placeholder="Enter password"
              width={40}
              onReset={onResetOAuth2Password}
              onChange={onOAuth2PasswordChange}
              required
            />
          </InlineField>

          <InlineField label="Client ID" labelWidth={14} interactive tooltip={'OAuth2 client ID'}>
            <Input
              id="config-editor-oauth2-client-id"
              onChange={onOAuth2ClientIdChange}
              value={jsonData.oauth2ClientId || ''}
              placeholder="Enter client ID"
              width={40}
              required
            />
          </InlineField>

          <InlineField
            label="Client Secret"
            labelWidth={18}
            interactive
            tooltip={'OAuth2 client secret (stored securely)'}
          >
            <SecretInput
              id="config-editor-oauth2-client-secret"
              isConfigured={secureJsonFields?.oauth2ClientSecret}
              value={secureJsonData?.oauth2ClientSecret || ''}
              placeholder="Enter client secret"
              width={40}
              onReset={onResetOAuth2ClientSecret}
              onChange={onOAuth2ClientSecretChange}
              required
            />
          </InlineField>
        </>
      )}

      <InlineField label="Default $top" labelWidth={18} interactive tooltip={'Default pagination size (e.g., 100). If not set, queries without $top will fetch all results.'}>
        <Input
          id="config-editor-default-top"
          onChange={onDefaultTopChange}
          value={jsonData.defaultTop || ''}
          placeholder="100"
          width={40}
          type="number"
        />
      </InlineField>

      <InlineField label="Expanded Obs $top" labelWidth={20} interactive tooltip={'Default pagination size for expanded Observations (e.g., 1000). If not set, defaults to 1000.'}>
        <Input
          id="config-editor-default-expanded-observations-top"
          onChange={onDefaultExpandedObservationsTopChange}
          value={jsonData.defaultExpandedObservationsTop || ''}
          placeholder="1000"
          width={40}
          type="number"
        />
      </InlineField>
    </>
  );
}
