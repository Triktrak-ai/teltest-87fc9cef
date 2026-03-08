import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadFile(name: string): Uint8Array {
  return readFileSync(resolve(__dirname, '../../public/test-data', name));
}

describe('Activity section hex analysis', () => {
  it('dumps TLV section payloads', () => {
    const bytes = loadFile('358480081630115_activities_20260227_030429.ddd');
    
    // Parse TLV sections manually (3-byte tag + 2-byte length)
    let i = 0;
    let sectionIdx = 0;
    while (i < bytes.length - 5) {
      if (bytes[i] === 0x76) {
        const fid = bytes[i + 1];
        const gen = bytes[i + 2];
        const len = (bytes[i + 3] << 8) | bytes[i + 4];
        const dataStart = i + 5;
        
        if (len > 0 && len < 65000 && dataStart + len <= bytes.length) {
          const payload = bytes.slice(dataStart, dataStart + len);
          const hex = Array.from(payload.slice(0, 60)).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log(`\nSection ${sectionIdx} @${i}: tag=0x76 0x${fid.toString(16)} gen=0x${gen.toString(16)}, len=${len}`);
          console.log(`  First 60 bytes: ${hex}`);
          
          if (len > 12) {
            const view = new DataView(payload.buffer, payload.byteOffset, payload.length);
            // Try interpreting first 4 bytes as cyclic pointers
            const w0 = view.getUint16(0, false);
            const w1 = view.getUint16(2, false);
            console.log(`  Potential pointers: oldest=${w0}, newest=${w1}`);
            
            // Scan for valid timestamps in this payload
            for (let j = 0; j < Math.min(payload.length - 4, 40); j++) {
              const ts = view.getUint32(j, false);
              if (ts > 1577836800 && ts < 1900000000) { // 2020-2030
                const date = new Date(ts * 1000).toISOString().slice(0, 10);
                console.log(`  Valid timestamp at payload offset ${j}: ${date} (${ts})`);
                if (j + 8 < payload.length) {
                  const counter = view.getUint16(j + 4, false);
                  const dist = view.getUint16(j + 6, false);
                  console.log(`    counter=0x${counter.toString(16)} (${counter}), dist=${dist} km`);
                  // Check 4 bytes before timestamp for prevLen/recLen
                  if (j >= 4) {
                    const prevL = view.getUint16(j - 4, false);
                    const recL = view.getUint16(j - 2, false);
                    console.log(`    4B before: prevLen=${prevL}, recLen=${recL}`);
                  }
                }
              }
            }
          }
          
          i = dataStart + len;
          sectionIdx++;
          continue;
        }
      }
      i++;
    }
  });
});
