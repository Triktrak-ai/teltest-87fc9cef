import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadFile(name: string): Uint8Array {
  return readFileSync(resolve(__dirname, '../../public/test-data', name));
}

describe('Activity section detailed analysis', () => {
  it('extracts sections with 4-byte TLV header and dumps payload', () => {
    const bytes = loadFile('358480081630115_activities_20260227_030429.ddd');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    
    // Parse TLV sections with 4-byte header: 0x76 tagLow len(2B)
    const sections: { offset: number; tag: number; data: Uint8Array }[] = [];
    let pos = 0;
    while (pos < bytes.length - 3) {
      if (bytes[pos] === 0x76) {
        const tagLow = bytes[pos + 1];
        const isValid = (tagLow >= 0x01 && tagLow <= 0x09) ||
                        (tagLow >= 0x21 && tagLow <= 0x29) ||
                        (tagLow >= 0x31 && tagLow <= 0x39);
        if (isValid) {
          const len = view.getUint16(pos + 2, false);
          if (len > 0 && len <= 500000) {
            const avail = Math.min(len, bytes.length - pos - 4);
            const data = bytes.slice(pos + 4, pos + 4 + avail);
            sections.push({ offset: pos, tag: tagLow, data });
            console.log(`Section @${pos}: tag=0x${tagLow.toString(16)}, len=${avail}${avail < len ? ` (truncated from ${len})` : ''}`);
            pos += 4 + avail;
            continue;
          }
        }
      }
      pos++;
    }
    
    // Filter activity sections (0x02, 0x22, 0x32)
    const actSections = sections.filter(s => s.tag === 0x02 || s.tag === 0x22 || s.tag === 0x32);
    console.log(`\nActivity sections: ${actSections.length}`);
    
    for (let si = 0; si < actSections.length; si++) {
      const s = actSections[si];
      const hex = Array.from(s.data.slice(0, 30)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`\n--- Activity section ${si} @${s.offset}, ${s.data.length} bytes ---`);
      console.log(`  Header hex: ${hex}`);
      
      const sv = new DataView(s.data.buffer, s.data.byteOffset, s.data.byteLength);
      
      // Try as cyclic buffer: first 4 bytes = pointers
      if (s.data.length > 20) {
        const oldest = sv.getUint16(0, false);
        const newest = sv.getUint16(2, false);
        const bodyLen = s.data.length - 4;
        console.log(`  Cyclic pointers: oldest=${oldest}, newest=${newest}, bodyLen=${bodyLen}`);
        
        if (newest < bodyLen && oldest < bodyLen) {
          // Check record at newest
          const nAbs = 4 + newest;
          if (nAbs + 12 <= s.data.length) {
            const prevL = sv.getUint16(nAbs, false);
            const recL = sv.getUint16(nAbs + 2, false);
            const ts = sv.getUint32(nAbs + 4, false);
            const valid = ts > 1577836800 && ts < 1900000000;
            console.log(`  @newest(${nAbs}): prevLen=${prevL}, recLen=${recL}, ts=${ts} (${valid ? new Date(ts*1000).toISOString().slice(0,10) : 'INVALID'})`);
            if (valid && recL >= 8) {
              const dist = sv.getUint16(nAbs + 10, false);
              console.log(`    dist=${dist} km`);
            }
          }
          
          // Check record at oldest
          const oAbs = 4 + oldest;
          if (oAbs + 12 <= s.data.length) {
            const prevL = sv.getUint16(oAbs, false);
            const recL = sv.getUint16(oAbs + 2, false);
            const ts = sv.getUint32(oAbs + 4, false);
            const valid = ts > 1577836800 && ts < 1900000000;
            console.log(`  @oldest(${oAbs}): prevLen=${prevL}, recLen=${recL}, ts=${ts} (${valid ? new Date(ts*1000).toISOString().slice(0,10) : 'INVALID'})`);
          }
        }
        
        // Also scan for timestamps to find actual record positions
        console.log('  Timestamp scan (first 10):');
        let found = 0;
        for (let j = 4; j < s.data.length - 10 && found < 10; j++) {
          const ts = sv.getUint32(j, false);
          if (ts > 1577836800 && ts < 1900000000) {
            const date = new Date(ts * 1000).toISOString().slice(0, 10);
            // Check 4 bytes before for prevLen/recLen
            let info = '';
            if (j >= 8) {
              const pL = sv.getUint16(j - 4, false);
              const rL = sv.getUint16(j - 2, false);
              const dist = sv.getUint16(j + 6, false);
              info = ` prevLen=${pL} recLen=${rL} dist=${dist}`;
            }
            console.log(`    @${j}: ${date}${info}`);
            found++;
          }
        }
      }
    }
  });
});
