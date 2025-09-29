#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Create a test CSV file
const testCSV = `name,age,city,salary
John Doe,28,New York,75000
Jane Smith,32,Los Angeles,82000
Bob Johnson,45,Chicago,68000
Alice Brown,29,Miami,71000
Charlie Wilson,36,Seattle,89000`;

const testFile = path.join(__dirname, 'test-profile.csv');
fs.writeFileSync(testFile, testCSV);

console.log('Created test CSV file:', testFile);
console.log('CSV content:');
console.log(testCSV);

// Test the profile API
async function testProfileAPI() {
  try {
    // First upload the file
    const formData = new FormData();
    const blob = new Blob([testCSV], { type: 'text/csv' });
    formData.append('file', blob, 'test-profile.csv');

    console.log('\n1. Uploading file...');
    const uploadResponse = await fetch(
      'http://localhost:3000/api/files/upload',
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!uploadResponse.ok) {
      throw new Error(
        `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`
      );
    }

    const uploadResult = await uploadResponse.json();
    console.log('Upload result:', JSON.stringify(uploadResult, null, 2));

    const fileId = uploadResult.data.fileId;

    // Now profile the file
    console.log('\n2. Profiling file...');
    const profileResponse = await fetch(
      'http://localhost:3000/api/analysis/profile',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId }),
      }
    );

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text();
      throw new Error(
        `Profile failed: ${profileResponse.status} ${profileResponse.statusText}\n${errorText}`
      );
    }

    const profileResult = await profileResponse.json();
    console.log('Profile result:', JSON.stringify(profileResult, null, 2));

    // Check that we got the expected structure
    if (profileResult.success && profileResult.data.profile) {
      console.log('\n✅ SUCCESS: API integration working correctly!');
      console.log('Profile summary:', {
        rows: profileResult.data.profile.summary.rowCount,
        columns: profileResult.data.profile.summary.columnCount,
        quality: profileResult.data.profile.summary.quality,
      });
    } else {
      console.log('\n❌ FAILED: Profile data structure not as expected');
    }
  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    process.exit(1);
  }
}

// Run the test
testProfileAPI();
