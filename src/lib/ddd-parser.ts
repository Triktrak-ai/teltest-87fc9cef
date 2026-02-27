// DDD (Vehicle Unit) binary file parser
// Based on EU Regulation 3821/85 Annex 1B / EU 165/2014

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DddOverview {
  vuManufacturerName: string;
  vuManufacturerAddress: string;
  vuSerialNumber: string;
  vuPartNumber: string;
  vuSoftwareVersion: string;
  vuManufacturingDate: Date | null;
  vuApprovalNumber: string;
  vehicleRegistrationNation: string;
  vehicleRegistrationNumber: string;
  currentDateTime: Date | null;
  vuDownloadablePeriodBegin: Date | null;
  vuDownloadablePeriodEnd: Date | null;
  cardSlotsStatus: number;
  vuDownloadActivityDataLength: number;
}

export interface ActivityRecord {
  date: Date;
  dailyPresenceCounter: number;
  dayDistance: number;
  entries: ActivityChangeEntry[];
}

export interface ActivityChangeEntry {
  slot: 'driver' | 'codriver';
  status: 'break' | 'availability' | 'work' | 'driving' | 'unknown';
  cardInserted: boolean;
  minutes: number;
  timeFrom: string;
  timeTo: string;
}

export interface EventRecord {
  eventType: number;
  eventTypeName: string;
  eventBeginTime: Date | null;
  eventEndTime: Date | null;
  cardNumberDriverSlot: string;
  cardNumberCodriverSlot: string;
}

export interface FaultRecord {
  faultType: number;
  faultTypeName: string;
  faultBeginTime: Date | null;
  faultEndTime: Date | null;
  cardNumberDriverSlot: string;
  cardNumberCodriverSlot: string;
}

export interface CalibrationRecord {
  calibrationPurpose: number;
  calibrationPurposeName: string;
  workshopName: string;
  workshopAddress: string;
  workshopCardNumber: string;
  workshopCardExpiryDate: Date | null;
  vehicleRegistrationNumber: string;
  vehicleRegistrationNation: string;
  wFactor: number;
  kFactor: number;
  tyreSize: string;
  authorisedSpeed: number;
  oldOdometerValue: number;
  newOdometerValue: number;
  oldDateTime: Date | null;
  newDateTime: Date | null;
}

export interface TechnicalData {
  vuSerialNumber: string;
  sensorSerialNumber: string;
  calibrations: CalibrationRecord[];
}

export interface SpeedRecord {
  timestamp: Date;
  speed: number;
}

export interface DddSection {
  tag: number;
  tagHigh: number;
  offset: number;
  length: number;
  data: Uint8Array;
}

export interface DddFileData {
  overview: DddOverview | null;
  activities: ActivityRecord[];
  events: EventRecord[];
  faults: FaultRecord[];
  technicalData: TechnicalData | null;
  speedRecords: SpeedRecord[];
  rawSections: DddSection[];
  generation: 'gen1' | 'gen2' | 'unknown';
}

// ─── Country codes ───────────────────────────────────────────────────────────

const NATION_CODES: Record<number, string> = {
  0x00: '—', 0x01: 'AT', 0x02: 'BE', 0x03: 'BG', 0x04: 'CH',
  0x05: 'CY', 0x06: 'CZ', 0x07: 'DE', 0x08: 'DK', 0x09: 'ES',
  0x0A: 'EE', 0x0B: 'FR', 0x0C: 'FI', 0x0D: 'GB', 0x0E: 'GR',
  0x0F: 'HU', 0x10: 'HR', 0x11: 'IT', 0x12: 'IE', 0x13: 'LU',
  0x14: 'LT', 0x15: 'LV', 0x16: 'MT', 0x17: 'NL', 0x18: 'NO',
  0x19: 'PL', 0x1A: 'PT', 0x1B: 'RO', 0x1C: 'SE', 0x1D: 'SI',
  0x1E: 'SK', 0x1F: 'UK', 0xFD: 'EUR', 0xFE: 'EC', 0xFF: '—',
};

// ─── Event/Fault type names ──────────────────────────────────────────────────

const EVENT_TYPE_NAMES: Record<number, string> = {
  0x00: 'Brak dalszych szczegółów',
  0x01: 'Włożenie karty podczas jazdy',
  0x02: 'Konflikt kart',
  0x03: 'Jazda bez karty',
  0x04: 'Konflikt pomiaru ruchu',
  0x05: 'Jazda po przekroczeniu czasu',
  0x06: 'Próba naruszenia bezpieczeństwa',
  0x07: 'Czas zmodyfikowany',
  0x08: 'Przerwa w zasilaniu',
  0x09: 'Błąd komunikacji',
  0x0A: 'Brak komunikacji z czytnikiem',
  0x0B: 'Przekroczenie prędkości',
  0x0C: 'Zakłócenie zasilania',
  0x0D: 'Błąd czujnika ruchu',
};

const FAULT_TYPE_NAMES: Record<number, string> = {
  0x00: 'Brak dalszych szczegółów',
  0x01: 'Usterka karty',
  0x02: 'Usterka wyświetlacza',
  0x03: 'Usterka pobierania danych',
  0x04: 'Usterka czujnika',
  0x05: 'Wewnętrzna usterka VU',
  0x06: 'Usterka drukarki',
  0x07: 'Usterka czujnika prędkości',
};

const CALIBRATION_PURPOSE_NAMES: Record<number, string> = {
  0x00: 'Rezerwa',
  0x01: 'Aktywacja',
  0x02: 'Pierwsza kalibracja',
  0x03: 'Regularna kalibracja',
  0x04: 'Naprawa',
  0x05: 'Zainstalowanie nowego czujnika',
};

// ─── Parser helpers ──────────────────────────────────────────────────────────

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  return buf;
}

class BinaryReader {
  private view: DataView;
  private pos: number;
  private buf: Uint8Array;

  constructor(buffer: ArrayBuffer, offset = 0) {
    this.view = new DataView(buffer);
    this.buf = new Uint8Array(buffer);
    this.pos = offset;
  }

  get position() { return this.pos; }
  set position(v: number) { this.pos = v; }
  get remaining() { return this.buf.length - this.pos; }

  readUint8(): number {
    const v = this.view.getUint8(this.pos);
    this.pos += 1;
    return v;
  }

  readUint16(): number {
    const v = this.view.getUint16(this.pos, false);
    this.pos += 2;
    return v;
  }

  readUint32(): number {
    const v = this.view.getUint32(this.pos, false);
    this.pos += 4;
    return v;
  }

  readBytes(n: number): Uint8Array {
    const slice = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  readString(n: number): string {
    const bytes = this.readBytes(n);
    // ISO 8859-1 decode
    let s = '';
    for (const b of bytes) {
      if (b === 0) break;
      s += String.fromCharCode(b);
    }
    return s.trim();
  }

  readTimestamp(): Date | null {
    const v = this.readUint32();
    if (v === 0 || v === 0xFFFFFFFF) return null;
    return new Date(v * 1000);
  }

  skip(n: number) {
    this.pos += n;
  }

  readCardNumber(): string {
    return this.readString(18);
  }
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseDddFile(buffer: ArrayBuffer): DddFileData {
  const result: DddFileData = {
    overview: null,
    activities: [],
    events: [],
    faults: [],
    technicalData: null,
    speedRecords: [],
    rawSections: [],
    generation: 'unknown',
  };

  const sections = extractSections(buffer);
  result.rawSections = sections;

  // Determine generation based on tag structure
  if (sections.some(s => s.tagHigh === 0x76)) {
    result.generation = 'gen1';
  }

  for (const section of sections) {
    try {
      const tag = section.tag;
      if (tag === 0x05 || tag === 0x7605) {
        result.overview = parseOverview(section.data);
      } else if (tag === 0x06 || tag === 0x7606) {
        result.activities = parseActivities(section.data);
      } else if (tag === 0x07 || tag === 0x7607) {
        const ef = parseEventsAndFaults(section.data);
        result.events = ef.events;
        result.faults = ef.faults;
      } else if (tag === 0x09 || tag === 0x7609) {
        result.technicalData = parseTechnicalData(section.data);
      } else if (tag === 0x08 || tag === 0x7608) {
        result.speedRecords = parseDetailedSpeed(section.data);
      }
    } catch (e) {
      console.warn(`Error parsing section tag 0x${section.tag.toString(16)}:`, e);
    }
  }

  return result;
}

function extractSections(buffer: ArrayBuffer): DddSection[] {
  const sections: DddSection[] = [];
  const reader = new BinaryReader(buffer);

  while (reader.remaining > 4) {
    const offset = reader.position;
    const tagHigh = reader.readUint8();

    // TLV: first byte is tag family (0x76 for VU data), second is section id
    if (tagHigh === 0x76) {
      if (reader.remaining < 3) break;
      const tagLow = reader.readUint8();
      const length = reader.readUint16();
      if (length > reader.remaining) {
        // Try to recover - this might be corrupted
        reader.position = offset + 1;
        continue;
      }
      const data = reader.readBytes(length);
      sections.push({
        tag: tagLow,
        tagHigh: 0x76,
        offset,
        length,
        data,
      });
    } else {
      // Try Gen2 style or skip
      reader.position = offset + 1;
    }
  }

  return sections;
}

// ─── Section parsers ─────────────────────────────────────────────────────────

function parseOverview(data: Uint8Array): DddOverview {
  const r = new BinaryReader(toArrayBuffer(data));

  // Try to extract known fields; positions may vary by VU manufacturer
  // Standard layout per Annex 1B Appendix 7
  const cardSlotsStatus = r.readUint8();
  const downloadDate = r.readTimestamp();
  const downloadPeriodBegin = r.readTimestamp();
  const downloadPeriodEnd = r.readTimestamp();

  // Vehicle identification
  const vehicleNationByte = r.remaining > 0 ? r.readUint8() : 0;
  const vehicleNation = NATION_CODES[vehicleNationByte] || `0x${vehicleNationByte.toString(16)}`;
  const vrn = r.remaining >= 14 ? r.readString(14) : '';

  // VU identification
  const vuManufacturerName = r.remaining >= 36 ? r.readString(36) : '';
  const vuManufacturerAddress = r.remaining >= 36 ? r.readString(36) : '';
  const vuSerialNumber = r.remaining >= 8 ? r.readString(8) : '';
  const vuPartNumber = r.remaining >= 16 ? r.readString(16) : '';
  const vuSoftwareVersion = r.remaining >= 4 ? r.readString(4) : '';
  const vuManufacturingDate = r.remaining >= 4 ? r.readTimestamp() : null;
  const vuApprovalNumber = r.remaining >= 16 ? r.readString(16) : '';

  // Activity data length
  const vuDownloadActivityDataLength = r.remaining >= 4 ? r.readUint32() : 0;

  return {
    vuManufacturerName,
    vuManufacturerAddress,
    vuSerialNumber,
    vuPartNumber,
    vuSoftwareVersion,
    vuManufacturingDate,
    vuApprovalNumber,
    vehicleRegistrationNation: vehicleNation,
    vehicleRegistrationNumber: vrn,
    currentDateTime: downloadDate,
    vuDownloadablePeriodBegin: downloadPeriodBegin,
    vuDownloadablePeriodEnd: downloadPeriodEnd,
    cardSlotsStatus,
    vuDownloadActivityDataLength,
  };
}

function parseActivities(data: Uint8Array): ActivityRecord[] {
  const records: ActivityRecord[] = [];
  const r = new BinaryReader(toArrayBuffer(data));

  // Skip header (date range)
  if (r.remaining < 8) return records;
  r.skip(8); // oldest + newest date in the block

  while (r.remaining >= 12) {
    try {
      const date = r.readTimestamp();
      if (!date) { r.skip(8); continue; }

      const dailyPresenceCounter = r.readUint16();
      const dayDistance = r.readUint16();

      // Number of activity change records
      const activityChangeCount = r.remaining >= 2 ? r.readUint16() : 0;
      const entries: ActivityChangeEntry[] = [];

      for (let i = 0; i < activityChangeCount && r.remaining >= 2; i++) {
        const word = r.readUint16();
        // Activity change: bits 15-14 = slot, bit 13 = card status, bits 12-10 = activity, bits 9-0 = time
        const slot = (word >> 15) & 0x01;
        const cardInserted = ((word >> 14) & 0x01) === 1;
        const activity = (word >> 12) & 0x03;
        const minutes = word & 0x0FFF;

        const statusMap: Record<number, ActivityChangeEntry['status']> = {
          0: 'break',
          1: 'availability',
          2: 'work',
          3: 'driving',
        };

        const nextMinutes = (i + 1 < activityChangeCount && r.remaining >= 2)
          ? (r.readUint16() & 0x0FFF)
          : 1440;

        // Unread the peeked word
        if (i + 1 < activityChangeCount && r.remaining >= 0) {
          r.position -= 2;
        }

        const hFrom = Math.floor(minutes / 60);
        const mFrom = minutes % 60;
        const hTo = Math.floor(Math.min(nextMinutes, 1440) / 60);
        const mTo = Math.min(nextMinutes, 1440) % 60;

        entries.push({
          slot: slot === 0 ? 'driver' : 'codriver',
          status: statusMap[activity] || 'unknown',
          cardInserted,
          minutes,
          timeFrom: `${hFrom.toString().padStart(2, '0')}:${mFrom.toString().padStart(2, '0')}`,
          timeTo: `${hTo.toString().padStart(2, '0')}:${mTo.toString().padStart(2, '0')}`,
        });
      }

      records.push({ date, dailyPresenceCounter, dayDistance, entries });
    } catch {
      break;
    }
  }

  return records;
}

function parseEventsAndFaults(data: Uint8Array): { events: EventRecord[]; faults: FaultRecord[] } {
  const events: EventRecord[] = [];
  const faults: FaultRecord[] = [];
  const r = new BinaryReader(toArrayBuffer(data));

  // Events section
  if (r.remaining >= 2) {
    const eventCount = r.readUint16();
    for (let i = 0; i < eventCount && r.remaining >= 24; i++) {
      const eventType = r.readUint8();
      const eventBeginTime = r.readTimestamp();
      const eventEndTime = r.readTimestamp();
      const cardNumberDriverSlot = r.readCardNumber();
      // Skip remaining per-record bytes if any
      const cardNumberCodriverSlot = r.remaining >= 18 ? r.readCardNumber() : '';

      events.push({
        eventType,
        eventTypeName: EVENT_TYPE_NAMES[eventType] || `Nieznany (0x${eventType.toString(16)})`,
        eventBeginTime,
        eventEndTime,
        cardNumberDriverSlot,
        cardNumberCodriverSlot,
      });
    }
  }

  // Faults section
  if (r.remaining >= 2) {
    const faultCount = r.readUint16();
    for (let i = 0; i < faultCount && r.remaining >= 12; i++) {
      const faultType = r.readUint8();
      const faultBeginTime = r.readTimestamp();
      const faultEndTime = r.readTimestamp();
      const cardNumberDriverSlot = r.remaining >= 18 ? r.readCardNumber() : '';
      const cardNumberCodriverSlot = r.remaining >= 18 ? r.readCardNumber() : '';

      faults.push({
        faultType,
        faultTypeName: FAULT_TYPE_NAMES[faultType] || `Nieznany (0x${faultType.toString(16)})`,
        faultBeginTime,
        faultEndTime,
        cardNumberDriverSlot,
        cardNumberCodriverSlot,
      });
    }
  }

  return { events, faults };
}

function parseTechnicalData(data: Uint8Array): TechnicalData {
  const r = new BinaryReader(toArrayBuffer(data));

  const vuSerialNumber = r.remaining >= 8 ? r.readString(8) : '';
  const sensorSerialNumber = r.remaining >= 8 ? r.readString(8) : '';
  const calibrations: CalibrationRecord[] = [];

  // Calibration records
  if (r.remaining >= 2) {
    const calCount = r.readUint16();
    for (let i = 0; i < calCount && r.remaining >= 40; i++) {
      const calibrationPurpose = r.readUint8();
      const workshopName = r.readString(36);
      const workshopAddress = r.readString(36);
      const workshopCardNumber = r.readCardNumber();
      const workshopCardExpiryDate = r.readTimestamp();
      const vrnNation = r.remaining > 0 ? r.readUint8() : 0;
      const vrn = r.remaining >= 14 ? r.readString(14) : '';
      const wFactor = r.remaining >= 2 ? r.readUint16() : 0;
      const kFactor = r.remaining >= 2 ? r.readUint16() : 0;
      const tyreSize = r.remaining >= 15 ? r.readString(15) : '';
      const authorisedSpeed = r.remaining >= 1 ? r.readUint8() : 0;
      const oldOdometerValue = r.remaining >= 3 ? ((r.readUint8() << 16) | r.readUint16()) : 0;
      const newOdometerValue = r.remaining >= 3 ? ((r.readUint8() << 16) | r.readUint16()) : 0;
      const oldDateTime = r.remaining >= 4 ? r.readTimestamp() : null;
      const newDateTime = r.remaining >= 4 ? r.readTimestamp() : null;

      calibrations.push({
        calibrationPurpose,
        calibrationPurposeName: CALIBRATION_PURPOSE_NAMES[calibrationPurpose] || `Nieznany (${calibrationPurpose})`,
        workshopName,
        workshopAddress,
        workshopCardNumber,
        workshopCardExpiryDate,
        vehicleRegistrationNumber: vrn,
        vehicleRegistrationNation: NATION_CODES[vrnNation] || `0x${vrnNation.toString(16)}`,
        wFactor,
        kFactor,
        tyreSize,
        authorisedSpeed,
        oldOdometerValue,
        newOdometerValue,
        oldDateTime,
        newDateTime,
      });
    }
  }

  return { vuSerialNumber, sensorSerialNumber, calibrations };
}

function parseDetailedSpeed(data: Uint8Array): SpeedRecord[] {
  const records: SpeedRecord[] = [];
  const r = new BinaryReader(toArrayBuffer(data));

  // Speed blocks: timestamp (4) + count (2) + speeds (1 each per second)
  while (r.remaining >= 6) {
    const timestamp = r.readTimestamp();
    if (!timestamp) break;
    const count = r.readUint16();

    for (let i = 0; i < count && r.remaining >= 1; i++) {
      const speed = r.readUint8();
      records.push({
        timestamp: new Date(timestamp.getTime() + i * 1000),
        speed,
      });
    }
  }

  // Limit to prevent memory issues
  if (records.length > 50000) {
    return records.slice(0, 50000);
  }

  return records;
}
