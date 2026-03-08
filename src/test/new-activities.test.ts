import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseDddFile } from '../lib/ddd-parser';

describe('New activities file (20260228)', () => {
  it('parses the larger activities file', () => {
    const name = '358480081630115_activities_20260228_044941.ddd';
    const buf = readFileSync(resolve(__dirname, '../../public/test-data', name));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const result = parseDddFile(ab, name);

    console.log(`\n=== ${name} ===`);
    console.log(`  File size: ${result.fileSize}`);
    console.log(`  Generation: ${result.generation}`);
    console.log(`  Activities: ${result.activities.length}`);
    console.log(`  Rejections: ${result.activityRejections.length}`);
    console.log(`  Warnings: ${result.warnings.length}`);

    for (const a of result.activities) {
      console.log(`  ✓ ${a.date.toISOString().slice(0,10)} dist=${a.dayDistance}km entries=${a.entries.length} counter=${a.dailyPresenceCounter}`);
    }

    if (result.activityRejections.length > 0) {
      console.log(`\n  Rejections:`);
      for (const r of result.activityRejections.slice(0, 20)) {
        console.log(`    ✗ date=${r.date} reason=${r.reason} entries=${r.changeCount ?? '-'} dist=${r.dayDistance ?? '-'}`);
      }
    }

    expect(result.activities.length).toBeGreaterThanOrEqual(1);
  });
});
