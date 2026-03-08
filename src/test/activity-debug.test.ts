import { describe, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseDddFile } from '../lib/ddd-parser';

function loadFile(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, '../../public/test-data', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('Activity record hex dump', () => {
  it('dumps first bytes of activities file sections', () => {
    const name = '358480081630115_activities_20260227_030429.ddd';
    const ab = loadFile(name);
    const bytes = new Uint8Array(ab);
    
    // Find TLV sections (0x76 0x32)
    for (let i = 0; i < bytes.length - 5; i++) {
      if (bytes[i] === 0x76 && bytes[i+1] === 0x32) {
        const sectionLen = (bytes[i+3] << 8) | bytes[i+4];
        const dataStart = i + 5;
        console.log(`\n--- Section at offset ${i}, declared length ${sectionLen} ---`);
        const hexDump = Array.from(bytes.slice(dataStart, dataStart + Math.min(40, sectionLen)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' ');
        console.log(`  First 40 bytes: ${hexDump}`);
        
        // Try to interpret as cyclic buffer header
        const view = new DataView(ab, dataStart);
        const w0 = view.getUint16(0, false);
        const w1 = view.getUint16(2, false);
        console.log(`  Word[0]=${w0} (0x${w0.toString(16)}), Word[1]=${w1} (0x${w1.toString(16)})`);
        
        // Check if word[0]/word[1] could be pointers (< section length)
        if (w0 < sectionLen && w1 < sectionLen) {
          console.log(`  → Could be cyclic pointers: oldest=${w0}, newest=${w1}`);
          // Check what's at newestPtr + 4 (header)
          const bodyStart = 4;
          const newestAbs = bodyStart + w1;
          if (newestAbs + 12 < sectionLen) {
            const prevLen = view.getUint16(newestAbs, false);
            const recLen = view.getUint16(newestAbs + 2, false);
            const ts = view.getUint32(newestAbs + 4, false);
            const tsDate = ts > 946684800 && ts < 2000000000 ? new Date(ts * 1000).toISOString() : 'INVALID';
            console.log(`    @newest: prevLen=${prevLen}, recLen=${recLen}, ts=${ts} (${tsDate})`);
            if (recLen >= 8 && recLen < 3000) {
              const counter = view.getUint16(newestAbs + 8, false);
              const dist = view.getUint16(newestAbs + 10, false);
              console.log(`    counter=${counter} (BCD=${((counter>>12)&0xf)*1000+((counter>>8)&0xf)*100+((counter>>4)&0xf)*10+(counter&0xf)}), dist=${dist} km`);
            }
          }
        }
        
        // Also check if it starts with record directly (prevLen=0)
        const ts4 = view.getUint32(4, false);
        const tsDate4 = ts4 > 946684800 && ts4 < 2000000000 ? new Date(ts4 * 1000).toISOString() : 'INVALID';
        console.log(`  @offset4: ts=${ts4} (${tsDate4})`);
      }
    }
  });
});
