import { describe, it, expect } from 'vitest';

describe('Analysis Suggestions API', () => {
  const baseUrl = 'http://localhost:3000';

  it('should return suggestions for a valid fileId', async () => {
    const response = await fetch(
      `${baseUrl}/api/analysis/suggestions?fileId=test-file-123`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('fileId', 'test-file-123');
    expect(data).toHaveProperty('suggestions');
    expect(data).toHaveProperty('metadata');
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(data.suggestions.length).toBeGreaterThan(0);
  });

  it('should return error when fileId is missing', async () => {
    const response = await fetch(`${baseUrl}/api/analysis/suggestions`);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toHaveProperty('error', 'fileId parameter is required');
  });

  it('should return suggestions with correct structure', async () => {
    const response = await fetch(
      `${baseUrl}/api/analysis/suggestions?fileId=test-file-123`
    );
    const data = await response.json();

    expect(response.status).toBe(200);

    // Check that each suggestion has the required properties
    data.suggestions.forEach((suggestion: any) => {
      expect(suggestion).toHaveProperty('id');
      expect(suggestion).toHaveProperty('label');
      expect(suggestion).toHaveProperty('description');
      expect(suggestion).toHaveProperty('requiredColumns');
      expect(suggestion).toHaveProperty('analysisType');
      expect(suggestion).toHaveProperty('enabled');
      expect(typeof suggestion.enabled).toBe('boolean');
      expect(Array.isArray(suggestion.requiredColumns)).toBe(true);
    });
  });

  it('should include profile analysis which is always enabled', async () => {
    const response = await fetch(
      `${baseUrl}/api/analysis/suggestions?fileId=test-file-123`
    );
    const data = await response.json();

    expect(response.status).toBe(200);

    const profileSuggestion = data.suggestions.find(
      (s: any) => s.id === 'profile'
    );
    expect(profileSuggestion).toBeDefined();
    expect(profileSuggestion.enabled).toBe(true);
    expect(profileSuggestion.requiredColumns).toEqual([]);
  });

  it('should include metadata about the file', async () => {
    const response = await fetch(
      `${baseUrl}/api/analysis/suggestions?fileId=test-file-123`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.metadata).toHaveProperty('columnCount');
    expect(data.metadata).toHaveProperty('availableColumns');
    expect(data.metadata).toHaveProperty('generatedAt');
    expect(Array.isArray(data.metadata.availableColumns)).toBe(true);
    expect(typeof data.metadata.columnCount).toBe('number');
  });

  it('should disable analyses when required columns are missing', async () => {
    const response = await fetch(
      `${baseUrl}/api/analysis/suggestions?fileId=minimal-file-123`
    );
    const data = await response.json();

    expect(response.status).toBe(200);

    // Profile should always be enabled
    const profileSuggestion = data.suggestions.find(
      (s: any) => s.id === 'profile'
    );
    expect(profileSuggestion.enabled).toBe(true);

    // Other analyses should be disabled due to missing columns
    const trendSuggestion = data.suggestions.find(
      (s: any) => s.id === 'trends'
    );
    const topProductsSuggestion = data.suggestions.find(
      (s: any) => s.id === 'top-products'
    );
    const channelSuggestion = data.suggestions.find(
      (s: any) => s.id === 'channel-mix'
    );

    expect(trendSuggestion.enabled).toBe(false);
    expect(trendSuggestion.reason).toContain('Missing required columns');

    expect(topProductsSuggestion.enabled).toBe(false);
    expect(topProductsSuggestion.reason).toContain('Missing required columns');

    expect(channelSuggestion.enabled).toBe(false);
    expect(channelSuggestion.reason).toContain('Missing required columns');
  });

  it('should disable trend analysis when date column is missing', async () => {
    const response = await fetch(
      `${baseUrl}/api/analysis/suggestions?fileId=no-date-file-123`
    );
    const data = await response.json();

    expect(response.status).toBe(200);

    // Profile should be enabled
    const profileSuggestion = data.suggestions.find(
      (s: any) => s.id === 'profile'
    );
    expect(profileSuggestion.enabled).toBe(true);

    // Trend analysis should be disabled due to missing date column
    const trendSuggestion = data.suggestions.find(
      (s: any) => s.id === 'trends'
    );
    expect(trendSuggestion.enabled).toBe(false);
    expect(trendSuggestion.reason).toContain('date column');

    // Top products should be enabled (has product and price columns)
    const topProductsSuggestion = data.suggestions.find(
      (s: any) => s.id === 'top-products'
    );
    expect(topProductsSuggestion.enabled).toBe(true);
  });
});
