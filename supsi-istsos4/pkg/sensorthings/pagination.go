package sensorthings

import (
	"context"
	"encoding/json"
)

func (c *Client) GetAllPages(ctx context.Context, firstURL string) (*Response, error) {
	combined := &Response{Value: []json.RawMessage{}}
	nextURL := firstURL

	for nextURL != "" {
		page, err := c.Get(ctx, nextURL)
		if err != nil {
			return nil, err
		}
		combined.Value = append(combined.Value, page.Value...)
		combined.Count = page.Count
		nextURL = page.NextLink
	}

	return combined, nil
}
