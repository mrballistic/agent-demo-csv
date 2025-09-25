import { NextRequest, NextResponse } from 'next/server';
import { fileStore } from '@/lib/file-store';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: 'Artifact ID is required' },
        { status: 400 }
      );
    }

    // Get file metadata
    const metadata = fileStore.getFileMetadata(id);
    if (!metadata) {
      return NextResponse.json(
        { error: 'Artifact not found or expired' },
        { status: 404 }
      );
    }

    // Get file content
    const content = await fileStore.getFile(id);
    if (!content) {
      return NextResponse.json(
        { error: 'Artifact content not found' },
        { status: 404 }
      );
    }

    // Verify file integrity
    const isValid = await fileStore.verifyFileIntegrity(id);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Artifact integrity check failed' },
        { status: 500 }
      );
    }

    // Set appropriate headers for download
    const headers = new Headers();
    headers.set('Content-Type', metadata.mimeType);
    headers.set('Content-Length', metadata.size.toString());
    headers.set(
      'Content-Disposition',
      `attachment; filename="${metadata.originalName}"`
    );
    headers.set('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour
    headers.set('ETag', `"${metadata.checksum}"`);

    // Check if client has cached version
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch === `"${metadata.checksum}"`) {
      return new NextResponse(null, { status: 304, headers });
    }

    return new NextResponse(content as BodyInit, { headers });
  } catch (error) {
    console.error('Artifact download error:', error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred while downloading the artifact' },
      { status: 500 }
    );
  }
}
