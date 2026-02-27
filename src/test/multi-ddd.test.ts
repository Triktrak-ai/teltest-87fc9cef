import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseDddFile, mergeDddData, emptyDddData } from '../lib/ddd-parser';

const FILES = [
  '358480081630115_overview_20260227_030316.ddd',
  '358480081630115_activities_20260227_030429.ddd',
  '358480081630115_events_20260227_030447.ddd',
  '358480081630115_speed_20260227_031233.ddd',
  '358480081630115_technical_20260227_031247.ddd',
];

function loadFile(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, '../../public/test-data', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('Multi-file DDD merge with filename detection', () => {
  it('parses each file individually with filename hint', () => {
    for (const name of FILES) {
      const ab = loadFile(name);
      const result = parseDddFile(ab, name);
      console.log(`\n=== ${name} ===`);
      console.log(`  File size: ${result.fileSize}`);
      console.log(`  Generation: ${result.generation}`);
      console.log(`  Overview: ${result.overview ? 'YES' : 'no'}`);
      console.log(`  Activities: ${result.activities.length}`);
      console.log(`  Events: ${result.events.length}, Faults: ${result.faults.length}`);
      console.log(`  Speed records: ${result.speedRecords.length}`);
      console.log(`  Technical: ${result.technicalData ? 'YES' : 'no'}`);
      if (result.technicalData) {
        console.log(`  Calibrations: ${result.technicalData.calibrations.length}`);
        for (const c of result.technicalData.calibrations) {
          console.log(`    - ${c.calibrationPurposeName}: ${c.workshopName} | VRN=${c.vehicleRegistrationNumber} | ${c.newOdometerValue}km`);
        }
      }
      console.log(`  Warnings: ${result.warnings.map(w => w.message).join('; ')}`);
    }
  });

  it('merges all 5 files into one dataset', () => {
    let merged = emptyDddData();
    for (const name of FILES) {
      const ab = loadFile(name);
      const parsed = parseDddFile(ab, name);
      merged = mergeDddData(merged, parsed);
    }

    console.log('\n=== MERGED RESULT ===');
    console.log(`  Total file size: ${merged.fileSize}`);
    console.log(`  Generation: ${merged.generation}`);
    console.log(`  Overview: ${merged.overview ? 'YES' : 'no'}`);
    console.log(`  Activities: ${merged.activities.length}`);
    console.log(`  Events: ${merged.events.length}, Faults: ${merged.faults.length}`);
    console.log(`  Speed records: ${merged.speedRecords.length}`);
    console.log(`  Technical: ${merged.technicalData ? 'YES' : 'no'}`);
    console.log(`  Warnings: ${merged.warnings.length}`);

    // Speed should now have many more records from individual file parsing
    expect(merged.speedRecords.length).toBeGreaterThan(1000);
  });
});
