package models

import (
	"encoding/json"
	"fmt"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type PluginSettings struct {
	Path                           string                `json:"path"`
	APIURL                         string                `json:"apiUrl"`
	OAuth2TokenURL                 string                `json:"oauth2TokenUrl"`
	OAuth2Username                 string                `json:"oauth2Username"`
	OAuth2ClientID                 string                `json:"oauth2ClientId"`
	DefaultTop                     *int                  `json:"defaultTop,omitempty"`
	DefaultExpandedObservationsTop *int                  `json:"defaultExpandedObservationsTop,omitempty"`
	Secrets                        *SecretPluginSettings `json:"-"`
}

type SecretPluginSettings struct {
	OAuth2Password     string `json:"oauth2Password"`
	OAuth2ClientSecret string `json:"oauth2ClientSecret"`
}

func LoadPluginSettings(source backend.DataSourceInstanceSettings) (*PluginSettings, error) {
	settings := PluginSettings{}
	err := json.Unmarshal(source.JSONData, &settings)
	if err != nil {
		return nil, fmt.Errorf("could not unmarshal PluginSettings json: %w", err)
	}

	settings.Secrets = loadSecretPluginSettings(source.DecryptedSecureJSONData)

	return &settings, nil
}

func loadSecretPluginSettings(source map[string]string) *SecretPluginSettings {
	return &SecretPluginSettings{
		OAuth2Password:     source["oauth2Password"],
		OAuth2ClientSecret: source["oauth2ClientSecret"],
	}
}
