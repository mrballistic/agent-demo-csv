/**
 * Demo script showing how to use the AssistantManager
 * This is for documentation purposes and shows the complete workflow
 */

import { assistantManager, extractManifest } from '../openai';

async function demoAnalysisWorkflow() {
  try {
    console.log('🤖 Creating AI Data Analyst Assistant...');

    // Step 1: Create the assistant
    const assistant = await assistantManager.createAssistant();
    console.log(`✅ Assistant created: ${assistant.id}`);

    // Step 2: Create a new conversation thread
    const thread = await assistantManager.createThread();
    console.log(`✅ Thread created: ${thread.id}`);

    // Step 3: Upload a CSV file (this would be done via the file upload API)
    // For demo purposes, we'll assume we have a file ID
    const csvFileId = 'file_example123';

    // Step 4: Send message with CSV attachment for profiling
    console.log('📊 Sending CSV for profiling...');
    await assistantManager.createMessage(
      thread.id,
      'Profile the file and suggest questions.',
      csvFileId
    );

    // Step 5: Start the analysis run
    console.log('🔄 Starting analysis run...');
    const run = await assistantManager.createRun(thread.id);
    console.log(`✅ Run started: ${run.id}`);

    // Step 6: Wait for completion (in real app, you'd use streaming or polling)
    // For demo, we'll simulate getting the completed messages
    console.log('⏳ Waiting for analysis to complete...');

    // Step 7: Get the results
    const messages = await assistantManager.getMessages(thread.id);
    console.log(`✅ Retrieved ${messages.length} messages`);

    // Step 8: Extract the manifest from assistant's response
    const manifest = extractManifest(messages);
    if (manifest) {
      console.log('📋 Analysis Manifest:');
      console.log(`   Insight: ${manifest.insight}`);
      console.log(`   Files generated: ${manifest.files.length}`);
      manifest.files.forEach(file => {
        console.log(`   - ${file.purpose}: ${file.path} (${file.type})`);
      });
      console.log(`   Analysis type: ${manifest.metadata?.analysis_type}`);
    }

    // Step 9: Download generated files (charts, cleaned data, etc.)
    if (manifest?.files.length) {
      console.log('📥 Downloading generated files...');
      for (const file of manifest.files) {
        // In real implementation, you'd get the actual OpenAI file ID
        // const buffer = await assistantManager.downloadFile(openaiFileId);
        console.log(`   Downloaded: ${file.path}`);
      }
    }

    console.log('🎉 Analysis workflow completed successfully!');
  } catch (error) {
    console.error('❌ Error in analysis workflow:', error);
  }
}

// Example of streaming analysis
async function demoStreamingAnalysis() {
  try {
    console.log('🌊 Starting streaming analysis...');

    const assistant = await assistantManager.createAssistant();
    const thread = await assistantManager.createThread();

    await assistantManager.createMessage(
      thread.id,
      'Show me revenue trends over time',
      'file_example123'
    );

    // Stream the run for real-time updates
    console.log('📡 Streaming analysis progress...');
    const streamGenerator = assistantManager.streamRun(thread.id);

    for await (const event of streamGenerator) {
      console.log('📨 Stream event:', event.event || event.type);

      // Handle different event types
      if (event.event === 'thread.run.completed') {
        console.log('✅ Analysis completed!');
        break;
      } else if (event.event === 'thread.run.failed') {
        console.log('❌ Analysis failed:', event.data);
        break;
      }
    }
  } catch (error) {
    console.error('❌ Error in streaming analysis:', error);
  }
}

// Example of cancelling a run
async function demoCancelRun() {
  try {
    console.log('🛑 Demo: Cancelling a run...');

    const assistant = await assistantManager.createAssistant();
    const thread = await assistantManager.createThread();

    await assistantManager.createMessage(
      thread.id,
      'Analyze this large dataset'
    );
    const run = await assistantManager.createRun(thread.id);

    console.log(`🔄 Started run: ${run.id}`);

    // Cancel the run
    const cancelledRun = await assistantManager.cancelRun(thread.id, run.id);
    console.log(
      `🛑 Cancelled run: ${cancelledRun.id}, status: ${cancelledRun.status}`
    );
  } catch (error) {
    console.error('❌ Error cancelling run:', error);
  }
}

// Export demo functions for testing
export { demoAnalysisWorkflow, demoStreamingAnalysis, demoCancelRun };
