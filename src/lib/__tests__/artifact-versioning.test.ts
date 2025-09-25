import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileStore } from '@/lib/file-store';
import { storageManager } from '@/lib/storage-manager';

describe('Artifact Versioning', () => {
  let sessionId: string;

  beforeEach(() => {
    const session = storageManager.createSession('test-thread-versioning');
    sessionId = session.id;
  });

  afterEach(async () => {
    await storageManager.deleteSession(sessionId);
  });

  it('should create artifacts with proper versioning format', async () => {
    const artifact1 = await fileStore.storeArtifact(
      sessionId,
      'trends',
      Buffer.from('First trends analysis'),
      'png'
    );

    const artifact2 = await fileStore.storeArtifact(
      sessionId,
      'trends',
      Buffer.from('Second trends analysis'),
      'png'
    );

    // Check that both artifacts have the correct format: analysisType_YYYYMMDD_HHMMSS_vN.ext
    expect(artifact1.filename).toMatch(/^trends_\d{8}_\d{6}_v1\.png$/);
    expect(artifact2.filename).toMatch(/^trends_\d{8}_\d{6}_v2\.png$/);
  });

  it('should increment versions for same analysis type and timestamp', async () => {
    // Create multiple artifacts of the same type sequentially (to ensure same timestamp)
    const artifact1 = await fileStore.storeArtifact(
      sessionId,
      'profile',
      Buffer.from('Profile 1'),
      'md'
    );
    const artifact2 = await fileStore.storeArtifact(
      sessionId,
      'profile',
      Buffer.from('Profile 2'),
      'md'
    );
    const artifact3 = await fileStore.storeArtifact(
      sessionId,
      'profile',
      Buffer.from('Profile 3'),
      'md'
    );

    const filenames = [
      artifact1.filename,
      artifact2.filename,
      artifact3.filename,
    ];

    // Extract the base pattern (without version) from first artifact
    const basePattern = filenames[0]
      ? filenames[0].replace(/_v\d+\.md$/, '')
      : '';

    // All should have the same base pattern
    filenames.forEach(filename => {
      expect(filename).toContain(basePattern);
    });

    // Versions should be 1, 2, 3
    expect(filenames[0]).toContain('_v1.md');
    expect(filenames[1]).toContain('_v2.md');
    expect(filenames[2]).toContain('_v3.md');
  });

  it('should handle different analysis types independently', async () => {
    const chartArtifact = await fileStore.storeArtifact(
      sessionId,
      'chart',
      Buffer.from('Chart data'),
      'png'
    );

    const dataArtifact = await fileStore.storeArtifact(
      sessionId,
      'data',
      Buffer.from('Data export'),
      'csv'
    );

    const profileArtifact = await fileStore.storeArtifact(
      sessionId,
      'profile',
      Buffer.from('Profile summary'),
      'md'
    );

    // Each should start with version 1
    expect(chartArtifact.filename).toMatch(/^chart_\d{8}_\d{6}_v1\.png$/);
    expect(dataArtifact.filename).toMatch(/^data_\d{8}_\d{6}_v1\.csv$/);
    expect(profileArtifact.filename).toMatch(/^profile_\d{8}_\d{6}_v1\.md$/);
  });

  it('should preserve original filename for non-artifact files', async () => {
    const regularFile = await fileStore.storeFile(
      sessionId,
      'user-upload.csv',
      Buffer.from('User uploaded data'),
      'text/csv'
    );

    // Regular files should get timestamp prefix, not versioning format
    expect(regularFile.filename).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}.*_user-upload\.csv$/
    );
    expect(regularFile.originalName).toBe('user-upload.csv');
  });

  it('should handle MIME type detection correctly', async () => {
    const pngArtifact = await fileStore.storeArtifact(
      sessionId,
      'chart',
      Buffer.from('PNG data'),
      'png'
    );

    const csvArtifact = await fileStore.storeArtifact(
      sessionId,
      'export',
      Buffer.from('CSV data'),
      'csv'
    );

    const mdArtifact = await fileStore.storeArtifact(
      sessionId,
      'summary',
      Buffer.from('Markdown data'),
      'md'
    );

    expect(pngArtifact.mimeType).toBe('image/png');
    expect(csvArtifact.mimeType).toBe('text/csv');
    expect(mdArtifact.mimeType).toBe('text/markdown');
  });

  it('should maintain version sequence across different sessions', async () => {
    // Create artifact in first session
    const artifact1 = await fileStore.storeArtifact(
      sessionId,
      'test',
      Buffer.from('Test 1'),
      'txt'
    );

    // Create second session
    const session2 = storageManager.createSession('test-thread-2');

    // Create artifact in second session (should start at v1 again)
    const artifact2 = await fileStore.storeArtifact(
      session2.id,
      'test',
      Buffer.from('Test 2'),
      'txt'
    );

    expect(artifact1.filename).toMatch(/_v1\.txt$/);
    expect(artifact2.filename).toMatch(/_v1\.txt$/);

    // Cleanup
    await storageManager.deleteSession(session2.id);
  });
});
