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

  it('hex dump first 200 bytes', () => {
    const ab = loadFile(CARD_FILE);
    const bytes = new Uint8Array(ab);
    console.log(`File size: ${bytes.length}`);
    // Hex dump first 200 bytes
    for (let off = 0; off < Math.min(200, bytes.length); off += 16) {
      const slice = bytes.slice(off, Math.min(off + 16, 200));
      const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(slice).map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.').join('');
      console.log(`  ${off.toString(16).padStart(4, '0')}: ${hex.padEnd(48)} |${ascii}|`);
    }
    // Scan for 05 01 pattern (EF Application_Identification)
    for (let i = 0; i < bytes.length - 5; i++) {
      if (bytes[i] === 0x05 && bytes[i+1] === 0x01) {
        const tagType = bytes[i+2];
        const len = (bytes[i+3] << 8) | bytes[i+4];
        if (len > 0 && len < 1000) {
          const data = bytes.slice(i+5, i+5+Math.min(len, 20));
          console.log(`  Found 05 01 at offset ${i}: type=${tagType.toString(16)} len=${len} data=[${Array.from(data).map(b=>b.toString(16).padStart(2,'0')).join(' ')}]`);
        }
      }
    }
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('detects card generation (gen2v1 or gen2v2)', () => {
    const ab = loadFile(CARD_FILE);
    const result = parseDddFile(ab, CARD_FILE);

    console.log(`\n=== Driver Card: ${CARD_FILE} ===`);
    console.log(`  File size: ${result.fileSize}`);
    console.log(`  Generation: ${result.generation}`);
    console.log(`  Driver card data: ${result.driverCard ? 'YES' : 'no'}`);

    if (result.driverCard) {
      const dc = result.driverCard;
      if (dc.identification) {
        console.log(`  Card number: ${dc.identification.cardNumber}`);
        console.log(`  Driver: ${dc.identification.driverName.firstName} ${dc.identification.driverName.surname}`);
        console.log(`  Country: ${dc.identification.cardIssuingMemberState}`);
        console.log(`  Issue: ${dc.identification.cardIssueDate?.toISOString().slice(0,10)}`);
        console.log(`  Expiry: ${dc.identification.cardExpiryDate?.toISOString().slice(0,10)}`);
      }
      console.log(`  Activities: ${dc.activities.length} days`);
      console.log(`  Vehicles: ${dc.vehiclesUsed.length}`);
      console.log(`  Events: ${dc.events.length}`);
      console.log(`  Faults: ${dc.faults.length}`);
      console.log(`  Places: ${dc.places.length}`);
    }
    console.log(`  Warnings: ${result.warnings.length}`);
    for (const w of result.warnings.slice(0, 10)) {
      console.log(`    - ${w.message}`);
    }

    // Generation must be detected
    expect(['gen2v1', 'gen2v2']).toContain(result.generation);
    // Must have driver card data
    expect(result.driverCard).toBeTruthy();
  });
});
