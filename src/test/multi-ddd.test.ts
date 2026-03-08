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
        console.log(`  Accepted activity dates:`);
        for (const a of result.activities) {
          console.log(`    ✓ ${a.date.toISOString().slice(0,10)} dist=${a.dayDistance}km entries=${a.entries.length} counter=${a.dailyPresenceCounter}`);
        }
        console.log(`  Rejections: ${result.activityRejections.length}`);
        for (const r of result.activityRejections.slice(0, 8)) {
          console.log(`    - off=${r.offset} date=${r.date} reason=${r.reason} entries=${r.changeCount ?? '-'} dist=${r.dayDistance ?? '-'} totals=${r.slotTotals ? `${r.slotTotals.driver}/${r.slotTotals.codriver}` : '-'}`);
        }
        expect(result.activities.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('analyzes VU activities file structure', () => {
    const actBuf = loadFile('358480081630115_activities_20260227_030429.ddd');
    const actBytes = new Uint8Array(actBuf);
    
    // Dump first 125 bytes (before first 0x76 0x32)
    console.log(`\nFile size: ${actBytes.length}`);
    console.log(`Pre-TLV data (0-124): ${Array.from(actBytes.slice(0, 125)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    
    // Scan ALL TLV tags in the file (0x76 XX pattern)
    console.log(`\nAll TLV sections:`);
    for (let i = 0; i < actBytes.length - 4; i++) {
      if (actBytes[i] === 0x76) {
        const subTag = actBytes[i+1];
        const len = (actBytes[i+2] << 8) | actBytes[i+3];
        if (len > 0 && len <= 65535) {
          const dataStart = i + 4;
          const available = Math.min(len, actBytes.length - dataStart);
          const first30 = Array.from(actBytes.slice(dataStart, dataStart + Math.min(30, available)))
            .map(b => b.toString(16).padStart(2, '0')).join(' ');
          // Check if data looks like TRTP (starts with 04 00)
          const isTrtp = available >= 2 && actBytes[dataStart] === 0x04 && actBytes[dataStart+1] === 0x00;
          // After 13B TRTP strip, check if data looks like names or numbers
          let afterStrip = '';
          if (isTrtp && available >= 43) {
            const stripped = actBytes.slice(dataStart + 13, dataStart + Math.min(43, available));
            const ascii = Array.from(stripped).map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.').join('');
            afterStrip = ` ascii="${ascii}"`;
          }
          console.log(`  @${i}: tag=76 ${subTag.toString(16).padStart(2,'0')}, len=${len}, avail=${available}, trtp=${isTrtp}${afterStrip}`);
          console.log(`    first30=[${first30}]`);
          i += 3 + len - 1; // skip section
        }
      }
    }
    
    // After TRTP strip, concatenate and scan for valid timestamps (2024-2027)
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < actBytes.length - 4; i++) {
      if (actBytes[i] === 0x76 && actBytes[i+1] === 0x32) {
        const len = (actBytes[i+2] << 8) | actBytes[i+3];
        const dataStart = i + 4;
        const available = Math.min(len, actBytes.length - dataStart);
        const raw = actBytes.slice(dataStart, dataStart + available);
        // Strip 13B TRTP + try 15B (with 2B offset)
        const stripped13 = (raw.length >= 13 && raw[0] === 0x04) ? raw.slice(13) : raw;
        const stripped15 = (raw.length >= 15 && raw[0] === 0x04) ? raw.slice(15) : raw;
        chunks.push(stripped15);
        i += 3 + len;
      }
    }
    
    // Concatenate with 15B strip and scan
    const total15 = chunks.reduce((s, c) => s + c.length, 0);
    const buf15 = new Uint8Array(total15);
    let wp = 0;
    for (const c of chunks) { buf15.set(c, wp); wp += c.length; }
    
    console.log(`\nConcatenated (15B strip): ${total15} bytes`);
    console.log(`First 60B: ${Array.from(buf15.slice(0, 60)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    
    // Try VU format: date(4B) + counter(2B) + distance(2B) + nChanges(2B)
    const dv = new DataView(buf15.buffer, buf15.byteOffset, buf15.byteLength);
    console.log(`\nScanning for VuActivityDailyRecord pattern (valid ts + reasonable fields):`);
    for (let off = 0; off < Math.min(buf15.length - 10, 600); off++) {
      const ts = dv.getUint32(off, false);
      const year = new Date(ts * 1000).getUTCFullYear();
      if (year >= 2024 && year <= 2027) {
        const counter = dv.getUint16(off + 4, false);
        const dist = dv.getUint16(off + 6, false);
        const nch = dv.getUint16(off + 8, false);
        // Plausibility: dist < 3000, nch < 1440
        const plausible = dist < 3000 && nch < 1440 && nch > 0;
        if (plausible) {
          console.log(`  @${off}: date=${new Date(ts*1000).toISOString().slice(0,10)} counter=${counter} dist=${dist} nChanges=${nch} ${plausible ? '✓' : ''}`);
        }
      }
    }
    
    expect(actBytes.length).toBeGreaterThan(0);
  });

  it('merges all 5 files into one dataset', () => {
    let merged = emptyDddData();
    for (const name of FILES) {
      const ab = loadFile(name);
      const parsed = parseDddFile(ab, name);
      merged = mergeDddData(merged, parsed);
    }

    console.log('\n=== MERGED RESULT ===');
    console.log(`  Activities: ${merged.activities.length}`);
    console.log(`  Events: ${merged.events.length}, Faults: ${merged.faults.length}`);
    console.log(`  Speed records: ${merged.speedRecords.length}`);

    expect(merged.activities.length).toBeGreaterThanOrEqual(5);
    expect(merged.speedRecords.length).toBeGreaterThan(1000);
  });
});
