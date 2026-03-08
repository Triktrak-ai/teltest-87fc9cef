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
      if (name.includes('activities')) {
        console.log(`  Rejections: ${result.activityRejections.length}`);
        for (const r of result.activityRejections.slice(0, 8)) {
          console.log(`    - off=${r.offset} date=${r.date} reason=${r.reason} entries=${r.changeCount ?? '-'} dist=${r.dayDistance ?? '-'} totals=${r.slotTotals ? `${r.slotTotals.driver}/${r.slotTotals.codriver}` : '-'}`);
        }
        expect(result.activities.length).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it('merges all 5 files into one dataset', () => {
    // Analyze TRTP structure: dump each 0x76 0x32 section after stripping 13-byte header
    const actBuf = loadFile('358480081630115_activities_20260227_030429.ddd');
    const actBytes = new Uint8Array(actBuf);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < actBytes.length - 4; i++) {
      if (actBytes[i] === 0x76 && actBytes[i+1] === 0x32) {
        const secLen = (actBytes[i+2] << 8) | actBytes[i+3];
        const dataStart = i + 4;
        const raw = actBytes.slice(dataStart, dataStart + Math.min(secLen, actBytes.length - dataStart));
        // Strip 13-byte TRTP header
        const stripped = (raw.length >= 13 && raw[0] === 0x04 && raw[7] === 0x05) ? raw.slice(13) : raw;
        chunks.push(stripped);
        const hex80 = Array.from(stripped.slice(0, 80))
          .map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`  Chunk ${chunks.length} (${stripped.length}B): ${hex80}`);
        
        // Try to interpret first record: date(4B) + counter(2B) + distance(2B) + count(2B)
        if (stripped.length >= 10) {
          const dv = new DataView(stripped.buffer, stripped.byteOffset, stripped.byteLength);
          const ts = dv.getUint32(0, false);
          const date = new Date(ts * 1000);
          const counter = dv.getUint16(4, false);
          const distance = dv.getUint16(6, false);
          const nChanges = dv.getUint16(8, false);
          console.log(`    Interp A (VU no-prefix): date=${date.toISOString().slice(0,10)} ts=0x${ts.toString(16)} counter=${counter} dist=${distance} nChanges=${nChanges}`);
          
          // Try with 2-byte global prefix
          if (stripped.length >= 12) {
            const globalCount = dv.getUint16(0, false);
            const ts2 = dv.getUint32(2, false);
            const date2 = new Date(ts2 * 1000);
            const counter2 = dv.getUint16(6, false);
            const distance2 = dv.getUint16(8, false);
            const nChanges2 = dv.getUint16(10, false);
            console.log(`    Interp B (2B prefix): globalCount=${globalCount} date=${date2.toISOString().slice(0,10)} ts2=0x${ts2.toString(16)} counter2=${counter2} dist2=${distance2} nChanges2=${nChanges2}`);
          }
          
          // Try with card format: prevLen(2B) + recLen(2B) + date(4B)
          if (stripped.length >= 12) {
            const prevLen = dv.getUint16(0, false);
            const recLen = dv.getUint16(2, false);
            const ts3 = dv.getUint32(4, false);
            const date3 = new Date(ts3 * 1000);
            console.log(`    Interp C (card cyclic): prevLen=${prevLen} recLen=${recLen} date=${date3.toISOString().slice(0,10)} ts3=0x${ts3.toString(16)}`);
          }
        }
        
        i += 3 + secLen;
      }
    }
    
    // Also dump the concatenated buffer structure
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const merged_raw = new Uint8Array(totalLen);
    let wp = 0;
    for (const c of chunks) { merged_raw.set(c, wp); wp += c.length; }
    console.log(`\n  Concatenated buffer: ${totalLen} bytes`);
    console.log(`  First 40B: ${Array.from(merged_raw.slice(0, 40)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    
    // Try to scan for valid timestamps in the concatenated buffer
    const mdv = new DataView(merged_raw.buffer, merged_raw.byteOffset, merged_raw.byteLength);
    console.log(`\n  Scanning for valid timestamps (2024-2026 range):`);
    for (let off = 0; off < Math.min(merged_raw.length - 4, 400); off++) {
      const ts = mdv.getUint32(off, false);
      const year = new Date(ts * 1000).getUTCFullYear();
      if (year >= 2024 && year <= 2026) {
        const ctx = Array.from(merged_raw.slice(Math.max(0, off-4), off+12))
          .map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`    @${off}: ts=0x${ts.toString(16)} = ${new Date(ts * 1000).toISOString().slice(0,10)} ctx=[${ctx}]`);
      }
    }

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

    // Activities should be parsed from activities file (Gen2v2 TLV sections)
    expect(merged.activities.length).toBeGreaterThanOrEqual(5);

    // Regression: dayDistance values must NOT all be identical (was 768 km bug)
    const distances = merged.activities.map(a => a.dayDistance);
    const uniqueDistances = new Set(distances);
    console.log(`  Unique dayDistance values: ${uniqueDistances.size} out of ${distances.length}`);
    console.log(`  Sample distances: ${distances.slice(0, 10).join(', ')}`);
    expect(uniqueDistances.size).toBeGreaterThan(3);

    // Regression: no record should have the known 768 km artifact from chunk boundary corruption
    const artifact768 = distances.filter(d => d === 768);
    console.log(`  Records with dayDistance=768: ${artifact768.length}`);
    expect(artifact768.length).toBe(0);

    // Speed should now have many more records from individual file parsing
    expect(merged.speedRecords.length).toBeGreaterThan(1000);
  });
});
