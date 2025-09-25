import { NextRequest, NextResponse } from 'next/server';
import { storageManager } from '@/lib/storage-manager';
import { fileStore } from '@/lib/file-store';
import archiver from 'archiver';
import { Readable } from 'stream';

export const runtime = 'nodejs';

interface ExportRequest {
  sessionId?: string;
  threadId?: string;
  artifactIds?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: ExportRequest = await request.json();
    const { sessionId, threadId, artifactIds } = body;

    // Determine session ID from threadId if needed
    let targetSessionId = sessionId;
    if (!targetSessionId && threadId) {
      const session = storageManager.getSessionByThreadId(threadId);
      if (!session) {
        return NextResponse.json(
          { error: 'Session not found for thread ID' },
          { status: 404 }
        );
      }
      targetSessionId = session.id;
    }

    if (!targetSessionId) {
      return NextResponse.json(
        { error: 'Session ID or Thread ID is required' },
        { status: 400 }
      );
    }

    // Get artifacts to export
    let artifactsToExport;
    if (artifactIds && artifactIds.length > 0) {
      // Export specific artifacts
      artifactsToExport = artifactIds
        .map(id => fileStore.getFileMetadata(id))
        .filter(
          (metadata): metadata is NonNullable<typeof metadata> =>
            metadata !== null && metadata.sessionId === targetSessionId
        );
    } else {
      // Export all artifacts for the session
      artifactsToExport = fileStore.getSessionFiles(targetSessionId);
    }

    if (artifactsToExport.length === 0) {
      return NextResponse.json(
        { error: 'No artifacts found to export' },
        { status: 404 }
      );
    }

    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    // Create manifest content
    const manifestContent = await generateManifest(artifactsToExport);
    archive.append(manifestContent, { name: 'manifest.txt' });

    // Add all artifacts to the archive
    for (const metadata of artifactsToExport) {
      const content = await fileStore.getFile(metadata.id);
      if (content) {
        // Use original filename for better user experience
        const filename = metadata.originalName || metadata.filename;
        archive.append(content, { name: filename });
      }
    }

    // Finalize the archive
    archive.finalize();

    // Generate export filename with timestamp
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19); // YYYY-MM-DDTHH-MM-SS
    const exportFilename = `analysis_export_${timestamp}.zip`;

    // Store the ZIP file temporarily for download
    const zipBuffer = await streamToBuffer(archive);
    const zipMetadata = await fileStore.storeFile(
      targetSessionId,
      exportFilename,
      zipBuffer,
      'application/zip'
    );

    return NextResponse.json({
      success: true,
      exportId: zipMetadata.id,
      filename: exportFilename,
      size: zipBuffer.length,
      artifactCount: artifactsToExport.length,
      downloadUrl: `/api/artifacts/${zipMetadata.id}/download`,
    });
  } catch (error) {
    console.error('Export error:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred during export' },
      { status: 500 }
    );
  }
}

/**
 * Generate manifest.txt content for the export
 */
async function generateManifest(artifacts: any[]): Promise<string> {
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
 * Convert a readable stream to buffer
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
