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

export interface ParserWarning {
  offset: number;
  message: string;
}

// ─── Driver Card types ───────────────────────────────────────────────────────

export interface DriverCardIdentification {
  cardNumber: string;
  cardIssuingMemberState: string;
  driverName: { surname: string; firstName: string };
  cardIssueDate: Date | null;
  cardExpiryDate: Date | null;
  cardValidityBegin: Date | null;
}

export interface VehicleUsedRecord {
  vehicleRegistrationNumber: string;
  vehicleRegistrationNation: string;
  firstUse: Date | null;
  lastUse: Date | null;
  odometerBegin: number;
  odometerEnd: number;
}

export interface CardPlaceRecord {
  entryTime: Date | null;
  dailyWorkPeriodCountry: string;
  dailyWorkPeriodRegion: string;
  vehicleOdometerValue: number;
}

export interface DriverCardData {
  identification: DriverCardIdentification | null;
  activities: ActivityRecord[];
  vehiclesUsed: VehicleUsedRecord[];
  events: EventRecord[];
  faults: FaultRecord[];
  places: CardPlaceRecord[];
}

export interface DddFileData {
  overview: DddOverview | null;
  activities: ActivityRecord[];
  events: EventRecord[];
  faults: FaultRecord[];
  technicalData: TechnicalData | null;
  speedRecords: SpeedRecord[];
  rawSections: DddSection[];
  warnings: ParserWarning[];
  fileSize: number;
  bytesParsed: number;
  generation: 'gen1' | 'gen2' | 'unknown';
  driverCard: DriverCardData | null;
}

// ─── File type detection from filename ───────────────────────────────────────

type IndividualFileType = 'overview' | 'activities' | 'events' | 'speed' | 'technical' | 'driver_card' | null;

function detectFileType(fileName?: string): IndividualFileType {
  if (!fileName) return null;
  const lower = fileName.toLowerCase();
  if (lower.includes('_driver1_') || lower.includes('_driver2_') || lower.includes('driver_card')) return 'driver_card';
  if (lower.includes('_overview_') || lower.includes('overview')) return 'overview';
  if (lower.includes('_activities_') || lower.includes('activities')) return 'activities';
  if (lower.includes('_events_') || lower.includes('events')) return 'events';
  if (lower.includes('_speed_') || lower.includes('speed')) return 'speed';
  if (lower.includes('_technical_') || lower.includes('technical')) return 'technical';
  return null;
}

// ─── Multi-file merge ────────────────────────────────────────────────────────

export function mergeDddData(existing: DddFileData, incoming: DddFileData): DddFileData {
  return {
    overview: incoming.overview ?? existing.overview,
    activities: deduplicateActivities([...existing.activities, ...incoming.activities]),
    events: [...existing.events, ...incoming.events],
    faults: [...existing.faults, ...incoming.faults],
    technicalData: incoming.technicalData ?? existing.technicalData,
    speedRecords: [...existing.speedRecords, ...incoming.speedRecords].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    ),
    rawSections: [...existing.rawSections, ...incoming.rawSections],
    warnings: [...existing.warnings, ...incoming.warnings],
    fileSize: existing.fileSize + incoming.fileSize,
    bytesParsed: existing.bytesParsed + incoming.bytesParsed,
    generation: incoming.generation !== 'unknown' ? incoming.generation : existing.generation,
    driverCard: incoming.driverCard ?? existing.driverCard,
  };
}

function deduplicateActivities(records: ActivityRecord[]): ActivityRecord[] {
  const seen = new Map<string, ActivityRecord>();
  for (const r of records) {
    const key = `${r.date.getTime()}-${r.dailyPresenceCounter}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function emptyDddData(): DddFileData {
  return {
    overview: null, activities: [], events: [], faults: [],
    technicalData: null, speedRecords: [], rawSections: [],
    warnings: [], fileSize: 0, bytesParsed: 0, generation: 'unknown',
    driverCard: null,
  };
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
  get length() { return this.buf.length; }

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

  peekUint32(): number {
    return this.view.getUint32(this.pos, false);
  }

  readBytes(n: number): Uint8Array {
    const slice = this.buf.slice(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  readString(n: number): string {
    const bytes = this.readBytes(n);
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

// ─── Timestamp validation ────────────────────────────────────────────────────

const TS_MIN = new Date('2000-01-01').getTime() / 1000;  // 946684800
const TS_MAX = new Date('2030-01-01').getTime() / 1000;  // 1893456000

function isValidTimestamp(value: number): boolean {
  return value >= TS_MIN && value <= TS_MAX;
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseDddFile(buffer: ArrayBuffer, fileName?: string): DddFileData {
  const warnings: ParserWarning[] = [];
  const result: DddFileData = {
    overview: null,
    activities: [],
    events: [],
    faults: [],
    technicalData: null,
    speedRecords: [],
    rawSections: [],
    warnings,
    fileSize: buffer.byteLength,
    bytesParsed: 0,
    generation: 'unknown',
    driverCard: null,
  };

  // Check if this is an individual file (detected by filename)
  const fileType = detectFileType(fileName);
  if (fileType) {
    console.log(`[DDD] Individual file detected: ${fileType} (${fileName})`);
    return parseIndividualFile(buffer, fileType, result);
  }

  // Otherwise, try TLV-based parsing for merged VU files
  const sections = extractSections(buffer, warnings);
  result.rawSections = sections;
  result.bytesParsed = sections.reduce((sum, s) => sum + s.length + 4, 0);

  if (sections.some(s => s.tag >= 0x31 && s.tag <= 0x39)) {
    result.generation = 'gen2';
  } else if (sections.some(s => s.tag >= 0x21 && s.tag <= 0x29)) {
    result.generation = 'gen2';
  } else if (sections.some(s => s.tagHigh === 0x76)) {
    result.generation = 'gen1';
  }

  const normalizeTag = (tag: number): number => {
    if (tag >= 0x31 && tag <= 0x39) return tag - 0x30;
    if (tag >= 0x21 && tag <= 0x29) return tag - 0x20;
    return tag;
  };

  for (const section of sections) {
    try {
      const nTag = normalizeTag(section.tag);
      if (nTag === 0x05) result.overview = parseOverview(section.data);
      else if (nTag === 0x06) result.activities = parseActivities(section.data);
      else if (nTag === 0x07) {
        const ef = parseEventsAndFaults(section.data);
        result.events = ef.events;
        result.faults = ef.faults;
      }
      else if (nTag === 0x09) result.technicalData = parseTechnicalData(section.data);
      else if (nTag === 0x08) result.speedRecords = parseDetailedSpeed(section.data);
    } catch (e) {
      console.warn(`Error parsing section tag 0x${section.tag.toString(16)}:`, e);
    }
  }

  return result;
}

// ─── Individual file parsing ─────────────────────────────────────────────────

function parseIndividualFile(buffer: ArrayBuffer, fileType: IndividualFileType, result: DddFileData): DddFileData {
  const bytes = new Uint8Array(buffer);
  result.generation = 'gen2'; // Individual files from TRTP are typically Gen2/Gen2v2

  try {
    switch (fileType) {
      case 'speed':
        result.speedRecords = parseRawSpeedFile(bytes, result.warnings);
        result.bytesParsed = buffer.byteLength;
        console.log(`[DDD] Speed: ${result.speedRecords.length} records`);
        break;

      case 'technical':
        result.technicalData = parseRawTechnicalFile(bytes, result.warnings);
        result.bytesParsed = buffer.byteLength;
        console.log(`[DDD] Technical: ${result.technicalData?.calibrations.length ?? 0} calibrations`);
        break;

      case 'events':
        const ef = parseRawEventsFile(bytes, result.warnings);
        result.events = ef.events;
        result.faults = ef.faults;
        result.bytesParsed = buffer.byteLength;
        console.log(`[DDD] Events: ${result.events.length} events, ${result.faults.length} faults`);
        break;

      case 'activities':
        result.activities = parseRawActivitiesFile(bytes, result.warnings);
        result.bytesParsed = buffer.byteLength;
        console.log(`[DDD] Activities: ${result.activities.length} days`);
        break;

      case 'overview':
        result.overview = parseRawOverviewFile(bytes, result.warnings);
        result.bytesParsed = buffer.byteLength;
        console.log(`[DDD] Overview: ${result.overview ? 'parsed' : 'empty (certificates only)'}`);
        break;

      case 'driver_card':
        result.driverCard = parseDriverCardFile(bytes, result.warnings);
        result.bytesParsed = buffer.byteLength;
        console.log(`[DDD] Driver card: ${result.driverCard?.identification?.cardNumber ?? 'no ID'}, ${result.driverCard?.vehiclesUsed.length ?? 0} vehicles`);
        break;
    }
  } catch (e) {
    console.warn(`[DDD] Error parsing individual ${fileType} file:`, e);
    result.warnings.push({ offset: 0, message: `Parse error: ${e instanceof Error ? e.message : String(e)}` });
  }

  // Also extract any TLV sections for diagnostics
  const sections = extractSections(buffer, result.warnings);
  result.rawSections = sections;

  return result;
}

// ─── Driver Card file parser ─────────────────────────────────────────────────

function parseDriverCardFile(bytes: Uint8Array, warnings: ParserWarning[]): DriverCardData {
  const result: DriverCardData = {
    identification: null,
    activities: [],
    vehiclesUsed: [],
    events: [],
    faults: [],
    places: [],
  };

  // Driver card files use 2-byte tags + 2-byte length TLV structure
  // Tags are in 0x00xx-0x05xx range
  const view = new DataView(toArrayBuffer(bytes));
  let pos = 0;

  while (pos < bytes.length - 4) {
    const tag = view.getUint16(pos, false);
    const len = view.getUint16(pos + 2, false);

    if (len === 0 || pos + 4 + len > bytes.length) {
      pos++;
      continue;
    }

    // Validate tag is in expected range for driver cards
    const tagHigh = (tag >> 8) & 0xFF;
    if (tagHigh > 0x0C && tag !== 0xC100 && tag !== 0xC108) {
      pos++;
      continue;
    }

    const sectionData = bytes.slice(pos + 4, pos + 4 + len);

    try {
      switch (tag) {
        case 0x0002: // CardIdentification
          result.identification = parseCardIdentification(sectionData);
          console.log(`[DDD] Driver card identification: ${result.identification?.cardNumber}`);
          break;

        case 0x0005: // CardDriverActivity
          result.activities = parseCardActivities(sectionData, warnings);
          console.log(`[DDD] Driver card activities: ${result.activities.length} days`);
          break;

        case 0x0006: // VehiclesUsed
          result.vehiclesUsed = parseVehiclesUsed(sectionData);
          console.log(`[DDD] Driver card vehicles: ${result.vehiclesUsed.length}`);
          break;

        case 0x0520: // CardEventData
          result.events = parseCardEvents(sectionData);
          console.log(`[DDD] Driver card events: ${result.events.length}`);
          break;

        case 0x0503: // CardFaultData
          result.faults = parseCardFaults(sectionData);
          console.log(`[DDD] Driver card faults: ${result.faults.length}`);
          break;

        case 0x0508: // CardPlaceDailyWorkPeriod
          result.places = parseCardPlaces(sectionData);
          console.log(`[DDD] Driver card places: ${result.places.length}`);
          break;
      }
    } catch (e) {
      warnings.push({ offset: pos, message: `Driver card tag 0x${tag.toString(16)}: ${e}` });
    }

    pos += 4 + len;
  }

  // If TLV parsing found nothing, try pattern-based scanning
  if (!result.identification && result.vehiclesUsed.length === 0) {
    warnings.push({ offset: 0, message: 'No TLV sections found in driver card file, trying pattern scan' });
    tryPatternScanDriverCard(bytes, result, warnings);
  }

  return result;
}

function parseCardIdentification(data: Uint8Array): DriverCardIdentification {
  const r = new BinaryReader(toArrayBuffer(data));

  // CardNumber: 16 bytes
  const cardNumber = r.remaining >= 16 ? r.readString(16) : '';
  // CardIssuingMemberState: 1 byte nation code
  const nationByte = r.remaining >= 1 ? r.readUint8() : 0;
  const cardIssuingMemberState = NATION_CODES[nationByte] || `0x${nationByte.toString(16)}`;
  // DriverName: surname (36B) + firstName (36B) — codepage varies
  const surname = r.remaining >= 36 ? r.readString(36) : '';
  const firstName = r.remaining >= 36 ? r.readString(36) : '';
  // Dates
  const cardIssueDate = r.remaining >= 4 ? r.readTimestamp() : null;
  const cardExpiryDate = r.remaining >= 4 ? r.readTimestamp() : null;
  const cardValidityBegin = r.remaining >= 4 ? r.readTimestamp() : null;

  return {
    cardNumber, cardIssuingMemberState,
    driverName: { surname, firstName },
    cardIssueDate, cardExpiryDate, cardValidityBegin,
  };
}

function parseCardActivities(data: Uint8Array, warnings: ParserWarning[]): ActivityRecord[] {
  // Card activity data has similar structure to VU activities
  // Try reusing the raw activities parser
  return parseRawActivitiesFile(data, warnings);
}

function parseVehiclesUsed(data: Uint8Array): VehicleUsedRecord[] {
  const records: VehicleUsedRecord[] = [];
  const r = new BinaryReader(toArrayBuffer(data));

  // Skip header: vehiclePointerNewestRecord (2B) if present
  if (r.remaining < 2) return records;
  const pointerOrCount = r.readUint16();

  // Each VehicleUsedRecord: odometerBegin(3B) + odometerEnd(3B) + firstUse(4B) + lastUse(4B) + VRN nation(1B) + VRN(14B) = 29 bytes
  const recordSize = 29;
  while (r.remaining >= recordSize) {
    const odometerBegin = (r.readUint8() << 16) | r.readUint16();
    const odometerEnd = (r.readUint8() << 16) | r.readUint16();
    const firstUse = r.readTimestamp();
    const lastUse = r.readTimestamp();
    const nationByte = r.readUint8();
    const vrn = r.readString(14);

    // Skip empty records
    if (!firstUse && !lastUse && !vrn) continue;

    records.push({
      vehicleRegistrationNumber: vrn,
      vehicleRegistrationNation: NATION_CODES[nationByte] || `0x${nationByte.toString(16)}`,
      firstUse, lastUse,
      odometerBegin, odometerEnd,
    });
  }

  return records;
}

function parseCardEvents(data: Uint8Array): EventRecord[] {
  const events: EventRecord[] = [];
  const r = new BinaryReader(toArrayBuffer(data));

  // CardEventRecord: eventType(1B) + beginTime(4B) + endTime(4B) + VRN(15B) = 24B
  while (r.remaining >= 9) {
    const eventType = r.readUint8();
    const eventBeginTime = r.readTimestamp();
    const eventEndTime = r.readTimestamp();

    // Skip empty records
    if (!eventBeginTime && !eventEndTime) continue;
    if (eventType > 0x0D) continue;

    // Try reading VRN if available
    let cardNumberDriverSlot = '';
    if (r.remaining >= 15) {
      const nationByte = r.readUint8();
      cardNumberDriverSlot = r.readString(14);
    }

    events.push({
      eventType,
      eventTypeName: EVENT_TYPE_NAMES[eventType] || `Nieznany (0x${eventType.toString(16)})`,
      eventBeginTime, eventEndTime,
      cardNumberDriverSlot,
      cardNumberCodriverSlot: '',
    });
  }

  return events;
}

function parseCardFaults(data: Uint8Array): FaultRecord[] {
  const faults: FaultRecord[] = [];
  const r = new BinaryReader(toArrayBuffer(data));

  while (r.remaining >= 9) {
    const faultType = r.readUint8();
    const faultBeginTime = r.readTimestamp();
    const faultEndTime = r.readTimestamp();

    if (!faultBeginTime && !faultEndTime) continue;
    if (faultType > 0x07) continue;

    let cardNumberDriverSlot = '';
    if (r.remaining >= 15) {
      const nationByte = r.readUint8();
      cardNumberDriverSlot = r.readString(14);
    }

    faults.push({
      faultType,
      faultTypeName: FAULT_TYPE_NAMES[faultType] || `Nieznany (0x${faultType.toString(16)})`,
      faultBeginTime, faultEndTime,
      cardNumberDriverSlot,
      cardNumberCodriverSlot: '',
    });
  }

  return faults;
}

function parseCardPlaces(data: Uint8Array): CardPlaceRecord[] {
  const places: CardPlaceRecord[] = [];
  const r = new BinaryReader(toArrayBuffer(data));

  // Skip pointer (2B)
  if (r.remaining >= 2) r.readUint16();

  // CardPlaceDailyWorkPeriod record: entryTime(4B) + country(1B) + region(1B) + odometer(3B) = 9B
  while (r.remaining >= 9) {
    const entryTime = r.readTimestamp();
    const countryByte = r.readUint8();
    const regionByte = r.readUint8();
    const vehicleOdometerValue = (r.readUint8() << 16) | r.readUint16();

    if (!entryTime) continue;

    places.push({
      entryTime,
      dailyWorkPeriodCountry: NATION_CODES[countryByte] || `0x${countryByte.toString(16)}`,
      dailyWorkPeriodRegion: `0x${regionByte.toString(16).padStart(2, '0')}`,
      vehicleOdometerValue,
    });
  }

  return places;
}

function tryPatternScanDriverCard(bytes: Uint8Array, result: DriverCardData, warnings: ParserWarning[]) {
  // Try to find card number: 16-digit string pattern
  for (let i = 0; i < bytes.length - 16; i++) {
    let digitCount = 0;
    for (let j = 0; j < 16; j++) {
      if (bytes[i + j] >= 0x30 && bytes[i + j] <= 0x39) digitCount++;
    }
    if (digitCount >= 12) {
      const cardNumber = readStringAt(bytes, i, 16);
      if (cardNumber.length >= 12) {
        // Check if followed by a nation byte and name-like ASCII
        const afterCard = i + 16;
        if (afterCard + 73 <= bytes.length) {
          const nationByte = bytes[afterCard];
          const surname = readStringAt(bytes, afterCard + 1, 36);
          const firstName = readStringAt(bytes, afterCard + 37, 36);
          if (surname.length >= 2 || firstName.length >= 2) {
            result.identification = {
              cardNumber,
              cardIssuingMemberState: NATION_CODES[nationByte] || `0x${nationByte.toString(16)}`,
              driverName: { surname, firstName },
              cardIssueDate: null,
              cardExpiryDate: null,
              cardValidityBegin: null,
            };
            console.log(`[DDD] Pattern scan: found card ${cardNumber}, driver ${surname} ${firstName}`);
            break;
          }
        }
      }
    }
  }
}

// ─── Raw speed file parser ───────────────────────────────────────────────────

function parseRawSpeedFile(bytes: Uint8Array, warnings: ParserWarning[]): SpeedRecord[] {
  const records: SpeedRecord[] = [];
  const view = new DataView(toArrayBuffer(bytes));

  // Scan for the first valid timestamp that starts a speed block pattern
  // Speed blocks: [4B timestamp][60B speed values], repeating every 64 bytes
  let dataStart = -1;

  for (let i = 0; i <= bytes.length - 128; i++) {
    const ts1 = view.getUint32(i, false);
    if (!isValidTimestamp(ts1)) continue;

    // Check if 64 bytes later there's another valid timestamp exactly 60s apart
    const ts2 = view.getUint32(i + 64, false);
    if (isValidTimestamp(ts2) && Math.abs(ts2 - ts1) === 60) {
      dataStart = i;
      break;
    }
  }

  if (dataStart < 0) {
    warnings.push({ offset: 0, message: 'No valid speed block pattern found' });
    return records;
  }

  console.log(`[DDD] Speed blocks start at offset ${dataStart}`);

  // Parse all speed blocks
  let pos = dataStart;
  let blockCount = 0;
  while (pos + 64 <= bytes.length) {
    const ts = view.getUint32(pos, false);
    if (!isValidTimestamp(ts)) break;

    const baseTime = new Date(ts * 1000);
    for (let s = 0; s < 60; s++) {
      records.push({
        timestamp: new Date(baseTime.getTime() + s * 1000),
        speed: bytes[pos + 4 + s],
      });
    }
    pos += 64;
    blockCount++;
  }

  console.log(`[DDD] Parsed ${blockCount} speed blocks (${records.length} individual records)`);

  if (records.length > 100000) {
    return records.slice(0, 100000);
  }
  return records;
}

// ─── Raw technical file parser ───────────────────────────────────────────────

function parseRawTechnicalFile(bytes: Uint8Array, warnings: ParserWarning[]): TechnicalData {
  const r = new BinaryReader(toArrayBuffer(bytes));
  const calibrations: CalibrationRecord[] = [];

  // Technical file format (Gen2v2):
  // Header bytes, then VuIdentification data
  // Scan for the VU identification by looking for printable ASCII manufacturer name

  let vuManufacturerName = '';
  let vuManufacturerAddress = '';
  let vuSerialNumber = '';
  let sensorSerialNumber = '';

  // Find manufacturer name: look for a long run of printable ASCII
  const identStart = findAsciiString(bytes, 20); // Look for at least 20 printable chars
  if (identStart >= 0) {
    const identReader = new BinaryReader(toArrayBuffer(bytes), identStart);
    vuManufacturerName = identReader.remaining >= 36 ? identReader.readString(36) : '';
    // Skip the country code byte between manufacturer name and address
    if (identReader.remaining > 0) {
      const nextByte = identReader.readUint8();
      // If it's a printable char, it might be part of the address - go back
      if (nextByte >= 0x20 && nextByte < 0x7F) {
        identReader.position -= 1;
      }
    }
    vuManufacturerAddress = identReader.remaining >= 36 ? identReader.readString(36) : '';

    console.log(`[DDD] Tech: Manufacturer="${vuManufacturerName}", Address="${vuManufacturerAddress}"`);

    // After address, look for serial numbers and calibration data
    // Skip forward to find calibration records by looking for known patterns
  }

  // Scan for calibration records: look for workshopName patterns
  // Calibration records contain workshop names (printable ASCII) and timestamps
  const calPositions = findCalibrationRecords(bytes, warnings);
  for (const calPos of calPositions) {
    try {
      const cal = parseCalibrationAt(bytes, calPos);
      if (cal) calibrations.push(cal);
    } catch (e) {
      warnings.push({ offset: calPos, message: `Calibration parse error: ${e}` });
    }
  }

  // Try to find VU and sensor serial numbers in the data
  // They're typically 8-byte strings near the beginning
  const serialSearchStart = identStart >= 0 ? identStart + 72 : 0;
  if (serialSearchStart + 16 <= bytes.length) {
    const sr = new BinaryReader(toArrayBuffer(bytes), serialSearchStart);
    // Look for serial-like strings (alphanumeric, 8 chars)
    for (let off = serialSearchStart; off < Math.min(bytes.length - 8, serialSearchStart + 200); off++) {
      const candidate = readStringAt(bytes, off, 8);
      if (candidate && /^[A-Za-z0-9\-]{4,}$/.test(candidate)) {
        if (!vuSerialNumber) {
          // Check context to determine if this is a VU or sensor serial
        }
      }
    }
  }

  return { vuSerialNumber, sensorSerialNumber, calibrations };
}

function findAsciiString(bytes: Uint8Array, minLen: number): number {
  for (let i = 0; i <= bytes.length - minLen; i++) {
    let count = 0;
    for (let j = 0; j < minLen && i + j < bytes.length; j++) {
      const b = bytes[i + j];
      if (b >= 0x20 && b <= 0x7E) count++;
      else break;
    }
    if (count >= minLen) return i;
  }
  return -1;
}

function readStringAt(bytes: Uint8Array, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && offset + i < bytes.length; i++) {
    const b = bytes[offset + i];
    if (b === 0) break;
    if (b >= 0x20 && b <= 0x7E) s += String.fromCharCode(b);
    else return '';
  }
  return s.trim();
}

function findCalibrationRecords(bytes: Uint8Array, warnings: ParserWarning[]): number[] {
  const positions: number[] = [];

  // Look for calibration workshop names: long ASCII strings followed by timestamps
  // A calibration record has:
  //   purpose (1B) + workshopName (36B) + workshopAddress (36B) + cardNumber (18B) + ...
  // The workshop name is typically a company name in ASCII

  for (let i = 0; i < bytes.length - 100; i++) {
    // Look for calibration purpose byte (0x01-0x05) followed by printable ASCII
    const purposeByte = bytes[i];
    if (purposeByte < 0x01 || purposeByte > 0x05) continue;

    // Check if the next 20+ bytes are printable ASCII (workshop name)
    let asciiCount = 0;
    for (let j = 1; j <= 36 && i + j < bytes.length; j++) {
      const b = bytes[i + j];
      if (b >= 0x20 && b <= 0x7E) asciiCount++;
      else if (b === 0) asciiCount++; // null padding OK
      else break;
    }

    if (asciiCount >= 20) {
      // Verify this looks like a real calibration record
      const workshopName = readStringAt(bytes, i + 1, 36);
      if (workshopName.length >= 3) {
        // Check it's not overlapping with a previous find
        if (positions.length === 0 || i - positions[positions.length - 1] > 50) {
          positions.push(i);
        }
      }
    }
  }

  return positions;
}

function parseCalibrationAt(bytes: Uint8Array, offset: number): CalibrationRecord | null {
  const r = new BinaryReader(toArrayBuffer(bytes), offset);
  if (r.remaining < 100) return null;

  const calibrationPurpose = r.readUint8();
  const workshopName = r.readString(36);
  const workshopAddress = r.remaining >= 36 ? r.readString(36) : '';
  const workshopCardNumber = r.remaining >= 18 ? r.readCardNumber() : '';
  const workshopCardExpiryDate = r.remaining >= 4 ? r.readTimestamp() : null;
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

  return {
    calibrationPurpose,
    calibrationPurposeName: CALIBRATION_PURPOSE_NAMES[calibrationPurpose] || `Nieznany (${calibrationPurpose})`,
    workshopName,
    workshopAddress,
    workshopCardNumber,
    workshopCardExpiryDate,
    vehicleRegistrationNumber: vrn,
    vehicleRegistrationNation: NATION_CODES[vrnNation] || `0x${vrnNation.toString(16)}`,
    wFactor, kFactor, tyreSize, authorisedSpeed,
    oldOdometerValue, newOdometerValue,
    oldDateTime, newDateTime,
  };
}

// ─── Raw events file parser ──────────────────────────────────────────────────

function parseRawEventsFile(bytes: Uint8Array, warnings: ParserWarning[]): { events: EventRecord[]; faults: FaultRecord[] } {
  const events: EventRecord[] = [];
  const faults: FaultRecord[] = [];

  // Events file format: records containing event type + timestamps + card numbers
  // Card numbers are visible as ASCII strings like "17408150613900000" (18 chars)
  // Each event record: eventType(1B) + beginTime(4B) + endTime(4B) + card1(18B) + card2?(18B)

  // Scan for card number patterns to identify event record boundaries
  const cardPositions = findCardNumbers(bytes);

  if (cardPositions.length === 0) {
    // Try the structured approach: header + event records
    return parseEventsStructured(bytes, warnings);
  }

  // Parse events using card number positions as anchors
  // Card number is 9 bytes into the event record (after type(1) + beginTime(4) + endTime(4))
  for (const cardPos of cardPositions) {
    const eventStart = cardPos - 9;
    if (eventStart < 0) continue;

    try {
      const r = new BinaryReader(toArrayBuffer(bytes), eventStart);
      const eventType = r.readUint8();
      const eventBeginTime = r.readTimestamp();
      const eventEndTime = r.readTimestamp();
      const cardNumberDriverSlot = r.readCardNumber();

      // Check for second card number
      let cardNumberCodriverSlot = '';
      if (r.remaining >= 18) {
        const nextBytes = bytes.slice(r.position, r.position + 18);
        // Check if it looks like a card number (has printable chars or all 0xFF)
        const isPrintable = Array.from(nextBytes).some(b => b >= 0x30 && b <= 0x39);
        const isAllFF = Array.from(nextBytes).every(b => b === 0xFF);
        if (isPrintable || isAllFF) {
          cardNumberCodriverSlot = r.readCardNumber();
        }
      }

      // Validate: event type should be in valid range
      if (eventType <= 0x0D) {
        events.push({
          eventType,
          eventTypeName: EVENT_TYPE_NAMES[eventType] || `Nieznany (0x${eventType.toString(16)})`,
          eventBeginTime,
          eventEndTime,
          cardNumberDriverSlot,
          cardNumberCodriverSlot,
        });
      }
    } catch {
      // Skip malformed records
    }
  }

  // Deduplicate events (card number scanning may find overlapping records)
  const seen = new Set<string>();
  const uniqueEvents = events.filter(e => {
    const key = `${e.eventType}-${e.eventBeginTime?.getTime()}-${e.cardNumberDriverSlot}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { events: uniqueEvents, faults };
}

function findCardNumbers(bytes: Uint8Array): number[] {
  const positions: number[] = [];
  // Card numbers are 18 bytes, typically starting with digits
  // Format: countryCode(1B) + type(1B) + ASCII digits(16B)
  // Example: 01 28 31 37 34 30 38 31 35 30 36 31 33 39 30 30 30 30
  //          ^-- starts with digit indicator

  for (let i = 0; i < bytes.length - 18; i++) {
    // Look for the pattern: a byte followed by '(' (0x28) then digits
    if (bytes[i + 1] === 0x28) { // '(' character before card number
      let digitCount = 0;
      for (let j = 2; j < 18 && i + j < bytes.length; j++) {
        if (bytes[i + j] >= 0x30 && bytes[i + j] <= 0x39) digitCount++;
        else break;
      }
      if (digitCount >= 10) {
        positions.push(i);
      }
    }
  }

  return positions;
}

function parseEventsStructured(bytes: Uint8Array, warnings: ParserWarning[]): { events: EventRecord[]; faults: FaultRecord[] } {
  const events: EventRecord[] = [];
  const faults: FaultRecord[] = [];
  const r = new BinaryReader(toArrayBuffer(bytes));

  // Try standard structured format
  // First 2 bytes might be a record type tag
  if (r.remaining < 4) return { events, faults };

  const tag = r.readUint8();
  const subTag = r.readUint8();

  // Read length
  const length = r.readUint16();

  // Skip to event data
  // Try reading event count
  if (r.remaining >= 2) {
    const eventCount = Math.min(r.readUint16(), 100);
    for (let i = 0; i < eventCount && r.remaining >= 27; i++) {
      const eventType = r.readUint8();
      const eventBeginTime = r.readTimestamp();
      const eventEndTime = r.readTimestamp();
      const cardNumberDriverSlot = r.remaining >= 18 ? r.readCardNumber() : '';

      events.push({
        eventType,
        eventTypeName: EVENT_TYPE_NAMES[eventType] || `Nieznany (0x${eventType.toString(16)})`,
        eventBeginTime,
        eventEndTime,
        cardNumberDriverSlot,
        cardNumberCodriverSlot: '',
      });
    }
  }

  return { events, faults };
}

// ─── Raw activities file parser ──────────────────────────────────────────────

function parseRawActivitiesFile(bytes: Uint8Array, warnings: ParserWarning[]): ActivityRecord[] {
  const records: ActivityRecord[] = [];

  // Activities file: contains activity data interspersed with certificates
  // Certificates start with 0x76 0x32, so parse data before and between certificates

  // Find all certificate positions
  const certPositions: number[] = [];
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0x76 && (bytes[i + 1] === 0x32 || bytes[i + 1] === 0x31)) {
      certPositions.push(i);
    }
  }

  // Parse activity data from the beginning until first certificate
  const dataEnd = certPositions.length > 0 ? certPositions[0] : bytes.length;

  if (dataEnd < 8) {
    warnings.push({ offset: 0, message: `Activities data too short: ${dataEnd} bytes before first certificate` });
    return records;
  }

  // Try to parse activity records from the raw data
  const r = new BinaryReader(toArrayBuffer(bytes));

  // Skip initial header (variable length, try to find first valid timestamp)
  let startPos = -1;
  const view = new DataView(toArrayBuffer(bytes));
  for (let i = 0; i < Math.min(dataEnd, 20); i++) {
    if (i + 4 <= bytes.length) {
      const ts = view.getUint32(i, false);
      if (isValidTimestamp(ts)) {
        startPos = i;
        break;
      }
    }
  }

  if (startPos < 0) {
    // Try a different approach: look for activity change records pattern
    // Header might be: tag(1) + subtag(1) + length(2) + data
    // Skip first few bytes that look like a header
    if (bytes.length > 10) {
      const potentialLength = (bytes[2] << 8) | bytes[3];
      if (potentialLength > 0 && potentialLength < bytes.length) {
        startPos = 4;
      }
    }
  }

  if (startPos >= 0 && startPos < dataEnd) {
    r.position = startPos;
    // Try to parse activity days
    while (r.position < dataEnd && r.remaining >= 8) {
      try {
        const ts = r.readTimestamp();
        if (!ts) {
          // Try next position
          r.position -= 3; // Backtrack and try 1 byte forward
          continue;
        }

        // Validate timestamp is a reasonable date (not in the future)
        if (ts.getTime() > Date.now() + 86400000) {
          r.position -= 3;
          continue;
        }

        if (r.remaining < 4) break;
        const dailyPresenceCounter = r.readUint16();
        const dayDistance = r.readUint16();

        const entries: ActivityChangeEntry[] = [];

        if (r.remaining >= 2 && r.position < dataEnd) {
          const activityChangeCount = r.readUint16();

          if (activityChangeCount > 0 && activityChangeCount <= 1440) {
            for (let i = 0; i < activityChangeCount && r.remaining >= 2 && r.position < dataEnd; i++) {
              const word = r.readUint16();
              const slot = (word >> 15) & 0x01;
              const cardInserted = ((word >> 14) & 0x01) === 1;
              const activity = (word >> 12) & 0x03;
              const minutes = word & 0x0FFF;

              const statusMap: Record<number, ActivityChangeEntry['status']> = {
                0: 'break', 1: 'availability', 2: 'work', 3: 'driving',
              };

              // Peek next entry for timeTo
              let nextMinutes = 1440;
              if (i + 1 < activityChangeCount && r.remaining >= 2 && r.position < dataEnd) {
                const nextWord = (bytes[r.position] << 8) | bytes[r.position + 1];
                nextMinutes = nextWord & 0x0FFF;
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
          }
        }

        records.push({ date: ts, dailyPresenceCounter, dayDistance, entries });
      } catch {
        break;
      }
    }
  }

  if (records.length === 0) {
    warnings.push({ offset: 0, message: 'Could not extract activity records from raw file' });
  }

  return records;
}

// ─── Raw overview file parser ────────────────────────────────────────────────

function parseRawOverviewFile(bytes: Uint8Array, warnings: ParserWarning[]): DddOverview | null {
  // Overview file is mostly certificates for Gen2v2
  // Try to extract any recognizable overview data

  // Look for VRN (vehicle registration number) - typically a short ASCII string
  // Look for manufacturer name, serial numbers, etc.

  const overview: DddOverview = {
    vuManufacturerName: '',
    vuManufacturerAddress: '',
    vuSerialNumber: '',
    vuPartNumber: '',
    vuSoftwareVersion: '',
    vuManufacturingDate: null,
    vuApprovalNumber: '',
    vehicleRegistrationNation: '',
    vehicleRegistrationNumber: '',
    currentDateTime: null,
    vuDownloadablePeriodBegin: null,
    vuDownloadablePeriodEnd: null,
    cardSlotsStatus: 0,
    vuDownloadActivityDataLength: 0,
  };

  let foundAny = false;

  // Scan for timestamps that could be download dates
  const view = new DataView(toArrayBuffer(bytes));
  for (let i = 0; i < bytes.length - 4; i++) {
    const ts = view.getUint32(i, false);
    if (isValidTimestamp(ts)) {
      const date = new Date(ts * 1000);
      if (!overview.currentDateTime) {
        overview.currentDateTime = date;
        foundAny = true;
      }
    }
  }

  // Scan for ASCII strings that could be VRN, serial numbers etc.
  const asciiStrings: Array<{ offset: number; value: string }> = [];
  let currentStr = '';
  let strStart = -1;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0x20 && b <= 0x7E) {
      if (currentStr === '') strStart = i;
      currentStr += String.fromCharCode(b);
    } else {
      if (currentStr.length >= 4) {
        asciiStrings.push({ offset: strStart, value: currentStr.trim() });
      }
      currentStr = '';
    }
  }
  if (currentStr.length >= 4) {
    asciiStrings.push({ offset: strStart, value: currentStr.trim() });
  }

  // Try to identify strings
  for (const s of asciiStrings) {
    if (!overview.vuManufacturerName && s.value.length >= 10 && /[A-Z]/.test(s.value)) {
      // Could be manufacturer name but skip common cert-related strings
      if (!s.value.includes('OID') && !s.value.includes('0x')) {
        // Only set if nothing else was set
      }
    }
  }

  if (!foundAny && asciiStrings.length === 0) {
    warnings.push({ offset: 0, message: 'Overview file contains only certificate data, no extractable VU information' });
    return null;
  }

  return foundAny ? overview : null;
}

// ─── TLV section extraction (for merged VU files) ────────────────────────────

function extractSections(buffer: ArrayBuffer, warnings: ParserWarning[]): DddSection[] {
  const sections: DddSection[] = [];
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const MAX_SECTION_SIZE = 500_000;

  let pos = 0;
  while (pos < bytes.length - 3) {
    if (bytes[pos] === 0x76) {
      const tagLow = bytes[pos + 1];
      const isValidTag = (tagLow >= 0x01 && tagLow <= 0x09) ||
                         (tagLow >= 0x21 && tagLow <= 0x29) ||
                         (tagLow >= 0x31 && tagLow <= 0x39);
      if (isValidTag) {
        const length = view.getUint16(pos + 2, false);
        if (length > 0 && length <= MAX_SECTION_SIZE && pos + 4 + length <= bytes.length) {
          const data = bytes.slice(pos + 4, pos + 4 + length);
          sections.push({
            tag: tagLow,
            tagHigh: 0x76,
            offset: pos,
            length,
            data,
          });
          console.log(`[DDD] Section 0x76 0x${tagLow.toString(16).padStart(2, '0')} at offset ${pos}, length ${length}`);
          pos += 4 + length;
          continue;
        } else {
          warnings.push({ offset: pos, message: `Invalid length ${length} for tag 0x76${tagLow.toString(16).padStart(2, '0')}` });
        }
      }
    }
    pos += 1;
  }

  console.log(`[DDD] Total sections found: ${sections.length}, file size: ${bytes.length}`);
  return sections;
}

// ─── Legacy section parsers (for TLV-wrapped data) ───────────────────────────

function parseOverview(data: Uint8Array): DddOverview {
  const r = new BinaryReader(toArrayBuffer(data));
  const cardSlotsStatus = r.readUint8();
  const downloadDate = r.readTimestamp();
  const downloadPeriodBegin = r.readTimestamp();
  const downloadPeriodEnd = r.readTimestamp();
  const vehicleNationByte = r.remaining > 0 ? r.readUint8() : 0;
  const vehicleNation = NATION_CODES[vehicleNationByte] || `0x${vehicleNationByte.toString(16)}`;
  const vrn = r.remaining >= 14 ? r.readString(14) : '';
  const vuManufacturerName = r.remaining >= 36 ? r.readString(36) : '';
  const vuManufacturerAddress = r.remaining >= 36 ? r.readString(36) : '';
  const vuSerialNumber = r.remaining >= 8 ? r.readString(8) : '';
  const vuPartNumber = r.remaining >= 16 ? r.readString(16) : '';
  const vuSoftwareVersion = r.remaining >= 4 ? r.readString(4) : '';
  const vuManufacturingDate = r.remaining >= 4 ? r.readTimestamp() : null;
  const vuApprovalNumber = r.remaining >= 16 ? r.readString(16) : '';
  const vuDownloadActivityDataLength = r.remaining >= 4 ? r.readUint32() : 0;

  return {
    vuManufacturerName, vuManufacturerAddress, vuSerialNumber, vuPartNumber,
    vuSoftwareVersion, vuManufacturingDate, vuApprovalNumber,
    vehicleRegistrationNation: vehicleNation, vehicleRegistrationNumber: vrn,
    currentDateTime: downloadDate,
    vuDownloadablePeriodBegin: downloadPeriodBegin,
    vuDownloadablePeriodEnd: downloadPeriodEnd,
    cardSlotsStatus, vuDownloadActivityDataLength,
  };
}

function parseActivities(data: Uint8Array): ActivityRecord[] {
  const records: ActivityRecord[] = [];
  const r = new BinaryReader(toArrayBuffer(data));
  if (r.remaining < 8) return records;
  r.skip(8);

  while (r.remaining >= 12) {
    try {
      const date = r.readTimestamp();
      if (!date) { r.skip(8); continue; }
      const dailyPresenceCounter = r.readUint16();
      const dayDistance = r.readUint16();
      const activityChangeCount = r.remaining >= 2 ? r.readUint16() : 0;
      const entries: ActivityChangeEntry[] = [];

      for (let i = 0; i < activityChangeCount && r.remaining >= 2; i++) {
        const word = r.readUint16();
        const slot = (word >> 15) & 0x01;
        const cardInserted = ((word >> 14) & 0x01) === 1;
        const activity = (word >> 12) & 0x03;
        const minutes = word & 0x0FFF;
        const statusMap: Record<number, ActivityChangeEntry['status']> = {
          0: 'break', 1: 'availability', 2: 'work', 3: 'driving',
        };

        let nextMinutes = 1440;
        if (i + 1 < activityChangeCount && r.remaining >= 2) {
          const peek = (r.readUint16());
          nextMinutes = peek & 0x0FFF;
          r.position -= 2;
        }

        const hFrom = Math.floor(minutes / 60);
        const mFrom = minutes % 60;
        const hTo = Math.floor(Math.min(nextMinutes, 1440) / 60);
        const mTo = Math.min(nextMinutes, 1440) % 60;

        entries.push({
          slot: slot === 0 ? 'driver' : 'codriver',
          status: statusMap[activity] || 'unknown',
          cardInserted, minutes,
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

  if (r.remaining >= 2) {
    const eventCount = r.readUint16();
    for (let i = 0; i < eventCount && r.remaining >= 24; i++) {
      const eventType = r.readUint8();
      const eventBeginTime = r.readTimestamp();
      const eventEndTime = r.readTimestamp();
      const cardNumberDriverSlot = r.readCardNumber();
      const cardNumberCodriverSlot = r.remaining >= 18 ? r.readCardNumber() : '';

      events.push({
        eventType,
        eventTypeName: EVENT_TYPE_NAMES[eventType] || `Nieznany (0x${eventType.toString(16)})`,
        eventBeginTime, eventEndTime,
        cardNumberDriverSlot, cardNumberCodriverSlot,
      });
    }
  }

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
        faultBeginTime, faultEndTime,
        cardNumberDriverSlot, cardNumberCodriverSlot,
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
        workshopName, workshopAddress, workshopCardNumber, workshopCardExpiryDate,
        vehicleRegistrationNumber: vrn,
        vehicleRegistrationNation: NATION_CODES[vrnNation] || `0x${vrnNation.toString(16)}`,
        wFactor, kFactor, tyreSize, authorisedSpeed,
        oldOdometerValue, newOdometerValue, oldDateTime, newDateTime,
      });
    }
  }

  return { vuSerialNumber, sensorSerialNumber, calibrations };
}

function parseDetailedSpeed(data: Uint8Array): SpeedRecord[] {
  const records: SpeedRecord[] = [];
  const r = new BinaryReader(toArrayBuffer(data));

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

  if (records.length > 50000) {
    return records.slice(0, 50000);
  }
  return records;
}
