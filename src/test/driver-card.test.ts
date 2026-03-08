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

  it('detects gen2v2 from cardStructureVersion', () => {
    const ab = loadFile(CARD_FILE);
    const result = parseDddFile(ab, CARD_FILE);

    expect(result.generation).toBe('gen2v2');
    expect(result.driverCard).toBeTruthy();
    expect(result.driverCard!.activities.length).toBeGreaterThan(100);
    expect(result.driverCard!.vehiclesUsed.length).toBeGreaterThan(100);
    expect(result.driverCard!.events.length).toBeGreaterThan(0);
    expect(result.driverCard!.places.length).toBeGreaterThan(0);
  });
});
