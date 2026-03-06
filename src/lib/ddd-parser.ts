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
  vehicleIdentificationNumber: string;
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

export interface VuIdentification {
  vuManufacturerName: string;
  vuManufacturerAddress: string;
  vuSerialNumber: string;
  vuPartNumber: string;
  vuSoftwareVersion: string;
  vuManufacturingDate: Date | null;
  vuApprovalNumber: string;
}

export interface SealRecord {
  sealIdentifier: string;
  equipmentType: number;
  equipmentTypeName: string;
}

export interface SensorPairedRecord {
  sensorSerialNumber: string;
  sensorApprovalNumber: string;
  sensorPairingDate: Date | null;
}

export interface GnssAccumulatedRecord {
  timestamp: Date | null;
  latitude: number;
  longitude: number;
  vehicleOdometerValue: number;
}

export interface CompanyLockRecord {
  lockInTime: Date | null;
  lockOutTime: Date | null;
  companyName: string;
  companyAddress: string;
  companyCardNumber: string;
}

export interface DownloadActivityRecord {
  downloadTimestamp: Date | null;
  companyOrWorkshopName: string;
  cardNumber: string;
}

export interface ControlActivityRecord {
  controlType: number;
  controlTypeName: string;
  controlTimestamp: Date | null;
  controlCardNumber: string;
  downloadPeriodBegin: Date | null;
  downloadPeriodEnd: Date | null;
}

export interface TechnicalData {
  vuSerialNumber: string;
  sensorSerialNumber: string;
  calibrations: CalibrationRecord[];
  vuIdentification: VuIdentification | null;
  seals: SealRecord[];
  sensorsPaired: SensorPairedRecord[];
  gnssRecords: GnssAccumulatedRecord[];
  companyLocks: CompanyLockRecord[];
  downloadActivities: DownloadActivityRecord[];
  controlActivities: ControlActivityRecord[];
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

export interface RawFileBuffer {
  fileName: string;
  fileType: string;
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
  warnings: ParserWarning[];
  fileSize: number;
  bytesParsed: number;
  generation: 'gen1' | 'gen2' | 'unknown';
  driverCard: DriverCardData | null;
  rawFileBuffers: RawFileBuffer[];
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
  const overview = incoming.overview ?? existing.overview;
  const technicalData = incoming.technicalData ?? existing.technicalData;

  // Cross-populate VIN/VRN from calibration records when overview is missing them
  if (overview && !overview.vehicleRegistrationNumber && technicalData) {
    const calWithVrn = technicalData.calibrations.find(c => c.vehicleRegistrationNumber.length > 0);
    if (calWithVrn) {
      overview.vehicleRegistrationNumber = calWithVrn.vehicleRegistrationNumber;
      overview.vehicleRegistrationNation = calWithVrn.vehicleRegistrationNation;
      console.log(`[DDD] Cross-populated VRN from calibration: "${calWithVrn.vehicleRegistrationNumber}"`);
    }
  }

  return {
    overview,
    activities: deduplicateActivities([...existing.activities, ...incoming.activities]),
    events: [...existing.events, ...incoming.events],
    faults: [...existing.faults, ...incoming.faults],
    technicalData,
    speedRecords: [...existing.speedRecords, ...incoming.speedRecords].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    ),
    rawSections: [...existing.rawSections, ...incoming.rawSections],
    warnings: [...existing.warnings, ...incoming.warnings],
    fileSize: existing.fileSize + incoming.fileSize,
    bytesParsed: existing.bytesParsed + incoming.bytesParsed,
    generation: incoming.generation !== 'unknown' ? incoming.generation : existing.generation,
    driverCard: incoming.driverCard ?? existing.driverCard,
    rawFileBuffers: [...existing.rawFileBuffers, ...incoming.rawFileBuffers],
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
    driverCard: null, rawFileBuffers: [],
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
  // General events (0x00-0x0F) — Annex 1C
  0x00: 'Brak dalszych szczegółów',
  0x01: 'Włożenie karty podczas jazdy',
  0x02: 'Konflikt kart',
  0x03: 'Nakładanie się czasu',
  0x04: 'Jazda bez odpowiedniej karty',
  0x05: 'Włożenie karty podczas jazdy',
  0x06: 'Ostatnia sesja niepoprawnie zamknięta',
  0x07: 'Przekroczenie prędkości',
  0x08: 'Przerwa w zasilaniu',
  0x09: 'Błąd danych ruchu',
  0x0A: 'Konflikt ruchu pojazdu',
  0x0B: 'Konflikt czasu',
  0x0C: 'Błąd komunikacji z czytnikiem',
  0x0D: 'Brak komunikacji z czytnikiem',
  // Sensor events (0x10-0x1F)
  0x10: 'Zdarzenie czujnika',
  0x11: 'Błąd uwierzytelniania czujnika',
  0x12: 'Parowanie czujnika niemożliwe',
  0x13: 'Błąd integralności czujnika',
  0x14: 'Błąd danych czujnika',
  0x15: 'Wewnętrzna usterka czujnika',
  // Recording equipment events (0x20-0x2F)
  0x20: 'Zdarzenie urządzenia',
  0x21: 'Wewnętrzna usterka VU',
  0x22: 'Usterka drukarki',
  0x23: 'Usterka wyświetlacza',
  0x24: 'Usterka pobierania danych',
  0x25: 'Usterka czujnika',
  0x26: 'Zdarzenie GNSS',
  0x27: 'Zdarzenie ITS',
  0x28: 'Zdarzenie DSRC',
  // Card events (0x30-0x3F)
  0x30: 'Zdarzenie karty',
  0x31: 'Błąd uwierzytelniania karty',
  0x32: 'Błąd integralności karty',
  0x33: 'Błąd transferu danych karty',
  0x34: 'Karta nieuwierzytelniona',
  0x35: 'Karta wykryta',
  0x36: 'Sesja karty otwarta z ważną kartą',
  0x37: 'Sesja karty zamknięta',
  0x38: 'Karta wyjęta podczas sesji',
  0x39: 'Nieudana próba uwierzytelnienia karty',
  0x3A: 'Zdarzenie karty GNSS',
  0x3B: 'Zdarzenie karty ITS',
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
  0x10: 'Usterka czujnika',
  0x11: 'Błąd uwierzytelniania czujnika',
  0x20: 'Usterka urządzenia',
  0x21: 'Wewnętrzna usterka VU',
  0x30: 'Usterka karty',
};

const CALIBRATION_PURPOSE_NAMES: Record<number, string> = {
  0x00: 'Rezerwa',
  0x01: 'Aktywacja',
  0x02: 'Pierwsza kalibracja',
  0x03: 'Regularna kalibracja',
  0x04: 'Naprawa',
  0x05: 'Zainstalowanie nowego czujnika',
  // Gen2v2 extended purposes (Annex 1C, Appendix 7)
  0x80: 'Aktywacja (Gen2v2)',
  0x81: 'Pierwsza kalibracja (Gen2v2)',
  0x82: 'Regularna kalibracja (Gen2v2)',
  0x83: 'Naprawa (Gen2v2)',
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
      // Only include printable ASCII (0x20-0x7E)
      if (b >= 0x20 && b <= 0x7E) {
        s += String.fromCharCode(b);
      }
    }
    // Trim whitespace and trailing binary garbage (keep letters, digits, dots, hyphens, spaces, parens)
    return s.trim().replace(/[^a-zA-Z0-9.\- ()]+$/, '').trim();
  }

  /**
   * ExtendedSerialNumber (8 bytes):
   *   serialNumber: 4B uint32
   *   monthYear: 2B (month in high byte BCD, year = 2000 + low byte, or raw uint16)
   *   type: 1B
   *   manufacturerCode: 1B
   * Returns formatted string like "1381755 (05/2023)"
   */
  readExtendedSerialNumber(): string {
    const serialNumber = this.readUint32();
    const monthYear = this.readUint16();
    const type = this.readUint8();
    const manufacturerCode = this.readUint8();

    if (serialNumber === 0 && monthYear === 0) return '';

    const month = (monthYear >> 8) & 0xFF;
    const year = 2000 + (monthYear & 0xFF);

    let result = serialNumber.toString();
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2099) {
      result += ` (${month.toString().padStart(2, '0')}/${year})`;
    }
    return result;
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

  /**
   * Read a FullCardNumber (18B) and return only the 16-byte card number portion.
   * Structure: cardType(1B) + issuingMemberState(1B) + cardNumber(16B)
   */
  readFullCardNumber(): string {
    if (this.remaining < 18) return '';
    const cardType = this.readUint8();
    const nation = this.readUint8();
    const cardNumber = this.readString(16);
    return cardNumber;
  }

  /**
   * Read FullCardNumberAndGeneration (20B for Gen2v2).
   * Structure: cardType(1B) + nation(1B) + cardNumber(16B) + generation(2B)
   */
  readFullCardNumberAndGen(): string {
    if (this.remaining < 20) return '';
    const cardNumber = this.readFullCardNumber();
    this.skip(2); // skip generation bytes
    return cardNumber;
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
  const fileType = detectFileType(fileName);
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
    rawFileBuffers: [{
      fileName: fileName || 'unknown',
      fileType: fileType || 'unknown',
      data: new Uint8Array(buffer),
    }],
  };

  // Check if this is an individual file (detected by filename)
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

  // Extract TLV sections first — individual TRTP files may contain TLV-wrapped data
  const sections = extractSections(buffer, result.warnings);
  result.rawSections = sections;

  // For overview, events, and activities, try using TLV sections first
  if (fileType === 'overview' && sections.length > 0) {
    const overviewSection = sections.find(s => s.tag === 0x35 || s.tag === 0x25 || s.tag === 0x05);
    if (overviewSection) {
      try {
        const isGen2v2 = overviewSection.tag === 0x35;
        const isGen2 = overviewSection.tag === 0x25;
        if (isGen2v2 || isGen2) {
          result.overview = parseOverviewDirect(overviewSection.data);
        } else {
          result.overview = parseOverview(overviewSection.data);
        }
        result.bytesParsed = buffer.byteLength;
        console.log(`[DDD] Overview from TLV section 0x${overviewSection.tag.toString(16)}: VRN="${result.overview?.vehicleRegistrationNumber}"`);
        return result;
      } catch (e) {
        console.warn('[DDD] TLV overview parse failed, falling back to raw:', e);
      }
    }
  }

  // For activities, use TLV sections if available (Gen2/Gen2v2), otherwise fall back to raw scanner
  try {
    switch (fileType) {
      case 'speed':
        result.speedRecords = parseRawSpeedFile(bytes, result.warnings);
        result.bytesParsed = buffer.byteLength;
        break;
      case 'technical':
        result.technicalData = parseRawTechnicalFile(bytes, result.warnings);
        result.bytesParsed = buffer.byteLength;
        break;
      case 'events': {
        const ef = parseRawEventsFile(bytes, result.warnings);
        result.events = ef.events;
        result.faults = ef.faults;
        result.bytesParsed = buffer.byteLength;
        break;
      }
      case 'activities': {
        // Try TLV-section-based parsing first (Gen2/Gen2v2)
        const actSections = sections.filter(s => s.tag === 0x32 || s.tag === 0x22 || s.tag === 0x02);
        if (actSections.length > 0) {
          result.activities = parseActivitiesFromSections(actSections, result.warnings);
          console.log(`[DDD] Activities from ${actSections.length} TLV sections: ${result.activities.length} days`);
        }
        // Fall back to raw scanner if TLV parsing yielded nothing
        if (result.activities.length === 0) {
          result.activities = parseRawActivitiesFile(bytes, result.warnings);
        }
        result.bytesParsed = buffer.byteLength;
        break;
      }
      case 'overview':
        result.overview = parseRawOverviewFile(bytes, result.warnings);
        result.bytesParsed = buffer.byteLength;
        break;
      case 'driver_card':
        result.driverCard = parseDriverCardFile(bytes, result.warnings);
        result.bytesParsed = buffer.byteLength;
        break;
    }
  } catch (e) {
    console.warn(`[DDD] Error parsing individual ${fileType} file:`, e);
    result.warnings.push({ offset: 0, message: `Parse error: ${e instanceof Error ? e.message : String(e)}` });
  }

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

  // Driver card files use 3-byte tags + 2-byte length TLV structure
  // Per Annex 1C Appendix 2 §4.1-4.2:
  // Tag: 2 bytes EF FID + 1 byte (00=Gen1 data, 01=Gen1 sig, 02=Gen2 data, 03=Gen2 sig)
  // Length: 2 bytes big-endian
  const view = new DataView(toArrayBuffer(bytes));
  let pos = 0;

  while (pos < bytes.length - 5) {
    if (pos + 5 > bytes.length) break;

    const tagHigh = view.getUint16(pos, false);  // 2-byte EF FID
    const tagType = bytes[pos + 2];              // 00=data1, 01=sig1, 02=data2, 03=sig2
    const len = view.getUint16(pos + 3, false);  // 2-byte length

    if (len === 0 || pos + 5 + len > bytes.length) {
      pos++;
      continue;
    }

    // Only process data tags (00=Gen1, 02=Gen2), skip signatures (01, 03)
    const isData = tagType === 0x00 || tagType === 0x02;
    if (!isData) {
      pos += 5 + len;
      continue;
    }

    // Validate tag is in expected range for driver cards
    const tagHighByte = (tagHigh >> 8) & 0xFF;
    if (tagHighByte > 0x0C && tagHigh !== 0xC100 && tagHigh !== 0xC108 && tagHigh !== 0xC109) {
      pos++;
      continue;
    }

    const sectionData = bytes.slice(pos + 5, pos + 5 + len);

    try {
      switch (tagHigh) {
        case 0x0520: // CardIdentificationAndDriverCardHolderIdentification
          result.identification = parseCardIdentification(sectionData);
          console.log(`[DDD] Driver card identification: ${result.identification?.cardNumber}`);
          break;

        case 0x0504: // CardDriverActivity
          result.activities = parseCardActivities(sectionData, warnings);
          console.log(`[DDD] Driver card activities: ${result.activities.length} days`);
          break;

        case 0x0505: // CardVehiclesUsed
          result.vehiclesUsed = parseVehiclesUsed(sectionData);
          console.log(`[DDD] Driver card vehicles: ${result.vehiclesUsed.length}`);
          break;

        case 0x0502: // CardEventData
          result.events = parseCardEvents(sectionData);
          console.log(`[DDD] Driver card events: ${result.events.length}`);
          break;

        case 0x0503: // CardFaultData
          result.faults = parseCardFaults(sectionData);
          console.log(`[DDD] Driver card faults: ${result.faults.length}`);
          break;

        case 0x0506: // CardPlaceDailyWorkPeriod (Gen1) 
        case 0x0526: // CardPlaceAuthDailyWorkPeriod (Gen2v2)
          result.places = parseCardPlaces(sectionData);
          console.log(`[DDD] Driver card places: ${result.places.length}`);
          break;
      }
    } catch (e) {
      warnings.push({ offset: pos, message: `Driver card tag 0x${tagHigh.toString(16)} type ${tagType}: ${e}` });
    }

    pos += 5 + len;
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
    if (eventType > 0x3F) continue;

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
  const calibrations: CalibrationRecord[] = [];
  const seals: SealRecord[] = [];
  const sensorsPaired: SensorPairedRecord[] = [];
  const gnssRecords: GnssAccumulatedRecord[] = [];
  const companyLocks: CompanyLockRecord[] = [];
  const downloadActivities: DownloadActivityRecord[] = [];
  const controlActivities: ControlActivityRecord[] = [];
  const view = new DataView(toArrayBuffer(bytes));

  let vuIdentification: VuIdentification | null = null;
  let vuSerialNumber = '';
  let sensorSerialNumber = '';

  let pos = 0;
  let parsedArrays = 0;

  const SEAL_EQUIPMENT_TYPES: Record<number, string> = {
    0: 'Przednia strona VU', 1: 'Tylna strona VU', 2: 'Adapter',
    3: 'Kabel czujnika ruchu', 4: 'Czujnik ruchu', 5: 'Przekładnia',
  };

  while (pos + 5 <= bytes.length) {
    const arrayType = bytes[pos];
    const recordSize = view.getUint16(pos + 1, false);
    const noOfRecords = view.getUint16(pos + 3, false);
    const totalArraySize = 5 + recordSize * noOfRecords;

    if (recordSize >= 2 && recordSize <= 2000 &&
        noOfRecords <= 500 &&
        totalArraySize >= 5 &&
        pos + totalArraySize <= bytes.length) {

      console.log(`[DDD] Tech RecordArray @${pos}: type=0x${arrayType.toString(16)}, recSize=${recordSize}, count=${noOfRecords}`);

      const dataStart = pos + 5;

      switch (arrayType) {
        // 0x19 — VuIdentification
        case 0x19: {
          if (noOfRecords >= 1 && recordSize >= 36) {
            const r = new BinaryReader(toArrayBuffer(bytes), dataStart);
            const mfgName = r.remaining >= 36 ? r.readString(36) : '';
            const mfgAddr = r.remaining >= 36 ? r.readString(36) : '';
            // Continental VU: serialNumber(8B) then partNumber(16B)
            const serial = r.remaining >= 8 ? r.readExtendedSerialNumber() : '';
            const partNum = r.remaining >= 16 ? r.readString(16) : '';
            const swVer = r.remaining >= 4 ? r.readString(4) : '';
            const mfgDate = r.remaining >= 4 ? r.readTimestamp() : null;
            const approvalNum = r.remaining >= 16 ? r.readString(16) : '';
            vuIdentification = {
              vuManufacturerName: mfgName, vuManufacturerAddress: mfgAddr,
              vuSerialNumber: serial, vuPartNumber: partNum,
              vuSoftwareVersion: swVer, vuManufacturingDate: mfgDate,
              vuApprovalNumber: approvalNum,
            };
            if (serial) vuSerialNumber = serial;
            console.log(`[DDD] VuIdent: "${mfgName}", serial="${serial}", part="${partNum}", sw="${swVer}", approval="${approvalNum}"`);
          }
          break;
        }

        // 0x0c — VuCalibrationRecordArray (Gen2v2), 0x08 in some contexts
        case 0x0c:
        case 0x08: {
          if (recordSize >= 100 && noOfRecords > 0) {
            for (let i = 0; i < noOfRecords; i++) {
              const recStart = dataStart + i * recordSize;
              try {
                const cal = parseCalibrationAt(bytes, recStart, recordSize);
                if (cal) calibrations.push(cal);
              } catch (e) {
                warnings.push({ offset: recStart, message: `Calibration parse error: ${e}` });
              }
            }
          }
          break;
        }

        // 0x0e — SealRecordArray
        case 0x0e: {
          for (let i = 0; i < noOfRecords; i++) {
            const recStart = dataStart + i * recordSize;
            const r = new BinaryReader(toArrayBuffer(bytes), recStart);
            const equipmentType = r.remaining > 0 ? r.readUint8() : 0;
            const sealBytes = recordSize > 1 ? bytes.slice(recStart + 1, recStart + recordSize) : new Uint8Array(0);
            
            // SealDataV2 is binary — always format as hex pairs for readability
            const nonZeroBytes = Array.from(sealBytes).filter(b => b !== 0);
            const sealId = nonZeroBytes.length > 0
              ? nonZeroBytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
              : '';
            
            if (sealId || equipmentType > 0) {
              seals.push({
                sealIdentifier: sealId,
                equipmentType,
                equipmentTypeName: SEAL_EQUIPMENT_TYPES[equipmentType] || `Typ ${equipmentType}`,
              });
            }
          }
          break;
        }

        // 0x20 — SensorPairedRecord
        case 0x20: {
          for (let i = 0; i < noOfRecords; i++) {
            const recStart = dataStart + i * recordSize;
            const r = new BinaryReader(toArrayBuffer(bytes), recStart);
            const serial = r.remaining >= 8 ? r.readExtendedSerialNumber() : '';
            const approval = r.remaining >= 16 ? r.readString(16) : '';
            const pairingDate = r.remaining >= 4 ? r.readTimestamp() : null;
            if (serial) {
              sensorsPaired.push({ sensorSerialNumber: serial, sensorApprovalNumber: approval, sensorPairingDate: pairingDate });
              if (!sensorSerialNumber) sensorSerialNumber = serial;
            }
          }
          break;
        }

        // 0x1f — GNSSAccumulatedDriving
        case 0x1f: {
          for (let i = 0; i < noOfRecords; i++) {
            const recStart = dataStart + i * recordSize;
            const r = new BinaryReader(toArrayBuffer(bytes), recStart);
            const ts = r.remaining >= 4 ? r.readTimestamp() : null;
            // Skip if timestamp is invalid (epoch noise)
            if (!ts || ts.getFullYear() < 2000) { continue; }
            // GNSSPlainCoordinates: latitude(4B, signed) + longitude(4B, signed)
            // Values in 1/10 of arc-second (Annex 1C Appendix 7)
            if (r.remaining >= 8) {
              const latRaw = view.getInt32(r.position, false);
              r.skip(4);
              const lonRaw = view.getInt32(r.position, false);
              r.skip(4);
              // 1/10 arc-second → degrees: divide by 36000
              const latitude = latRaw / 36000;
              const longitude = lonRaw / 36000;
              const odo = r.remaining >= 3 ? ((r.readUint8() << 16) | r.readUint16()) : 0;
              // Validate: reasonable GPS coordinates
              if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0)) {
                gnssRecords.push({ timestamp: ts, latitude, longitude, vehicleOdometerValue: odo });
              }
            }
          }
          break;
        }

        // 0x17 — VuCompanyLocksRecord
        case 0x17: {
          if (recordSize >= 98) {
            for (let i = 0; i < noOfRecords; i++) {
              const recStart = dataStart + i * recordSize;
              const r = new BinaryReader(toArrayBuffer(bytes), recStart);
              const lockInTime = r.remaining >= 4 ? r.readTimestamp() : null;
              const lockOutTime = r.remaining >= 4 ? r.readTimestamp() : null;
              const companyName = r.remaining >= 36 ? r.readString(36) : '';
              const companyAddress = r.remaining >= 36 ? r.readString(36) : '';
              const companyCardNumber = r.remaining >= 16 ? r.readString(16) : '';
              if (lockInTime || companyName) {
                companyLocks.push({ lockInTime, lockOutTime, companyName, companyAddress, companyCardNumber });
              }
            }
          }
          break;
        }

        // 0x15 — VuDownloadActivityRecord
        case 0x15: {
          for (let i = 0; i < noOfRecords; i++) {
            const recStart = dataStart + i * recordSize;
            const r = new BinaryReader(toArrayBuffer(bytes), recStart);
            const downloadTimestamp = r.remaining >= 4 ? r.readTimestamp() : null;
            const companyOrWorkshopName = r.remaining >= 36 ? r.readString(36) : '';
            const cardNumber = r.remaining >= 16 ? r.readString(16) : '';
            if (downloadTimestamp || companyOrWorkshopName) {
              downloadActivities.push({ downloadTimestamp, companyOrWorkshopName, cardNumber });
            }
          }
          break;
        }

        // 0x16 — VuControlActivityRecord
        case 0x16: {
          const CONTROL_TYPE_NAMES: Record<number, string> = {
            0x00: 'Nieokreślony',
            0x01: 'Kontrola drogowa',
            0x02: 'Kontrola w siedzibie firmy',
          };
          for (let i = 0; i < noOfRecords; i++) {
            const recStart = dataStart + i * recordSize;
            const r = new BinaryReader(toArrayBuffer(bytes), recStart);
            const controlType = r.remaining >= 1 ? r.readUint8() : 0;
            const controlTimestamp = r.remaining >= 4 ? r.readTimestamp() : null;
            const controlCardNumber = r.remaining >= 16 ? r.readString(16) : '';
            const downloadPeriodBegin = r.remaining >= 4 ? r.readTimestamp() : null;
            const downloadPeriodEnd = r.remaining >= 4 ? r.readTimestamp() : null;
            if (controlTimestamp) {
              controlActivities.push({
                controlType,
                controlTypeName: CONTROL_TYPE_NAMES[controlType] || `Typ ${controlType}`,
                controlTimestamp, controlCardNumber, downloadPeriodBegin, downloadPeriodEnd,
              });
            }
          }
          break;
        }

        default:
          break;
      }

      pos += totalArraySize;
      parsedArrays++;
      continue;
    }

    pos++;
  }

  if (parsedArrays > 0) {
    console.log(`[DDD] Tech: ${parsedArrays} arrays, ${calibrations.length} cal, ${seals.length} seals, ${sensorsPaired.length} sensors, ${gnssRecords.length} GNSS, ${downloadActivities.length} downloads, ${controlActivities.length} controls`);
  } else {
    warnings.push({ offset: 0, message: 'No RecordArray headers found, using heuristic fallback' });
    for (let i = 0; i < bytes.length - 100; i++) {
      const purposeByte = bytes[i];
      if (purposeByte < 0x01 || purposeByte > 0x05) continue;
      let asciiCount = 0;
      for (let j = 1; j <= 36 && i + j < bytes.length; j++) {
        const b = bytes[i + j];
        if (b >= 0x20 && b <= 0x7E) asciiCount++;
        else if (b === 0) asciiCount++;
        else break;
      }
      if (asciiCount >= 20) {
        const workshopName = readStringAt(bytes, i + 1, 36);
        if (workshopName.length >= 3) {
          try {
            const cal = parseCalibrationAt(bytes, i, 170);
            if (cal) calibrations.push(cal);
          } catch (e) { /* skip */ }
          i += 50;
        }
      }
    }
  }

  return {
    vuSerialNumber, sensorSerialNumber, calibrations,
    vuIdentification, seals, sensorsPaired, gnssRecords, companyLocks,
    downloadActivities, controlActivities,
  };
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

function isAlphanumericRun(bytes: Uint8Array, offset: number, minLen: number): boolean {
  let count = 0;
  for (let i = 0; i < minLen && offset + i < bytes.length; i++) {
    const b = bytes[offset + i];
    if ((b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A)) count++;
    else break;
  }
  return count >= minLen;
}

function parseCalibrationAt(bytes: Uint8Array, offset: number, maxLen?: number): CalibrationRecord | null {
  const r = new BinaryReader(toArrayBuffer(bytes), offset);
  const limit = maxLen ? Math.min(maxLen, r.remaining) : r.remaining;
  if (limit < 100) return null;

  const calibrationPurpose = r.readUint8();
  const workshopName = r.readString(36);
  const workshopAddress = r.remaining >= 36 ? r.readString(36) : '';

  // Card number format detection:
  // Gen2v2 FullCardNumberAndGeneration = cardType(1) + nation(1) + cardNumber(16) + generation(2) = 20B
  // Gen1 FullCardNumber = cardType(1) + nation(1) + cardNumber(16) = 18B
  // Strategy: try 18B first, check if VIN at offset+18 looks like a valid alphanumeric string.
  // If not, try 20B.
  let workshopCardNumber = '';
  if (r.remaining >= 20) {
    const cardStart = r.position;
    // Peek ahead: check VIN at +18 and +20 from current position
    const vinAt18 = cardStart + 18 + 4; // +4 for expiry date
    const vinAt20 = cardStart + 20 + 4;
    const vin18valid = vinAt18 + 17 <= bytes.length && isAlphanumericRun(bytes, vinAt18, 10);
    const vin20valid = vinAt20 + 17 <= bytes.length && isAlphanumericRun(bytes, vinAt20, 10);
    
    if (vin20valid && !vin18valid) {
      // Gen2v2 format confirmed
      workshopCardNumber = r.readFullCardNumberAndGen();
    } else {
      // Default to Gen1 18B format (more common, or when both look valid prefer shorter)
      workshopCardNumber = r.readFullCardNumber();
    }
  } else if (r.remaining >= 18) {
    workshopCardNumber = r.readFullCardNumber();
  }

  const workshopCardExpiryDate = r.remaining >= 4 ? r.readTimestamp() : null;

  // VehicleIdentificationNumber (17B) — VIN
  const vehicleIdentificationNumber = r.remaining >= 17 ? r.readString(17) : '';

  // VehicleRegistrationIdentification:
  // Gen2v2: nation(1B) + codepage(1B) + VRN(15B) = 17B total
  // Gen1:   nation(1B) + VRN(14B) = 15B total
  const vrnNation = r.remaining > 0 ? r.readUint8() : 0;
  let vrn = '';
  if (r.remaining > 0) {
    // Gen2v2 codepage byte: typically 0x00-0x0F
    const nextByte = bytes[r.position];
    if (nextByte <= 0x0F && r.remaining >= 16) {
      // Gen2v2: codepage(1B) + VRN(15B)
      r.skip(1);
      vrn = r.readString(15);
    } else if (r.remaining >= 14) {
      // Gen1: VRN(14B)
      vrn = r.readString(14);
    }
  }

  const wFactor = r.remaining >= 2 ? r.readUint16() : 0;
  const kFactor = r.remaining >= 2 ? r.readUint16() : 0;
  const tyreSize = r.remaining >= 15 ? r.readString(15) : '';
  const authorisedSpeed = r.remaining >= 1 ? r.readUint8() : 0;
  const oldOdometerValue = r.remaining >= 3 ? ((r.readUint8() << 16) | r.readUint16()) : 0;
  const newOdometerValue = r.remaining >= 3 ? ((r.readUint8() << 16) | r.readUint16()) : 0;
  const oldDateTime = r.remaining >= 4 ? r.readTimestamp() : null;
  const newDateTime = r.remaining >= 4 ? r.readTimestamp() : null;

  // Validate: VIN should be alphanumeric
  const vinValid = /^[A-Z0-9]{5,17}$/.test(vehicleIdentificationNumber);

  console.log(`[DDD] Calibration: purpose=${calibrationPurpose}, VIN="${vehicleIdentificationNumber}"(valid=${vinValid}), VRN="${vrn}", workshop="${workshopName}"`);

  return {
    calibrationPurpose,
    calibrationPurposeName: CALIBRATION_PURPOSE_NAMES[calibrationPurpose] || `Nieznany (${calibrationPurpose})`,
    workshopName,
    workshopAddress,
    workshopCardNumber,
    workshopCardExpiryDate,
    vehicleIdentificationNumber: vinValid ? vehicleIdentificationNumber : '',
    vehicleRegistrationNumber: vrn.replace(/[^A-Za-z0-9 ]/g, '').trim(),
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

  // Gen2v2 events file uses RecordArray format:
  // arrayType(1B) + recordSize(2B) + noOfRecords(2B) = 5B header, then records
  // Multiple RecordArrays concatenated for different event/fault types.
  const view = new DataView(toArrayBuffer(bytes));
  let pos = 0;
  let parsedRecordArrays = 0;

  while (pos + 5 < bytes.length) {
    const arrayType = bytes[pos];
    const recordSize = view.getUint16(pos + 1, false);
    const noOfRecords = view.getUint16(pos + 3, false);

    // Validate RecordArray header
    if (recordSize >= 10 && recordSize <= 200 && noOfRecords >= 0 && noOfRecords <= 100 &&
        pos + 5 + recordSize * noOfRecords <= bytes.length) {
      const arrayEnd = pos + 5 + recordSize * noOfRecords;

      for (let i = 0; i < noOfRecords; i++) {
        const recStart = pos + 5 + i * recordSize;
        if (recStart + 10 > bytes.length) break;

        const r = new BinaryReader(toArrayBuffer(bytes), recStart);
        const eventType = r.readUint8();
        const eventRecordPurpose = r.readUint8();
        const eventBeginTime = r.readTimestamp();
        const eventEndTime = r.readTimestamp();

        if (!eventBeginTime && !eventEndTime) continue;

        // Read FullCardNumberAndGeneration (20B) for driver slot
        let cardNumberDriverSlot = '';
        if (r.remaining >= 20) {
          cardNumberDriverSlot = r.readFullCardNumberAndGen();
        } else if (r.remaining >= 18) {
          cardNumberDriverSlot = r.readFullCardNumber();
        }

        // Read codriver slot
        let cardNumberCodriverSlot = '';
        if (r.remaining >= 20) {
          cardNumberCodriverSlot = r.readFullCardNumberAndGen();
        } else if (r.remaining >= 18) {
          cardNumberCodriverSlot = r.readFullCardNumber();
        }

        // Filter out empty codriver
        if (cardNumberCodriverSlot.replace(/\xff/g, '').replace(/\x00/g, '').length === 0) {
          cardNumberCodriverSlot = '';
        }

        // Determine if this is an event or fault based on type ranges
        const isFault = (eventType >= 0x00 && eventType <= 0x07 && arrayType >= 0x18) ? false : false;

        events.push({
          eventType,
          eventTypeName: EVENT_TYPE_NAMES[eventType] || `Zdarzenie 0x${eventType.toString(16)}`,
          eventBeginTime, eventEndTime,
          cardNumberDriverSlot,
          cardNumberCodriverSlot,
        });
      }

      pos = arrayEnd;
      parsedRecordArrays++;
      continue;
    }

    // If RecordArray validation failed, try next byte
    pos++;
  }

  if (parsedRecordArrays > 0) {
    console.log(`[DDD] Events: parsed ${parsedRecordArrays} RecordArrays, ${events.length} events`);
    // Deduplicate
    const seen = new Set<string>();
    const uniqueEvents = events.filter(e => {
      const key = `${e.eventType}-${e.eventBeginTime?.getTime()}-${e.cardNumberDriverSlot}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { events: uniqueEvents, faults };
  }

  // Fallback: pattern-based scanning (card number patterns)
  const cardPositions = findCardNumberPatterns(bytes);
  if (cardPositions.length === 0) {
    return parseEventsStructured(bytes, warnings);
  }

  for (const cardPos of cardPositions) {
    for (const offset of [10, 9]) {
      const eventStart = cardPos - offset;
      if (eventStart < 0) continue;

      try {
        const r = new BinaryReader(toArrayBuffer(bytes), eventStart);
        const eventType = r.readUint8();
        // Allow full Gen2v2 event type range (0x00-0x3F)
        if (eventType > 0x3F) continue;

        if (offset === 10) r.readUint8(); // skip eventRecordPurpose for Gen2v2

        const eventBeginTime = r.readTimestamp();
        const eventEndTime = r.readTimestamp();

        if (!eventBeginTime && !eventEndTime) continue;

        const _cardType = r.readUint8();
        const _nation = r.readUint8();
        const cardNumberDriverSlot = r.readString(16);

        events.push({
          eventType,
          eventTypeName: EVENT_TYPE_NAMES[eventType] || `Zdarzenie 0x${eventType.toString(16)}`,
          eventBeginTime, eventEndTime,
          cardNumberDriverSlot,
          cardNumberCodriverSlot: '',
        });
        break;
      } catch {
        continue;
      }
    }
  }

  const seen = new Set<string>();
  const uniqueEvents = events.filter(e => {
    const key = `${e.eventType}-${e.eventBeginTime?.getTime()}-${e.cardNumberDriverSlot}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { events: uniqueEvents, faults };
}

/** Find positions of card number patterns: any byte + 0x28 + 10+ digits */
function findCardNumberPatterns(bytes: Uint8Array): number[] {
  const positions: number[] = [];
  for (let i = 0; i < bytes.length - 18; i++) {
    if (bytes[i + 1] === 0x28) {
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
  if (bytes.length < 12) return records;

  const view = new DataView(toArrayBuffer(bytes));
  const r = new BinaryReader(toArrayBuffer(bytes));

  // Debug: dump first few bytes of each TLV section to understand Gen2v2 layout
  let debugPos = 0;
  let sectionIdx = 0;
  while (debugPos < bytes.length - 4) {
    if (bytes[debugPos] === 0x76) {
      const tagLow = bytes[debugPos + 1];
      if (tagLow >= 0x01 && tagLow <= 0x39) {
        const secLen = view.getUint16(debugPos + 2, false);
        if (secLen > 0 && secLen <= 100000) {
          const dataStart = debugPos + 4;
          const hexDump: string[] = [];
          for (let b = 0; b < Math.min(20, secLen); b++) {
            if (dataStart + b < bytes.length) {
              hexDump.push(bytes[dataStart + b].toString(16).padStart(2, '0'));
            }
          }
          // Try reading as Gen2v2 layout: timestamp(4) + dailyPresenceCounter(2) + dayDistance(2) + changeCount(2)
          if (dataStart + 10 <= bytes.length) {
            const ts = view.getUint32(dataStart, false);
            const field1 = view.getUint16(dataStart + 4, false);
            const field2 = view.getUint16(dataStart + 6, false);
            const field3 = view.getUint16(dataStart + 8, false);
            const tsDate = isValidTimestamp(ts) ? new Date(ts * 1000).toISOString() : 'INVALID';
            console.log(`[DDD-ACT-DBG] Section ${sectionIdx} @${debugPos} tag=0x${tagLow.toString(16)} len=${secLen} hex=[${hexDump.join(' ')}] ts=${tsDate} f1=${field1} f2=${field2} f3=${field3}`);
          }
          sectionIdx++;
          debugPos += 4 + secLen;
          continue;
        }
      }
    }
    debugPos++;
  }

  // Scan for all valid daily record positions by looking for valid timestamps
  // followed by plausible dailyPresenceCounter, dayDistance, and changeCount
  const dayPositions: number[] = [];
  const dayTimestamps: number[] = [];
  
  // Debug: log first 5 valid timestamps found regardless of other checks
  let debugTsCount = 0;
  for (let i = 0; i < bytes.length - 10; i++) {
    const ts = view.getUint32(i, false);
    if (!isValidTimestamp(ts)) continue;
    
    if (debugTsCount < 10) {
      const dist = view.getUint16(i + 6, false);
      const changes = view.getUint16(i + 8, false);
      // Also try offset+7 for 3-byte dailyPresenceCounter (Gen2v2 OdometerShort)
      const dist3 = view.getUint16(i + 7, false);
      const changes3 = view.getUint16(i + 9, false);
      console.log(`[DDD-ACT-DBG] Valid TS @${i}: ${new Date(ts * 1000).toISOString()} | 2B-layout: dist=${dist} changes=${changes} | 3B-layout: dist=${dist3} changes=${changes3}`);
      debugTsCount++;
    }
    
    const dist = view.getUint16(i + 6, false);
    const changes = view.getUint16(i + 8, false);
    // Plausibility: distance < 10000km, changes <= 1440, and enough bytes for the changes
    if (dist <= 9999 && changes <= 1440 && i + 10 + changes * 2 <= bytes.length) {
      dayPositions.push(i);
      dayTimestamps.push(ts);
      // Skip past this record to avoid finding timestamps within activity data
      i += 10 + changes * 2 - 1;
    }
  }
  
  console.log(`[DDD-ACT-DBG] Scanner found ${dayPositions.length} day positions from ${bytes.length} bytes`);

  // Filter out stale records from circular buffer: keep only records within 1 year of the newest
  if (dayTimestamps.length > 0) {
    const maxTs = Math.max(...dayTimestamps);
    const oneYearSecs = 366 * 86400;
    const filtered: number[] = [];
    for (let i = 0; i < dayPositions.length; i++) {
      if (maxTs - dayTimestamps[i] <= oneYearSecs) {
        filtered.push(dayPositions[i]);
      }
    }
    dayPositions.length = 0;
    dayPositions.push(...filtered);
  }

  for (const pos of dayPositions) {
    r.position = pos;
    try {
      const tsValue = r.readUint32();
      const ts = new Date(tsValue * 1000);
      const dailyPresenceCounter = r.readUint16();
      const dayDistance = r.readUint16();
      const activityChangeCount = r.readUint16();

      // First pass: read all raw change entries
      const rawEntries: Array<{ slot: number; cardInserted: boolean; activity: number; minutes: number }> = [];
      for (let i = 0; i < activityChangeCount && r.remaining >= 2; i++) {
        const word = r.readUint16();
        const slot = (word >> 15) & 0x01;
        const cardInserted = ((word >> 13) & 0x01) === 0;
        const activity = (word >> 11) & 0x03;
        const minutes = word & 0x07FF;
        if (minutes >= 1440) continue;
        rawEntries.push({ slot, cardInserted, activity, minutes });
      }

      const statusMap: Record<number, ActivityChangeEntry['status']> = {
        0: 'break', 1: 'availability', 2: 'work', 3: 'driving',
      };

      // Second pass: compute timeTo per entry using next entry with SAME slot
      const entries: ActivityChangeEntry[] = [];
      for (let i = 0; i < rawEntries.length; i++) {
        const e = rawEntries[i];
        // Find next entry with same slot to determine end time
        let nextMinutes = 1440;
        for (let j = i + 1; j < rawEntries.length; j++) {
          if (rawEntries[j].slot === e.slot) {
            nextMinutes = rawEntries[j].minutes;
            break;
          }
        }
        // Skip entries where timeFrom >= timeTo (zero or negative duration)
        if (e.minutes >= nextMinutes) continue;

        const hFrom = Math.floor(e.minutes / 60);
        const mFrom = e.minutes % 60;
        const hTo = Math.floor(Math.min(nextMinutes, 1440) / 60);
        const mTo = Math.min(nextMinutes, 1440) % 60;

        entries.push({
          slot: e.slot === 0 ? 'driver' : 'codriver',
          status: statusMap[e.activity] || 'unknown',
          cardInserted: e.cardInserted,
          minutes: e.minutes,
          timeFrom: `${hFrom.toString().padStart(2, '0')}:${mFrom.toString().padStart(2, '0')}`,
          timeTo: `${hTo.toString().padStart(2, '0')}:${mTo.toString().padStart(2, '0')}`,
        });
      }

      // Validate: total minutes per slot must not exceed 1440
      const slotTotals = { 0: 0, 1: 0 };
      for (const e of entries) {
        const [hF, mF] = e.timeFrom.split(':').map(Number);
        const [hT, mT] = e.timeTo.split(':').map(Number);
        const dur = (hT * 60 + mT) - (hF * 60 + mF);
        slotTotals[e.slot === 'driver' ? 0 : 1] += dur;
      }
      if (slotTotals[0] > 1440 || slotTotals[1] > 1440) continue; // garbage record

      records.push({ date: ts, dailyPresenceCounter, dayDistance, entries });
    } catch {
      continue;
    }
  }

  // Sort by date
  records.sort((a, b) => a.date.getTime() - b.date.getTime());

  if (records.length === 0) {
    warnings.push({ offset: 0, message: 'Could not extract activity records from raw file' });
  }

  return records;
}

// ─── Raw overview file parser ────────────────────────────────────────────────

function parseRawOverviewFile(bytes: Uint8Array, warnings: ParserWarning[]): DddOverview | null {
  const overview: DddOverview = {
    vuManufacturerName: '', vuManufacturerAddress: '', vuSerialNumber: '',
    vuPartNumber: '', vuSoftwareVersion: '', vuManufacturingDate: null,
    vuApprovalNumber: '', vehicleRegistrationNation: '', vehicleRegistrationNumber: '',
    currentDateTime: null, vuDownloadablePeriodBegin: null, vuDownloadablePeriodEnd: null,
    cardSlotsStatus: 0, vuDownloadActivityDataLength: 0,
  };

  const view = new DataView(toArrayBuffer(bytes));
  const TS_RECENT = new Date('2020-01-01').getTime() / 1000;

  // Strategy 1: Skip all TLV sections (76 XX) until we find the overview tag (76 05/25/35)
  let pos = 0;
  let skippedTlvSections = 0;
  let foundOverviewTag = false;
  while (pos + 4 < bytes.length && skippedTlvSections < 20) {
    if (bytes[pos] === 0x76) {
      const tagLow = bytes[pos + 1];
      const length = view.getUint16(pos + 2, false);
      
      // Check if this is the overview data tag
      const isOverviewTag = (tagLow === 0x05 || tagLow === 0x25 || tagLow === 0x35);
      
      if (isOverviewTag && length > 0 && length <= 10000 && pos + 4 + length <= bytes.length) {
        // Found overview section — parse its contents
        pos += 4; // skip TLV header
        foundOverviewTag = true;
        break;
      }
      
      // Skip any other 0x76 XX TLV section (certs, VuIdentification, VuSoftwareId, etc.)
      if (length > 0 && length <= 10000 && pos + 4 + length <= bytes.length) {
        pos += 4 + length;
        skippedTlvSections++;
        continue;
      }
    }
    break;
  }

  if (foundOverviewTag && pos + 17 < bytes.length) {
    const result = tryParseOverviewData(bytes, pos, overview);
    if (result) {
      console.log(`[DDD] Overview: VIN="${result.vin}", VRN="${overview.vehicleRegistrationNumber}", date=${overview.currentDateTime}, skipped ${skippedTlvSections} TLV sections`);
      return overview;
    }
  } else if (skippedTlvSections > 0 && pos + 17 < bytes.length) {
    // Didn't find overview tag explicitly, but skipped some sections — try parsing remaining data
    const result = tryParseOverviewData(bytes, pos, overview);
    if (result) {
      console.log(`[DDD] Overview (post-skip): VIN="${result.vin}", VRN="${overview.vehicleRegistrationNumber}", date=${overview.currentDateTime}, skipped ${skippedTlvSections} TLV sections`);
      return overview;
    }
  }

  // Strategy 2: Scan for 3 consecutive valid timestamps ONLY after cert sections
  // Don't scan inside certificate data (bytes 0..pos) as it produces false positives
  const searchStart = skippedTlvSections > 0 ? pos : 0;
  for (let i = searchStart; i < bytes.length - 12; i++) {
    const ts1 = view.getUint32(i, false);
    const ts2 = view.getUint32(i + 4, false);
    const ts3 = view.getUint32(i + 8, false);
    if (ts1 >= TS_RECENT && ts1 <= TS_MAX && ts2 >= TS_MIN && ts2 <= TS_MAX && ts3 >= TS_MIN && ts3 <= TS_MAX) {
      if (ts2 <= ts3) {
        for (const vrnLen of [15, 14, 13]) {
          const vinStart = i - (17 + 1 + vrnLen);
          if (vinStart >= 0) {
            const result = tryParseOverviewData(bytes, vinStart, overview);
            if (result && result.vin.length > 0) {
              console.log(`[DDD] Overview (timestamp scan): VIN="${result.vin}", VRN="${overview.vehicleRegistrationNumber}", date=${overview.currentDateTime}`);
              return overview;
            }
          }
        }
        // Only accept timestamps without VIN if they're after cert sections
        if (i >= searchStart && searchStart > 0) {
          overview.currentDateTime = new Date(ts1 * 1000);
          overview.vuDownloadablePeriodBegin = new Date(ts2 * 1000);
          overview.vuDownloadablePeriodEnd = new Date(ts3 * 1000);
          console.log(`[DDD] Overview (timestamps only, post-cert): date=${overview.currentDateTime}`);
          return overview;
        }
      }
    }
  }

  // Overview data not found in this file — likely truncated (only certificates).
  // Data will be populated from technical/events files via mergeDddData.
  console.log('[DDD] Overview file contains only certificates — overview data will come from other files');
  return null;
}

function tryParseOverviewData(bytes: Uint8Array, pos: number, overview: DddOverview): { vin: string } | null {
  if (pos + 17 + 1 + 13 + 12 > bytes.length) return null;
  const r = new BinaryReader(toArrayBuffer(bytes), pos);
  const vin = r.readString(17);
  // Validate VIN: should be mostly alphanumeric
  const vinValid = /^[A-Z0-9]{5,17}$/.test(vin);
  if (!vinValid && vin.length > 0) return null;

  const vehicleNationByte = r.readUint8();
  overview.vehicleRegistrationNation = NATION_CODES[vehicleNationByte] || `0x${vehicleNationByte.toString(16)}`;

  // Try to determine VRN length: check if next byte is a codepage indicator
  // Gen2v2 has codePage(1B) + VRN(13B), Gen1 has VRN(14B)
  const nextByte = bytes[r.position];
  let vrn: string;
  if (nextByte <= 0x0F) {
    // Likely codepage byte — skip it and read 13B VRN
    r.skip(1);
    vrn = r.readString(13);
  } else {
    // Gen1/Gen2 — 14 or 15 byte VRN
    vrn = r.readString(15);
  }
  overview.vehicleRegistrationNumber = vrn;

  overview.currentDateTime = r.remaining >= 4 ? r.readTimestamp() : null;
  overview.vuDownloadablePeriodBegin = r.remaining >= 4 ? r.readTimestamp() : null;
  overview.vuDownloadablePeriodEnd = r.remaining >= 4 ? r.readTimestamp() : null;
  overview.cardSlotsStatus = r.remaining > 0 ? r.readUint8() : 0;
  overview.vuDownloadActivityDataLength = r.remaining >= 4 ? r.readUint32() : 0;

  // Validate: currentDateTime should be reasonable
  if (!overview.currentDateTime) return null;
  const ts = overview.currentDateTime.getTime() / 1000;
  if (ts < TS_MIN || ts > TS_MAX) return null;

  return { vin };
}

// ─── Direct overview parser (Gen2v2/Gen2 — no certs inside TLV section) ──────

function parseOverviewDirect(data: Uint8Array): DddOverview {
  const r = new BinaryReader(toArrayBuffer(data));

  // Gen2v2 overview section data: VIN(17B) + VRI(nation 1B + VRN 15B) + timestamps
  const _vin = r.remaining >= 17 ? r.readString(17) : '';
  const vehicleNationByte = r.remaining > 0 ? r.readUint8() : 0;
  const vehicleNation = NATION_CODES[vehicleNationByte] || `0x${vehicleNationByte.toString(16)}`;
  const vrn = r.remaining >= 15 ? r.readString(15) : '';
  const downloadDate = r.remaining >= 4 ? r.readTimestamp() : null;
  const downloadPeriodBegin = r.remaining >= 4 ? r.readTimestamp() : null;
  const downloadPeriodEnd = r.remaining >= 4 ? r.readTimestamp() : null;
  const cardSlotsStatus = r.remaining > 0 ? r.readUint8() : 0;
  const vuDownloadActivityDataLength = r.remaining >= 4 ? r.readUint32() : 0;

  console.log(`[DDD] OverviewDirect: VIN="${_vin}", VRN="${vrn}", date=${downloadDate}`);

  return {
    vuManufacturerName: '', vuManufacturerAddress: '', vuSerialNumber: '',
    vuPartNumber: '', vuSoftwareVersion: '', vuManufacturingDate: null,
    vuApprovalNumber: '',
    vehicleRegistrationNation: vehicleNation,
    vehicleRegistrationNumber: vrn,
    currentDateTime: downloadDate,
    vuDownloadablePeriodBegin: downloadPeriodBegin,
    vuDownloadablePeriodEnd: downloadPeriodEnd,
    cardSlotsStatus,
    vuDownloadActivityDataLength,
  };
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
        if (length > 0 && length <= MAX_SECTION_SIZE) {
          // Allow truncated last section (file may be cut short from TRTP download)
          const availableLength = Math.min(length, bytes.length - pos - 4);
          if (availableLength > 0) {
            const data = bytes.slice(pos + 4, pos + 4 + availableLength);
            sections.push({
              tag: tagLow,
              tagHigh: 0x76,
              offset: pos,
              length: availableLength,
              data,
            });
            console.log(`[DDD] Section 0x76 0x${tagLow.toString(16).padStart(2, '0')} at offset ${pos}, length ${availableLength}${availableLength < length ? ` (truncated from ${length})` : ''}`);
            pos += 4 + availableLength;
            continue;
          }
        } else if (length > MAX_SECTION_SIZE) {
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

  // Gen1 VuOverview structure (Annex 1C, Appendix 7 §2.2.6.2):
  // MemberStateCertificate (194B) + VuCertificate (194B) = 388B certificates
  // Then: VehicleIdentificationNumber (17B)
  //        VehicleRegistrationIdentification: nation(1B) + VRN(14B)
  //        CurrentDateTime (4B)
  //        VuDownloadablePeriod: begin(4B) + end(4B)
  //        CardSlotsStatus (1B)
  //        VuDownloadActivityData ...

  // Skip certificates (2 × 194 = 388 bytes)
  if (r.remaining > 388) {
    r.skip(388);
  }

  // VehicleIdentificationNumber (VIN) — 17 bytes
  const _vin = r.remaining >= 17 ? r.readString(17) : '';
  // VehicleRegistrationIdentification
  const vehicleNationByte = r.remaining > 0 ? r.readUint8() : 0;
  const vehicleNation = NATION_CODES[vehicleNationByte] || `0x${vehicleNationByte.toString(16)}`;
  const vrn = r.remaining >= 14 ? r.readString(14) : '';
  // CurrentDateTime
  const downloadDate = r.readTimestamp();
  // VuDownloadablePeriod
  const downloadPeriodBegin = r.readTimestamp();
  const downloadPeriodEnd = r.readTimestamp();
  // CardSlotsStatus
  const cardSlotsStatus = r.remaining > 0 ? r.readUint8() : 0;
  // VuDownloadActivityData
  const vuDownloadActivityDataLength = r.remaining >= 4 ? r.readUint32() : 0;

  // After VuDownloadActivityData, try reading VU identification if data remains
  // The VU identification fields are in the VuCompanyLocksData section, not here
  // For Gen1, manufacturer info would be in the Technical Data section

  return {
    vuManufacturerName: '',
    vuManufacturerAddress: '',
    vuSerialNumber: '',
    vuPartNumber: '',
    vuSoftwareVersion: '',
    vuManufacturingDate: null,
    vuApprovalNumber: '',
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
  if (r.remaining < 10) return records;

  // Try to find the start position — skip possible RecordArray header or other prefix
  const possibleRecSize = (data[1] << 8) | data[2];
  const possibleCount = (data[3] << 8) | data[4];
  
  if (possibleCount > 0 && possibleCount <= 366 && possibleRecSize > 0 && possibleRecSize <= 3000) {
    r.position = 5;
  } else {
    r.position = 8; // Legacy default
  }

  while (r.remaining >= 12) {
    try {
      const tsValue = r.readUint32();
      if (tsValue === 0 || tsValue === 0xFFFFFFFF || !isValidTimestamp(tsValue)) break;
      const date = new Date(tsValue * 1000);

      const dailyPresenceCounter = r.readUint16();
      const dayDistance = r.readUint16();
      if (dayDistance > 9999) break;

      const activityChangeCount = r.remaining >= 2 ? r.readUint16() : 0;
      if (activityChangeCount > 1440) break;

      // First pass: read all raw change entries
      const rawEntries: Array<{ slot: number; cardInserted: boolean; activity: number; minutes: number }> = [];

      for (let i = 0; i < activityChangeCount && r.remaining >= 2; i++) {
        const word = r.readUint16();
        const slot = (word >> 15) & 0x01;
        const cardInserted = ((word >> 13) & 0x01) === 0;
        const activity = (word >> 11) & 0x03;
        const minutes = word & 0x07FF;
        if (minutes >= 1440) continue;
        rawEntries.push({ slot, cardInserted, activity, minutes });
      }

      const statusMap: Record<number, ActivityChangeEntry['status']> = {
        0: 'break', 1: 'availability', 2: 'work', 3: 'driving',
      };

      // Second pass: compute timeTo per entry using next entry with SAME slot
      const entries: ActivityChangeEntry[] = [];
      for (let i = 0; i < rawEntries.length; i++) {
        const e = rawEntries[i];
        let nextMinutes = 1440;
        for (let j = i + 1; j < rawEntries.length; j++) {
          if (rawEntries[j].slot === e.slot) {
            nextMinutes = rawEntries[j].minutes;
            break;
          }
        }
        if (e.minutes >= nextMinutes) continue;

        const hFrom = Math.floor(e.minutes / 60);
        const mFrom = e.minutes % 60;
        const hTo = Math.floor(Math.min(nextMinutes, 1440) / 60);
        const mTo = Math.min(nextMinutes, 1440) % 60;

        entries.push({
          slot: e.slot === 0 ? 'driver' : 'codriver',
          status: statusMap[e.activity] || 'unknown',
          cardInserted: e.cardInserted,
          minutes: e.minutes,
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
        vehicleIdentificationNumber: '',
        vehicleRegistrationNumber: vrn,
        vehicleRegistrationNation: NATION_CODES[vrnNation] || `0x${vrnNation.toString(16)}`,
        wFactor, kFactor, tyreSize, authorisedSpeed,
        oldOdometerValue, newOdometerValue, oldDateTime, newDateTime,
      });
    }
  }

  return { vuSerialNumber, sensorSerialNumber, calibrations, vuIdentification: null, seals: [], sensorsPaired: [], gnssRecords: [], companyLocks: [], downloadActivities: [], controlActivities: [] };
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
