#!/usr/bin/env tsx

/**
 * Demo script to show TTL sweeper functionality
 * Run with: npx tsx src/lib/__tests__/storage-demo.ts
 */

import { storageManager } from '../storage-manager';

async function demonstrateTTLSweeper() {
  console.log('🚀 Starting Storage TTL Sweeper Demo\n');

  // Create some test sessions
  console.log('📝 Creating test sessions...');
  const session1 = storageManager.createSession('thread-1');
  const session2 = storageManager.createSession('thread-2');
  const session3 = storageManager.createSession('thread-3');

  console.log(
    `Created sessions: ${session1.id}, ${session2.id}, ${session3.id}`
  );

  // Add some files to sessions
  console.log('\n📁 Adding files to sessions...');
  await storageManager.storeFile(
    session1.id,
    'data1.csv',
    Buffer.from('test,data\n1,2')
  );
  await storageManager.storeFile(
    session2.id,
    'chart1.png',
    Buffer.from('fake png data')
  );
  await storageManager.storeArtifact(
    session3.id,
    'analysis',
    Buffer.from('analysis results'),
    'md'
  );

  // Show initial stats
  let stats = storageManager.getStorageStats();
  console.log('\n📊 Initial Storage Stats:');
  console.log(`  Active Sessions: ${stats.sessions.active}`);
  console.log(`  Total Files: ${stats.files.totalFiles}`);
  console.log(`  Total Size: ${stats.files.totalSize} bytes`);

  // Manually expire one session for demo
  console.log('\n⏰ Manually expiring session 2 for demo...');
  const expiredSession = storageManager.getSession(session2.id);
  if (expiredSession) {
    expiredSession.ttlExpiresAt = Date.now() - 1000; // Expire 1 second ago
  }

  // Run cleanup
  console.log('\n🧹 Running cleanup...');
  const cleanupResult = await storageManager.cleanup();
  console.log(`  Sessions deleted: ${cleanupResult.sessionsDeleted}`);
  console.log(`  Files deleted: ${cleanupResult.filesDeleted}`);

  // Show final stats
  stats = storageManager.getStorageStats();
  console.log('\n📊 Final Storage Stats:');
  console.log(`  Active Sessions: ${stats.sessions.active}`);
  console.log(`  Total Files: ${stats.files.totalFiles}`);
  console.log(`  Total Size: ${stats.files.totalSize} bytes`);

  // Test session restoration
  console.log('\n🔄 Testing session restoration...');
  const restoredSession = storageManager.getSession(session1.id);
  if (restoredSession) {
    console.log(`  ✅ Session ${session1.id} restored successfully`);
    console.log(`  Messages: ${restoredSession.messages.length}`);
    console.log(`  Artifacts: ${restoredSession.artifacts.length}`);
    console.log(
      `  TTL expires at: ${new Date(restoredSession.ttlExpiresAt).toISOString()}`
    );
  } else {
    console.log(`  ❌ Failed to restore session ${session1.id}`);
  }

  // Test thread ID lookup
  console.log('\n🔍 Testing thread ID lookup...');
  const foundSession = storageManager.getSessionByThreadId('thread-1');
  if (foundSession) {
    console.log(`  ✅ Found session by thread ID: ${foundSession.id}`);
  } else {
    console.log(`  ❌ Failed to find session by thread ID`);
  }

  // Cleanup
  console.log('\n🧽 Cleaning up demo data...');
  await storageManager.deleteAllUserData(session1.id);
  await storageManager.deleteAllUserData(session3.id);

  console.log('\n✨ Demo completed successfully!');

  // Destroy storage manager to clean up intervals
  storageManager.destroy();
}

// Run the demo if this file is executed directly
if (require.main === module) {
  demonstrateTTLSweeper().catch(console.error);
}

export { demonstrateTTLSweeper };
