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
    
    // === 13B TRTP strip — concatenate and hex dump ===
    const chunks13: Uint8Array[] = [];
    const chunkMeta: { offset: number; rawLen: number; trtpHeader: string }[] = [];
    for (let i = 0; i < actBytes.length - 4; i++) {
      if (actBytes[i] === 0x76 && actBytes[i+1] === 0x32) {
        const len = (actBytes[i+2] << 8) | actBytes[i+3];
        const dataStart = i + 4;
        const available = Math.min(len, actBytes.length - dataStart);
        const raw = actBytes.slice(dataStart, dataStart + available);
        const trtpHdr = Array.from(raw.slice(0, 15)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        const stripped = (raw.length >= 13 && raw[0] === 0x04) ? raw.slice(13) : raw;
        chunkMeta.push({ offset: i, rawLen: len, trtpHeader: trtpHdr });
        chunks13.push(stripped);
        i += 3 + len;
      }
    }

    // Show TRTP headers for each chunk
    console.log(`\nTLV 0x76 0x32 chunks: ${chunks13.length}`);
    for (let c = 0; c < chunkMeta.length; c++) {
      const m = chunkMeta[c];
      const stripped = chunks13[c];
      console.log(`  chunk#${c} @${m.offset}: rawLen=${m.rawLen} strippedLen=${stripped.length}`);
      console.log(`    TRTP(15B): [${m.trtpHeader}]`);
      // Extract date from TRTP bytes 3-6 (if present)
      const rawSlice = actBytes.slice(m.offset + 4, m.offset + 4 + Math.min(m.rawLen, 15));
      if (rawSlice.length >= 7) {
        const ts = (rawSlice[3] << 24) | (rawSlice[4] << 16) | (rawSlice[5] << 8) | rawSlice[6];
        const d = new Date(ts * 1000);
        if (d.getUTCFullYear() >= 2020 && d.getUTCFullYear() <= 2030) {
          console.log(`    TRTP date(bytes 3-6): ${d.toISOString().slice(0,10)} (ts=${ts})`);
        }
      }
    }

    // Concatenate with 13B strip
    const total13 = chunks13.reduce((s, c) => s + c.length, 0);
    const buf13 = new Uint8Array(total13);
    let wp = 0;
    for (const c of chunks13) { buf13.set(c, wp); wp += c.length; }

    console.log(`\nConcatenated (13B TRTP strip): ${total13} bytes`);
    
    // Hex dump first 200 bytes with annotations
    const dumpLen = Math.min(200, buf13.length);
    const hexLines: string[] = [];
    for (let off = 0; off < dumpLen; off += 16) {
      const slice = buf13.slice(off, Math.min(off + 16, dumpLen));
      const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(slice).map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.').join('');
      hexLines.push(`  ${off.toString(16).padStart(4, '0')}: ${hex.padEnd(48)} |${ascii}|`);
    }
    console.log(`\nHex dump (first ${dumpLen}B, 13B TRTP strip):`);
    hexLines.forEach(l => console.log(l));

    // Annotate Gen1 per-day structure: date(4B) + odo(3B) + noOfCardIW(2B) + CardIW(129B×N) + noOfChanges(2B) + ActivityChangeInfo(2B×N)
    const dv13 = new DataView(buf13.buffer, buf13.byteOffset, buf13.byteLength);
    console.log(`\nGen1 per-day structure scan (13B strip):`);
    let pos = 0;
    let dayIdx = 0;
    while (pos + 9 <= buf13.length && dayIdx < 10) {
      const ts = dv13.getUint32(pos, false);
      const date = new Date(ts * 1000);
      const year = date.getUTCFullYear();
      if (year < 2020 || year > 2030) {
        console.log(`  @${pos}: ts=0x${ts.toString(16)} → ${date.toISOString()} — INVALID, stopping`);
        break;
      }
      const odo = (buf13[pos+4] << 16) | (buf13[pos+5] << 8) | buf13[pos+6]; // 3B odometer
      const noIW = dv13.getUint16(pos + 7, false); // 2B noOfCardIWRecords
      console.log(`  Day#${dayIdx} @${pos}: date=${date.toISOString().slice(0,10)} odo=${odo}km noIW=${noIW}`);
      
      const iwSize = 129; // VuCardIWRecord Gen1 size
      const afterIW = pos + 9 + noIW * iwSize;
      if (afterIW + 2 > buf13.length) {
        console.log(`    → not enough data for CardIW records + noOfChanges (need ${afterIW + 2}, have ${buf13.length})`);
        break;
      }
      const noChanges = dv13.getUint16(afterIW, false);
      console.log(`    afterIW@${afterIW}: noOfActivityChanges=${noChanges}`);
      
      if (noChanges > 1440) {
        console.log(`    → noChanges too large, trying iwSize=130 (Gen2)`);
        const afterIW2 = pos + 9 + noIW * 130;
        if (afterIW2 + 2 <= buf13.length) {
          const noChanges2 = dv13.getUint16(afterIW2, false);
          console.log(`    afterIW(130)@${afterIW2}: noOfActivityChanges=${noChanges2}`);
        }
        break;
      }
      
      // Show first few ActivityChangeInfo
      const changeStart = afterIW + 2;
      const showN = Math.min(noChanges, 5);
      for (let j = 0; j < showN; j++) {
        const w = dv13.getUint16(changeStart + j * 2, false);
        const slot = (w >> 15) & 1;
        const status = (w >> 14) & 1;
        const activity = (w >> 12) & 3;
        const minutes = w & 0x7FF;
        const actNames = ['break/rest', 'available', 'work', 'driving'];
        console.log(`      change[${j}]: slot=${slot} status=${status} act=${actNames[activity]} time=${Math.floor(minutes/60)}:${(minutes%60).toString().padStart(2,'0')} raw=0x${w.toString(16).padStart(4,'0')}`);
      }
      
      pos = changeStart + noChanges * 2;
      dayIdx++;
    }

    // Also try with pre-TLV header (first 125 bytes) prepended
    console.log(`\nPre-TLV (first 125B) + 13B-stripped chunks — first 60B hex:`);
    const preTlv = actBytes.slice(0, 125);
    const withPreTlv = new Uint8Array(preTlv.length + total13);
    withPreTlv.set(preTlv, 0);
    withPreTlv.set(buf13, preTlv.length);
    console.log(`  Total: ${withPreTlv.length}B`);
    console.log(`  ${Array.from(withPreTlv.slice(0, 60)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);

    expect(actBytes.length).toBeGreaterThan(0);

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

    expect(merged.activities.length).toBeGreaterThanOrEqual(1);
    expect(merged.speedRecords.length).toBeGreaterThan(1000);
  });
});
