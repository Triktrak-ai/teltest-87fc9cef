import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseDddFile } from '../lib/ddd-parser';

function loadFile(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(__dirname, '../../public/test-data', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('Driver card parsing', () => {
  const CARD_FILE = '358480081630115_driver1_20260228_050546.ddd';

  it('dump 0x76 sections and find card TLV inside', () => {
    const ab = loadFile(CARD_FILE);
    const bytes = new Uint8Array(ab);
    for (let i = 0; i < bytes.length - 4; i++) {
      if (bytes[i] === 0x76) {
        const subTag = bytes[i+1];
        const len = (bytes[i+2] << 8) | bytes[i+3];
        if (len > 0 && len < 65535 && i + 4 + len <= bytes.length) {
          const data = bytes.slice(i + 4, i + 4 + len);
          const first80 = Array.from(data.slice(0, 80)).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log(`0x76 ${subTag.toString(16).padStart(2,'0')} @${i}: len=${len}`);
          console.log(`  raw: [${first80}]`);
          // Try different strip lengths to find card TLV
          for (const stripLen of [0, 5, 7, 13, 15]) {
            if (data.length > stripLen + 5) {
              const s = data.slice(stripLen);
              const t0 = s[0], t1 = s[1], t2 = s[2];
              const sLen = (s[3] << 8) | s[4];
              // Card TLV: FID high byte 0x00-0x0C, type 0x00-0x03
              if (t0 <= 0x0C && t2 <= 0x03 && sLen > 0 && sLen < 50000) {
                console.log(`  strip=${stripLen}: FID=0x${t0.toString(16).padStart(2,'0')}${t1.toString(16).padStart(2,'0')} type=${t2} len=${sLen} ✓`);
              }
            }
          }
          i += 3 + len;
        }
      }
    }
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('detects card generation (gen2v1 or gen2v2)', () => {
    const ab = loadFile(CARD_FILE);
    const result = parseDddFile(ab, CARD_FILE);

    console.log(`\n=== Driver Card: ${CARD_FILE} ===`);
    console.log(`  Generation: ${result.generation}`);
    if (result.driverCard) {
      const dc = result.driverCard;
      if (dc.identification) {
        console.log(`  Card: ${dc.identification.cardNumber}`);
        console.log(`  Driver: ${dc.identification.driverName.firstName} ${dc.identification.driverName.surname}`);
      }
      console.log(`  Activities: ${dc.activities.length}, Vehicles: ${dc.vehiclesUsed.length}`);
      console.log(`  Events: ${dc.events.length}, Faults: ${dc.faults.length}, Places: ${dc.places.length}`);
    }
    for (const w of result.warnings.slice(0, 5)) {
      console.log(`  WARN: ${w.message}`);
    }

    expect(['gen2v1', 'gen2v2']).toContain(result.generation);
    expect(result.driverCard).toBeTruthy();
  });
});
