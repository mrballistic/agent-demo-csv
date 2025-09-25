import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fileStore } from '@/lib/file-store';
import { storageManager } from '@/lib/storage-manager';
import archiver from 'archiver';

describe('Export Functionality', () => {
  let sessionId: string;
  let artifactIds: string[];

  beforeEach(async () => {
    // Create a test session
    const session = storageManager.createSession('test-thread-export');
    sessionId = session.id;

    // Create some test artifacts
    const artifact1 = await fileStore.storeArtifact(
      sessionId,
      'profile',
      Buffer.from('# Data Profile\n\nRows: 1000\nColumns: 5'),
      'md'
    );

    const artifact2 = await fileStore.storeArtifact(
      sessionId,
      'chart',
      Buffer.from('PNG chart data'),
      'png'
    );

    const artifact3 = await fileStore.storeArtifact(
      sessionId,
      'data',
      Buffer.from('id,name,value\n1,test,100'),
      'csv'
    );

    artifactIds = [artifact1.id, artifact2.id, artifact3.id];
  });

  afterEach(async () => {
    // Clean up test data
    await storageManager.deleteSession(sessionId);
  });

  it('should retrieve all artifacts for a session', () => {
    const sessionFiles = fileStore.getSessionFiles(sessionId);
    expect(sessionFiles).toHaveLength(3);

    const filenames = sessionFiles.map(f => f.filename);
    expect(filenames.some(name => name.includes('profile_'))).toBe(true);
    expect(filenames.some(name => name.includes('chart_'))).toBe(true);
    expect(filenames.some(name => name.includes('data_'))).toBe(true);
  });

  it('should filter artifacts by specific IDs', () => {
    const allFiles = fileStore.getSessionFiles(sessionId);
    const selectedIds = [artifactIds[0], artifactIds[2]]; // profile and data

    const filteredFiles = selectedIds
      .map(id => fileStore.getFileMetadata(id!))
      .filter(metadata => metadata && metadata.sessionId === sessionId);

    expect(filteredFiles).toHaveLength(2);
    expect(filteredFiles[0]?.filename).toContain('profile_');
    expect(filteredFiles[1]?.filename).toContain('data_');
  });

  it('should generate manifest content correctly', async () => {
    const artifacts = fileStore.getSessionFiles(sessionId);
    const manifestContent = generateTestManifest(artifacts);

    expect(manifestContent).toContain('Analysis Export Manifest');
    expect(manifestContent).toContain('Total Files: 3');
    expect(manifestContent).toContain('profile_');
    expect(manifestContent).toContain('chart_');
    expect(manifestContent).toContain('data_');
    expect(manifestContent).toContain('Size:');
    expect(manifestContent).toContain('Type:');
    expect(manifestContent).toContain('Created:');
    expect(manifestContent).toContain('Checksum:');
  });

  it('should create ZIP archive with artifacts', async () => {
    const artifacts = fileStore.getSessionFiles(sessionId);

    // Create a test ZIP archive
    const archive = archiver('zip', { zlib: { level: 9 } });

    // Add manifest
    const manifestContent = generateTestManifest(artifacts);
    archive.append(manifestContent, { name: 'manifest.txt' });

    // Add artifacts
    for (const metadata of artifacts) {
      const content = await fileStore.getFile(metadata.id);
      if (content) {
        const filename = metadata.originalName || metadata.filename;
        archive.append(content, { name: filename });
      }
    }

    // Finalize and convert to buffer
    archive.finalize();
    const zipBuffer = await streamToBuffer(archive);

    expect(zipBuffer).toBeInstanceOf(Buffer);
    expect(zipBuffer.length).toBeGreaterThan(0);
  });

  it('should handle empty artifact list', () => {
    const emptySession = storageManager.createSession('empty-session');
    const sessionFiles = fileStore.getSessionFiles(emptySession.id);

    expect(sessionFiles).toHaveLength(0);

    // Cleanup
    storageManager.deleteSession(emptySession.id);
  });

  it('should verify file integrity before export', async () => {
    for (const artifactId of artifactIds) {
      const isValid = await fileStore.verifyFileIntegrity(artifactId);
      expect(isValid).toBe(true);
    }
  });

  it('should generate proper export filename format', () => {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19); // YYYY-MM-DDTHH-MM-SS

    const exportFilename = `analysis_export_${timestamp}.zip`;

    expect(exportFilename).toMatch(
      /^analysis_export_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/
    );
  });
});

/**
 * Generate manifest.txt content for testing
 */
function generateTestManifest(artifacts: any[]): string {
  const lines = [
    'Analysis Export Manifest',
    '========================',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total Files: ${artifacts.length}`,
    '',
    'Files:',
    '------',
  ];

  for (const artifact of artifacts) {
    const createdAt = new Date(artifact.createdAt).toISOString();
    const sizeKB = Math.round(artifact.size / 1024);

    lines.push(
      `${artifact.originalName || artifact.filename}`,
      `  Size: ${sizeKB} KB`,
      `  Type: ${artifact.mimeType}`,
      `  Created: ${createdAt}`,
      `  Checksum: ${artifact.checksum}`,
      ''
    );
  }

  lines.push('========================', 'End of Manifest');

  return lines.join('\n');
}

/**
 * Convert a readable stream to buffer for testing
 */
function streamToBuffer(stream: archiver.Archiver): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    stream.on('error', error => {
      reject(error);
    });
  });
}
