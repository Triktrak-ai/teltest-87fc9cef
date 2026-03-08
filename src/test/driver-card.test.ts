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

  it('detects gen2v2 and parses identification correctly', () => {
    const ab = loadFile(CARD_FILE);
    const result = parseDddFile(ab, CARD_FILE);

    expect(result.generation).toBe('gen2v2');
    expect(result.driverCard).toBeTruthy();

    const id = result.driverCard!.identification!;
    console.log(`Card: "${id.cardNumber}" Country: ${id.cardIssuingMemberState}`);
    console.log(`Name: "${id.driverName.firstName}" "${id.driverName.surname}"`);
    console.log(`Issue: ${id.cardIssueDate?.toISOString().slice(0,10)} Expiry: ${id.cardExpiryDate?.toISOString().slice(0,10)}`);

    // Card number should not have non-alphanumeric prefix
    expect(id.cardNumber).toMatch(/^[A-Z0-9]/);
    expect(id.driverName.surname.length).toBeGreaterThan(1);
    expect(id.driverName.firstName.length).toBeGreaterThan(1);
    expect(id.cardIssueDate).toBeTruthy();
    expect(id.cardExpiryDate).toBeTruthy();

    expect(result.driverCard!.activities.length).toBeGreaterThan(100);
    expect(result.driverCard!.vehiclesUsed.length).toBeGreaterThan(100);
  });
});
