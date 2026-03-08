import { describe, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function hex(bytes: Uint8Array, n = 24) {
  return Array.from(bytes.slice(0, n)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

describe('debug activities sections', () => {
  it('prints section headers', () => {
    const buf = readFileSync(resolve(__dirname, '../../public/test-data/358480081630115_activities_20260227_030429.ddd'));
    const bytes = new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const sections: Array<{ off: number; tag: number; len: number; data: Uint8Array }> = [];
    for (let i = 0; i < bytes.length - 3; i++) {
      if (bytes[i] === 0x76) {
        const tag = bytes[i + 1];
        const len = view.getUint16(i + 2, false);
        if (len > 0 && i + 4 + len <= bytes.length) {
          if (tag === 0x32) sections.push({ off: i, tag, len, data: bytes.slice(i + 4, i + 4 + len) });
          i += 3 + len;
        }
      }
    }

    console.log('sections=', sections.length);
    for (const s of sections) {
      console.log(`off=${s.off} len=${s.len} head=${hex(s.data, 40)}`);
      const dv = new DataView(s.data.buffer, s.data.byteOffset, s.data.byteLength);
      for (let o = 0; o < 20 && o + 12 < s.data.length; o++) {
        const ts = dv.getUint32(o, false);
        const count = dv.getUint16(o + 8, false);
        if (ts > 946684800 && ts < 1893456000 && count <= 1440) {
          console.log(`  cand off=${o} ts=${new Date(ts * 1000).toISOString()} count=${count}`);
        }
      }
    }
  });
});
