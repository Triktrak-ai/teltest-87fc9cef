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
  drivingStatus: 'single' | 'crew';
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

// ─── Gen2v2 border crossing and load/unload types ────────────────────────────

export interface GnssPlaceAuthRecord {
  timestamp: Date | null;
  gnssAccuracy: number;
  latitude: number;
  longitude: number;
  authenticationStatus: 'authenticated' | 'not_authenticated' | 'unknown';
}

export interface BorderCrossingRecord {
  countryLeft: string;
  countryEntered: string;
  gnssPlace: GnssPlaceAuthRecord;
  vehicleOdometerValue: number;
}

export interface LoadUnloadRecord {
  operationType: 'loading' | 'unloading' | 'simultaneous' | 'unknown';
  gnssPlace: GnssPlaceAuthRecord;
  vehicleOdometerValue: number;
}

export interface DddSection {
  tag: number;
  tagHigh: number;
  offset: number;
  length: number;
  data: Uint8Array;
  sourceFile?: string;
}

export interface ParserWarning {
  offset: number;
  message: string;
}

export interface ActivityRejection {
  offset: number;
  date: string;
  reason: string;
  dayDistance?: number;
  changeCount?: number;
  slotTotals?: { driver: number; codriver: number };
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
  borderCrossings: BorderCrossingRecord[];
  loadUnloadOperations: LoadUnloadRecord[];
  rawSections: DddSection[];
  warnings: ParserWarning[];
  activityRejections: ActivityRejection[];
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
    borderCrossings: [...existing.borderCrossings, ...incoming.borderCrossings],
    loadUnloadOperations: [...existing.loadUnloadOperations, ...incoming.loadUnloadOperations],
    rawSections: [...existing.rawSections, ...incoming.rawSections],
    warnings: [...existing.warnings, ...incoming.warnings],
    activityRejections: [...existing.activityRejections, ...incoming.activityRejections],
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
    technicalData: null, speedRecords: [], borderCrossings: [], loadUnloadOperations: [],
    rawSections: [],
    warnings: [], activityRejections: [], fileSize: 0, bytesParsed: 0, generation: 'unknown',
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

function selectDenseTimestampAnchor(values: number[], windowSeconds = 90 * 86400): number {
  if (values.length === 0) return 0;

  let best = values[0];
  let bestCount = -1;
  for (const candidate of values) {
    let count = 0;
    for (const v of values) {
      if (Math.abs(v - candidate) <= windowSeconds) count++;
    }
    if (count > bestCount || (count === bestCount && candidate > best)) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Extract download date from DDD filename.
 * Format: {IMEI}_{type}_{YYYYMMDD}_{HHMMSS}.ddd
 * Returns Date or null if not parseable.
 */
function extractDownloadDate(fileName?: string): Date | null {
  if (!fileName) return null;
  const match = fileName.match(/_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.ddd$/i);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss] = match;
  const date = new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss));
  if (isNaN(date.getTime())) return null;
  return date;
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
    borderCrossings: [],
    loadUnloadOperations: [],
    rawSections: [],
    warnings,
    activityRejections: [],
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
  sections.forEach(s => s.sourceFile = fileName);
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
  const fileName = result.rawFileBuffers?.[0]?.fileName;
  const downloadDate = extractDownloadDate(fileName);

  // Extract TLV sections first — individual TRTP files may contain TLV-wrapped data
  const sections = extractSections(buffer, result.warnings);
  sections.forEach(s => s.sourceFile = fileName);
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
        // Activities tags seen in the wild: TRTP file-type tags (0x02/0x22/0x32)
        // and legacy section tags (0x06/0x26/0x36). Accept both for compatibility.
        const actSections = sections
          .filter(s => [0x32, 0x22, 0x02, 0x36, 0x26, 0x06].includes(s.tag))
          .sort((a, b) => a.offset - b.offset);

        console.log(`[DDD] Activities: ${sections.length} total sections, ${actSections.length} activity sections, tags: [${sections.map(s => '0x' + s.tag.toString(16)).join(', ')}]`);

        if (actSections.length > 0) {
          // ── Per-chunk RecordArray strategy (primary) ──
          // Each TLV chunk (and the pre-TLV header) contains its OWN set of
          // RecordArrays for different days. Parse each independently and merge.
          const firstTlvOffset = actSections[0].offset;
          const preTlvData = firstTlvOffset > 0 ? bytes.slice(0, firstTlvOffset) : null;

          const chunksToParse: Uint8Array[] = [];
          if (preTlvData && preTlvData.length > 5) {
            chunksToParse.push(preTlvData);
            console.log(`[DDD] Activities: including ${preTlvData.length}B pre-TLV data`);
          }
          for (let ci = 0; ci < actSections.length; ci++) {
            const s = actSections[ci];
            const stripped = stripTrtpPrefix(s.data, ci === 0);
            chunksToParse.push(stripped);
          }

          // Parse each chunk through RecordArray parser independently
          let allRecordArrayDays: ActivityRecord[] = [];
          let raChunksWithData = 0;
          const allBorderCrossings: BorderCrossingRecord[] = [];
          const allLoadUnloads: LoadUnloadRecord[] = [];
          for (const chunk of chunksToParse) {
            const chunkWarnings: ParserWarning[] = [];
            const parsed = parseVuActivitiesRecordArrays(chunk, chunkWarnings);
            if (parsed.activities.length > 0) {
              allRecordArrayDays.push(...parsed.activities);
              raChunksWithData++;
            }
            allBorderCrossings.push(...parsed.borderCrossings);
            allLoadUnloads.push(...parsed.loadUnloadOperations);
          }

          if (allRecordArrayDays.length > 0) {
            // Deduplicate by day
            const byDayLocal = new Map<string, ActivityRecord>();
            for (const rec of allRecordArrayDays) {
              const key = `${rec.date.getUTCFullYear()}-${rec.date.getUTCMonth()}-${rec.date.getUTCDate()}`;
              const existing = byDayLocal.get(key);
              if (!existing || rec.entries.length > existing.entries.length) {
                byDayLocal.set(key, rec);
              }
            }
            const mergedWarnings: ParserWarning[] = [];
            const mergedRejections: ActivityRejection[] = [];
            let mergedActivities = Array.from(byDayLocal.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

            // Apply download date filter
            if (downloadDate) {
              const upperTs = Math.floor(downloadDate.getTime() / 1000);
              const lowerTs = upperTs - 90 * 86400;
              const beforeCount = mergedActivities.length;
              mergedActivities = mergedActivities.filter(r => {
                const ts = Math.floor(r.date.getTime() / 1000);
                const inRange = ts >= lowerTs && ts <= upperTs;
                if (!inRange) {
                  mergedRejections.push({
                    offset: 0,
                    date: r.date.toISOString().slice(0, 10),
                    reason: ts < lowerTs
                      ? `Poza oknem 90 dni (za stary, ${Math.round((lowerTs - ts) / 86400)}d przed oknem)`
                      : `Poza oknem 90 dni (w przyszłości, ${Math.round((ts - upperTs) / 86400)}d po pobraniu)`,
                    dayDistance: r.dayDistance,
                    changeCount: r.entries.length,
                  });
                }
                return inRange;
              });
              if (beforeCount > mergedActivities.length) {
                console.log(`[DDD] Date filter: ${beforeCount} → ${mergedActivities.length} days (${beforeCount - mergedActivities.length} rejected)`);
              }
            }

            if (mergedActivities.length > 0) {
              result.activities = mergedActivities;
              result.warnings.push(...mergedWarnings);
              result.activityRejections.push(...mergedRejections);
              result.borderCrossings.push(...allBorderCrossings);
              result.loadUnloadOperations.push(...allLoadUnloads);
              const entryScore = mergedActivities.reduce((sum, d) => sum + d.entries.length, 0);
              console.log(`[DDD] Activities strategy=per-chunk-RecordArray: ${mergedActivities.length} days from ${raChunksWithData} chunks (entries=${entryScore}), borders=${allBorderCrossings.length}, loads=${allLoadUnloads.length}`);
            }
          }

          // ── Concatenated fallback ──
          if (result.activities.length === 0) {
            const strippedChunks: Uint8Array[] = [];
            for (let ci = 0; ci < actSections.length; ci++) {
              const s = actSections[ci];
              const stripped = stripTrtpPrefix(s.data, ci === 0);
              strippedChunks.push(stripped);
            }
            const totalLen = strippedChunks.reduce((sum, c) => sum + c.length, 0);
            const mergedData = new Uint8Array(totalLen);
            let writePos = 0;
            for (const chunk of strippedChunks) {
              mergedData.set(chunk, writePos);
              writePos += chunk.length;
            }

            const mergedSection: DddSection = {
              tag: actSections[0].tag, tagHigh: actSections[0].tagHigh,
              offset: actSections[0].offset, length: mergedData.length, data: mergedData,
            };
            const mergedWarnings: ParserWarning[] = [];
            const mergedRejections: ActivityRejection[] = [];
            const mergedActivities = parseActivitiesFromSections([mergedSection], mergedWarnings, mergedRejections, downloadDate);

            if (mergedActivities.length > 0) {
              result.activities = mergedActivities;
              result.warnings.push(...mergedWarnings);
              result.activityRejections.push(...mergedRejections);
              console.log(`[DDD] Activities strategy=concatenated-fallback: ${result.activities.length} days`);
            }
          }
        }

        // Final fallback to raw scanner on whole file
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
  //
  // Known RecordArray types from TREP 33h (Appendix 7, type 2.120):
  //   0x15 (21) — VuEventRecordArray (general events)
  //   0x18 (24) — VuFaultRecordArray (faults)
  //   0x1A (26) — VuOverSpeedingControlDataRecordArray
  //   0x1B (27) — VuOverSpeedingEventRecordArray
  //   0x1E (30) — VuTimeAdjustmentRecordArray
  const FAULT_ARRAY_TYPES = new Set([0x18]);
  const EVENT_ARRAY_TYPES = new Set([0x15, 0x1A, 0x1B, 0x1E]);

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
      const isFaultArray = FAULT_ARRAY_TYPES.has(arrayType);

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

        if (isFaultArray) {
          faults.push({
            faultType: eventType,
            faultTypeName: FAULT_TYPE_NAMES[eventType] || `Usterka 0x${eventType.toString(16)}`,
            faultBeginTime: eventBeginTime, faultEndTime: eventEndTime,
            cardNumberDriverSlot,
            cardNumberCodriverSlot,
          });
        } else {
          events.push({
            eventType,
            eventTypeName: EVENT_TYPE_NAMES[eventType] || `Zdarzenie 0x${eventType.toString(16)}`,
            eventBeginTime, eventEndTime,
            cardNumberDriverSlot,
            cardNumberCodriverSlot,
          });
        }
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

// ─── TRTP prefix stripping for chunk concatenation ──────────────────────────

/**
 * Classify a TRTP-stripped VU activity chunk as either VuActivityDailyData
 * or VuCardIWData (card insertion/withdrawal records with driver names).
 *
 * VuCardIWData chunks contain HolderName structures (codePage + ASCII surname)
 * starting around byte 8 after TRTP strip. We detect this by checking for
 * high printable ASCII density in that region.
 *
 * VuActivityDailyData contains binary activity change words (2B each) which
 * have very low ASCII density.
 */
function classifyVuActivityChunk(data: Uint8Array): 'activity' | 'cardIW' {
  if (data.length < 30) return 'activity';

  // After TRTP strip, the structure is:
  //   4B timestamp + 3B (odometer/header) + 1B (codePage for CardIW, or data for activity)
  //   Then: CardIW → ASCII name bytes; Activity → binary change words
  //
  // Check bytes 8–40 for printable ASCII density
  const sampleStart = 8;
  const sampleEnd = Math.min(40, data.length);
  const sample = data.slice(sampleStart, sampleEnd);
  const asciiCount = Array.from(sample).filter(b => b >= 0x20 && b < 0x7F).length;
  const ratio = asciiCount / sample.length;

  // CardIW records have driver names (>60% printable ASCII in this region)
  // Activity data has packed binary words (<30% printable ASCII)
  if (ratio > 0.5) return 'cardIW';
  return 'activity';
}

/**
 * Strip TRTP transport prefix from a TLV section's data payload.
 * Detects common prefix patterns and strips them.
 */
function stripTrtpPrefix(data: Uint8Array, _isFirstChunk: boolean): Uint8Array {
  if (data.length < 3) return data;

  // TRTP transport header per specialist: 3 bytes = [TREP][sub-msg-counter-hi][sub-msg-counter-lo]
  // E.g. 32 00 01 = TREP 0x32 (activities Gen2v2), sub-message #1.
  // After TLV tag stripping (76 32 → payload), the remaining prefix is
  // often 04 00 01 which appears to be an internal framing artifact.
  // We strip it and reconstruct the DateOfDayDownloaded RecordArray header.
  if (data[0] === 0x04 && data[1] === 0x00 &&
      (data[2] === 0x01 || data[2] === 0x02)) {
    const stripped = data.slice(3); // starts with 4B timestamp
    const dateRaHeader = new Uint8Array([0x06, 0x00, 0x04, 0x00, 0x01]);
    const result = new Uint8Array(dateRaHeader.length + stripped.length);
    result.set(dateRaHeader, 0);
    result.set(stripped, dateRaHeader.length);
    return result;
  }

  return data;
}

/**
 * Remove artifact records from cyclic buffer boundary corruption:
 * 1) Runs of 3+ consecutive records with identical dayDistance
 * 2) Known artifact values (768 = 0x0300) that appear when TRTP header bytes
 *    are misread as distance fields — only removed if the value appears
 *    suspiciously often (≥3 total occurrences across the dataset).
 */
function filterDistanceArtifacts(records: ActivityRecord[]): ActivityRecord[] {
  if (records.length < 3) return records;
  
  const dominated = new Set<number>();
  
  // Pass 1: Remove runs of 3+ consecutive identical dayDistance
  let runStart = 0;
  for (let i = 1; i <= records.length; i++) {
    if (i < records.length && records[i].dayDistance === records[runStart].dayDistance) continue;
    const runLen = i - runStart;
    if (runLen >= 3) {
      for (let j = runStart; j < i; j++) dominated.add(j);
    }
    runStart = i;
  }
  
  // Pass 2: The value 768 (0x0300) is a specific known artifact from TRTP headers
  // (05 00 03 00 01 pattern). If it appears ≥3 times, remove all occurrences.
  const count768 = records.filter(r => r.dayDistance === 768).length;
  if (count768 >= 3) {
    for (let i = 0; i < records.length; i++) {
      if (records[i].dayDistance === 768) dominated.add(i);
    }
  }
  
  if (dominated.size === 0) return records;
  console.log(`[DDD] Filtered ${dominated.size} artifact records with corrupted dayDistance`);
  return records.filter((_, idx) => !dominated.has(idx));
}

// ─── TLV-section-based activities parser (Gen2/Gen2v2) ──────────────────────

function parseActivitiesFromSections(sections: DddSection[], warnings: ParserWarning[], rejections?: ActivityRejection[], downloadDate?: Date | null): ActivityRecord[] {
  const byDay = new Map<string, ActivityRecord>();

  const dayKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;

  const checkPlausibility = (rec: ActivityRecord, offset: number): string | null => {
    if (!rec.date || Number.isNaN(rec.date.getTime())) return 'Nieprawidłowa data';
    if (rec.entries.length === 0) return 'Brak wpisów czynności (entries.length === 0)';

    const slotTotals = { driver: 0, codriver: 0 };
    for (const e of rec.entries) {
      const [hF, mF] = e.timeFrom.split(':').map(Number);
      const [hT, mT] = e.timeTo.split(':').map(Number);
      const from = hF * 60 + mF;
      const to = hT * 60 + mT;
      const dur = to - from;
      if (dur <= 0 || dur > 1440) return `Nieprawidłowy czas trwania wpisu: ${e.timeFrom}–${e.timeTo} (${dur} min)`;
      slotTotals[e.slot] += dur;
    }
    if (slotTotals.driver > 1440) return `Suma minut K1 > 24h: ${slotTotals.driver} min`;
    if (slotTotals.codriver > 1440) return `Suma minut K2 > 24h: ${slotTotals.codriver} min`;
    return null;
  };

  for (const section of sections) {
    const data = section.data;
    if (data.length < 12) {
      rejections?.push({ offset: section.offset, date: '—', reason: `Sekcja za krótka: ${data.length} B < 12 B` });
      continue;
    }

    // Strategy 1: VU RecordArray parser (Gen2/Gen2v2 — proper structure)
    const vuRecordArrayParsed = parseVuActivitiesRecordArrays(data, warnings);
    if (vuRecordArrayParsed.length > 0) {
      for (const rec of vuRecordArrayParsed) {
        const key = dayKey(rec.date);
        const existing = byDay.get(key);
        if (!existing || rec.entries.length > existing.entries.length) {
          byDay.set(key, rec);
        }
      }
      console.log(`[DDD] Activities section @${section.offset}: VU RecordArray parser found ${vuRecordArrayParsed.length} days`);
      continue;
    }

    // Strategy 1.5: Gen1-style VU parser (generation locking — Gen1 card in Gen2v2 VU)
    // Data inside 0x76 0x32 tag uses Gen1 flat format: TimeReal + Odo + CardIW + ActivityChanges
    const gen1Parsed = parseVuActivitiesGen1Style(data, warnings, downloadDate);
    if (gen1Parsed.length > 0) {
      for (const rec of gen1Parsed) {
        const key = dayKey(rec.date);
        const existing = byDay.get(key);
        if (!existing || rec.entries.length > existing.entries.length) {
          byDay.set(key, rec);
        }
      }
      console.log(`[DDD] Activities section @${section.offset}: Gen1-style VU parser found ${gen1Parsed.length} days`);
      continue;
    }

    // Strategy 2: Cyclic buffer / forward scan (Card data or fallback)
    const structuredParsed = parseActivities(data);
    let allParsed = structuredParsed;
    let source = 'structured';

    if (structuredParsed.length === 0) {
      const rawParsed = parseRawActivitiesFile(data, []);
      if (rawParsed.length > 0) {
        allParsed = rawParsed;
        source = 'raw-scanner';
      }
    }

    if (allParsed.length === 0) {
      rejections?.push({ offset: section.offset, date: '—', reason: `Żaden parser nie znalazł rekordów (${source}), sekcja ${data.length} B` });
      console.log(`[DDD] Activities section @${section.offset}: no parseable daily records`);
      continue;
    }

    const accepted: ActivityRecord[] = [];
    for (const rec of allParsed) {
      const reason = checkPlausibility(rec, section.offset);
      if (reason) {
        const slotTotals = { driver: 0, codriver: 0 };
        for (const e of rec.entries) {
          const [hF, mF] = e.timeFrom.split(':').map(Number);
          const [hT, mT] = e.timeTo.split(':').map(Number);
          slotTotals[e.slot] += (hT * 60 + mT) - (hF * 60 + mF);
        }
        rejections?.push({
          offset: section.offset,
          date: rec.date ? rec.date.toISOString().slice(0, 10) : '—',
          reason,
          dayDistance: rec.dayDistance,
          changeCount: rec.entries.length,
          slotTotals,
        });
      } else {
        accepted.push(rec);
      }
    }

    for (const rec of accepted) {
      const key = dayKey(rec.date);
      const existing = byDay.get(key);
      if (!existing || rec.entries.length > existing.entries.length) {
        byDay.set(key, rec);
      }
    }
  }

  let records = Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  // Remove artifact records with repeated dayDistance (e.g. 768 km from chunk boundary corruption)
  records = filterDistanceArtifacts(records);

  // Keep only records within a plausible date range
  if (records.length > 0) {
    // If we have a download date from the filename, use it as hard upper bound.
    // VU stores max 56 days (Gen2v2) or 28 days (Gen1/Gen2).
    // Use 90 days as generous lower bound.
    if (downloadDate) {
      const upperTs = Math.floor(downloadDate.getTime() / 1000);
      const lowerTs = upperTs - 90 * 86400; // 90 days before download
      console.log(`[DDD] Download date filter: ${downloadDate.toISOString().slice(0, 10)}, window ${new Date(lowerTs * 1000).toISOString().slice(0, 10)} – ${downloadDate.toISOString().slice(0, 10)}`);
      records = records.filter(r => {
        const ts = Math.floor(r.date.getTime() / 1000);
        const keep = ts >= lowerTs && ts <= upperTs;
        if (!keep) {
          rejections?.push({
            offset: 0,
            date: r.date.toISOString().slice(0, 10),
            reason: `Data poza oknem pobierania (${new Date(lowerTs * 1000).toISOString().slice(0, 10)} – ${downloadDate.toISOString().slice(0, 10)})`,
            dayDistance: r.dayDistance,
            changeCount: r.entries.length,
          });
        }
        return keep;
      });
    } else {
      // Fallback: use dense timestamp anchor with 1 year window
      const timestamps = records.map(r => Math.floor(r.date.getTime() / 1000));
      const anchorTs = selectDenseTimestampAnchor(timestamps, 90 * 86400);
      const oneYearSecs = 366 * 86400;

      records = records.filter(r => {
        const ts = Math.floor(r.date.getTime() / 1000);
        const keep = Math.abs(anchorTs - ts) <= oneYearSecs;
        if (!keep) {
          rejections?.push({
            offset: 0,
            date: r.date.toISOString().slice(0, 10),
            reason: `Odrzucony przez filtr świeżości (> 1 rok od kotwicy ${new Date(anchorTs * 1000).toISOString().slice(0, 10)})`,
            dayDistance: r.dayDistance,
            changeCount: r.entries.length,
          });
        }
        return keep;
      });
    }
  }

  if (records.length === 0) {
    warnings.push({ offset: 0, message: 'Could not extract activity records from TLV sections' });
  }

  return records;
}

// ─── VU Activities Gen1-style parser (generation locking) ───────────────────
// When a Gen1 card is in a Gen2v2 VU, the data inside 0x76 0x32 TLV uses
// Gen1 flat format per Annex 1C Appendix 7 §2.2.6.2:
//   VuActivitiesFirstGen:
//     TimeReal (4B)               — reference/download date
//     OdometerValueMidnight (3B)  — reference odometer
//     VuCardIWData:
//       NoOfIWRecords (2B)
//       VuCardIWRecordFirstGen[N] — each 129B (Gen1)
//       Note: Gen2 uses 131B records (fullCardNumberAndGeneration + vuGeneration)
//       but this function is Gen1-specific fallback
//     VuActivityDailyData:
//       NoOfActivityChanges (2B)
//       ActivityChangeInfo[N]     — each 2B, FLAT across all days
//     VuPlaceDailyWorkPeriodData  — skip
//     VuSpecificConditionData     — skip
//     SignatureFirstGen (128B)    — skip

const VU_CARD_IW_RECORD_SIZE_GEN1 = 129;
// HolderName(72) + FullCardNumber(18) + ExpiryDate(4) + InsertionTime(4)
// + OdoInsertion(3) + SlotNumber(1) + WithdrawalTime(4) + OdoWithdrawal(3)
// + PreviousVehicleInfoFirstGen(19) + ManualInputFlag(1) = 129
// Gen2: +2B (fullCardNumberAndGeneration + vuGeneration) = 131B

function parseVuActivitiesGen1Style(
  data: Uint8Array,
  warnings: ParserWarning[],
  downloadDate?: Date | null
): ActivityRecord[] {
  if (data.length < 12) return [];
  const view = new DataView(toArrayBuffer(data));

  // Read TimeReal (4B) — reference timestamp
  const refTs = view.getUint32(0, false);
  if (!isValidTimestamp(refTs)) return [];

  // Read OdometerValueMidnight (3B)
  const refOdo = (data[4] << 16) | (data[5] << 8) | data[6];

  // VuCardIWData: NoOfIWRecords (2B)
  if (data.length < 9) return [];
  const noOfIWRecords = view.getUint16(7, false);
  if (noOfIWRecords > 200) {
    console.log(`[DDD] Gen1 VU: NoOfIWRecords=${noOfIWRecords} too high, aborting`);
    return [];
  }

  const cardIWDataEnd = 9 + noOfIWRecords * VU_CARD_IW_RECORD_SIZE_GEN1;
  if (cardIWDataEnd + 2 > data.length) {
    console.log(`[DDD] Gen1 VU: CardIW data exceeds buffer (need ${cardIWDataEnd + 2}, have ${data.length})`);
    return [];
  }

  // Extract per-day dates from CardIW insertion times for day-date assignment
  const cardIWDates: Date[] = [];
  for (let i = 0; i < noOfIWRecords; i++) {
    const recStart = 9 + i * VU_CARD_IW_RECORD_SIZE_GEN1;
    // CardInsertionTime is at offset 94 within record:
    // HolderName(72) + FullCardNumber(18) + ExpiryDate(4) = 94
    const insertionOffset = recStart + 72 + 18 + 4;
    if (insertionOffset + 4 <= data.length) {
      const insertTs = view.getUint32(insertionOffset, false);
      if (isValidTimestamp(insertTs)) {
        cardIWDates.push(new Date(insertTs * 1000));
      }
    }
  }

  console.log(`[DDD] Gen1 VU: refTs=${new Date(refTs * 1000).toISOString()}, refOdo=${refOdo}, noOfIWRecords=${noOfIWRecords}, cardIWDates=${cardIWDates.length}, cardIWDataEnd=${cardIWDataEnd}`);

  // VuActivityDailyData: NoOfActivityChanges (2B)
  const noOfChanges = view.getUint16(cardIWDataEnd, false);
  if (noOfChanges === 0 || noOfChanges > 50000) {
    console.log(`[DDD] Gen1 VU: NoOfActivityChanges=${noOfChanges} invalid`);
    return [];
  }

  const changesStart = cardIWDataEnd + 2;
  const changesEnd = changesStart + noOfChanges * 2;
  if (changesEnd > data.length) {
    console.log(`[DDD] Gen1 VU: activity changes exceed buffer (need ${changesEnd}, have ${data.length})`);
    return [];
  }

  console.log(`[DDD] Gen1 VU: NoOfActivityChanges=${noOfChanges}, changesStart=${changesStart}, changesEnd=${changesEnd}`);

  // Read all ActivityChangeInfo words
  const rawWords: RawActivityWord[] = [];
  for (let i = 0; i < noOfChanges; i++) {
    const word = view.getUint16(changesStart + i * 2, false);
    if (word === 0x0000 || word === 0xFFFF) continue;
    const slot = (word >> 15) & 0x01;          // bit 15: 0=driver, 1=codriver
    const drivingStatus = (word >> 14) & 0x01; // bit 14: 0=SINGLE, 1=CREW
    const cardInserted = ((word >> 13) & 0x01) === 0; // bit 13: 0=inserted, 1=not inserted
    const activity = (word >> 11) & 0x03;      // bits 12-11: activity type
    const minutes = word & 0x07FF;             // bits 10-0: minutes since 00:00
    if (minutes >= 1440) continue;
    rawWords.push({ slot, drivingStatus, cardInserted, activity, minutes });
  }

  if (rawWords.length === 0) return [];

  // Split into per-day groups by minute resets
  const dayGroups: RawActivityWord[][] = [[]];
  let prevMinutes = -1;
  for (const word of rawWords) {
    if (prevMinutes >= 0 && word.minutes < prevMinutes && dayGroups[dayGroups.length - 1].length > 0) {
      dayGroups.push([]);
    }
    dayGroups[dayGroups.length - 1].push(word);
    prevMinutes = word.minutes;
  }

  // Remove empty groups
  const validGroups = dayGroups.filter(g => g.length > 0);
  if (validGroups.length === 0) return [];

  // Assign dates: use download date as the newest day, count backward.
  // If no download date, use the reference TimeReal.
  const newestDate = downloadDate || new Date(refTs * 1000);
  const newestMidnight = new Date(Date.UTC(
    newestDate.getUTCFullYear(),
    newestDate.getUTCMonth(),
    newestDate.getUTCDate()
  ));

  // Try to use CardIW dates for better day-date assignment
  // Extract unique days from CardIW insertion times
  const cardIWDaySet = new Set<string>();
  for (const d of cardIWDates) {
    cardIWDaySet.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
  }
  const cardIWUniqueDays = Array.from(cardIWDaySet).sort();
  console.log(`[DDD] Gen1 VU: ${validGroups.length} day groups, ${cardIWUniqueDays.length} unique CardIW days`);

  const records: ActivityRecord[] = [];
  for (let i = 0; i < validGroups.length; i++) {
    // Assign dates backward from newest
    const dayOffset = validGroups.length - 1 - i;
    const date = new Date(newestMidnight.getTime() - dayOffset * 86400000);
    const entries = decodeActivityEntries(validGroups[i]);

    if (entries.length === 0) continue;

    // Validate slot totals
    const slotTotals = { driver: 0, codriver: 0 };
    let valid = true;
    for (const e of entries) {
      const [hF, mF] = e.timeFrom.split(':').map(Number);
      const [hT, mT] = e.timeTo.split(':').map(Number);
      const dur = (hT * 60 + mT) - (hF * 60 + mF);
      if (dur <= 0 || dur > 1440) { valid = false; break; }
      slotTotals[e.slot] += dur;
    }
    if (!valid || slotTotals.driver > 1440 || slotTotals.codriver > 1440) continue;

    records.push({ date, dailyPresenceCounter: 0, dayDistance: 0, entries });
  }

  console.log(`[DDD] Gen1 VU parser: ${records.length} valid activity days from ${rawWords.length} activity words`);
  return records;
}

// ─── VU Activities RecordArray parser (Gen2/Gen2v2) ─────────────────────────
// Per Annex 1C Appendix 7, VuActivitiesSecondGen(V2) is a sequence of RecordArrays:
//   DateOfDayDownloaded (type=0x06): N dates (4B each = TimeReal)
//   OdometerValueMidnight (type=0x05): N odometers (3B each = OdometerShort)
//   VuCardIWRecord (type=0x0d): M card insertion/withdrawal records (skip)
//   ActivityChangeInfo (type=0x01): K activity words (2B each, FLAT for all days)
//   VuPlaceDailyWorkPeriod (type=0x1c): place records (skip)
//   VuGNSSADRecord (type=0x16): GNSS records (skip)
//   VuSpecificConditionRecord (type=0x09): specific condition records (skip)
//   Signature (type=0x08): signature (skip)

interface VuRecordArrayResult {
  activities: ActivityRecord[];
  borderCrossings: BorderCrossingRecord[];
  loadUnloadOperations: LoadUnloadRecord[];
}

function parseGnssPlaceAuthRecord(data: Uint8Array, offset: number, view: DataView): GnssPlaceAuthRecord {
  const ts = view.getUint32(offset, false);
  const gnssAccuracy = data[offset + 4];
  // GeoCoordinates: latitude (3B signed) + longitude (3B signed)
  // 1/10 minute-of-arc encoding: value * 1/600 = degrees
  const latRaw = (data[offset + 5] << 16) | (data[offset + 6] << 8) | data[offset + 7];
  const lonRaw = (data[offset + 8] << 16) | (data[offset + 9] << 8) | data[offset + 10];
  // Sign-extend 24-bit to 32-bit
  const latSigned = latRaw & 0x800000 ? latRaw - 0x1000000 : latRaw;
  const lonSigned = lonRaw & 0x800000 ? lonRaw - 0x1000000 : lonRaw;
  const latitude = latSigned / 600;
  const longitude = lonSigned / 600;
  const authByte = data[offset + 11];
  const authenticationStatus: GnssPlaceAuthRecord['authenticationStatus'] =
    authByte === 0x01 ? 'authenticated' : authByte === 0x00 ? 'not_authenticated' : 'unknown';

  return {
    timestamp: isValidTimestamp(ts) ? new Date(ts * 1000) : null,
    gnssAccuracy,
    latitude: latRaw === 0x7FFFFF ? 0 : latitude,
    longitude: lonRaw === 0x7FFFFF ? 0 : longitude,
    authenticationStatus,
  };
}

function parseVuActivitiesRecordArrays(data: Uint8Array, warnings: ParserWarning[]): VuRecordArrayResult {
  const view = new DataView(toArrayBuffer(data));
  let pos = 0;

  const dates: Date[] = [];
  const odometers: number[] = [];
  const activityWords: RawActivityWord[] = [];
  const borderCrossings: BorderCrossingRecord[] = [];
  const loadUnloadOperations: LoadUnloadRecord[] = [];
  const recordArraysFound: string[] = [];

  // Parse sequential RecordArrays
  while (pos + 5 <= data.length) {
    const recordType = data[pos];
    const recordSize = view.getUint16(pos + 1, false);
    const noOfRecords = view.getUint16(pos + 3, false);

    // Validate RecordArray header
    if (recordSize === 0 || noOfRecords > 50000) break;
    const totalDataSize = noOfRecords * recordSize;
    if (pos + 5 + totalDataSize > data.length) {
      // Allow partial last array
      break;
    }

    const arrayStart = pos + 5;
    recordArraysFound.push(`type=0x${recordType.toString(16).padStart(2, '0')}, size=${recordSize}, count=${noOfRecords}`);

    switch (recordType) {
      case 0x06: // DateOfDayDownloaded — TimeReal (4B)
        if (recordSize === 4) {
          for (let i = 0; i < noOfRecords; i++) {
            const ts = view.getUint32(arrayStart + i * 4, false);
            if (isValidTimestamp(ts)) {
              dates.push(new Date(ts * 1000));
            }
          }
        }
        break;

      case 0x05: // OdometerValueMidnight — OdometerShort (3B)
        if (recordSize === 3) {
          for (let i = 0; i < noOfRecords; i++) {
            const off = arrayStart + i * 3;
            const odo = (data[off] << 16) | (data[off + 1] << 8) | data[off + 2];
            if (odo !== 0xFFFFFF) {
              odometers.push(odo);
            } else {
              odometers.push(0);
            }
          }
        }
        break;

      case 0x01: // ActivityChangeInfo (2B)
        if (recordSize === 2) {
          for (let i = 0; i < noOfRecords; i++) {
            const word = view.getUint16(arrayStart + i * 2, false);
            if (word === 0x0000 || word === 0xFFFF) continue;
            const slot = (word >> 15) & 0x01;
            const drivingStatus = (word >> 14) & 0x01;
            const cardInserted = ((word >> 13) & 0x01) === 0;
            const activity = (word >> 11) & 0x03;
            const minutes = word & 0x07FF;
            if (minutes >= 1440) continue;
            activityWords.push({ slot, drivingStatus, cardInserted, activity, minutes });
          }
        }
        break;

      // Known RecordArray types from TREP 32h (Activities) per Appendix 7:
      // 0x0D — VuCardIWRecordArray (skip, parsed separately in Gen1 path)
      // 0x1C — VuPlaceDailyWorkPeriodRecordArray (places, TODO: parse)
      // 0x16 — VuGNSSADRecordArray (GNSS accumulated driving, TODO: parse)
      // 0x09 — VuSpecificConditionRecordArray (specific conditions, skip)
      // 0x08 — SignatureRecordArray (digital signature, skip)

      case 0x22: // VuBorderCrossingRecordArray (55B per record)
        for (let i = 0; i < noOfRecords; i++) {
          const recOff = arrayStart + i * recordSize;
          if (recOff + 17 > data.length) break; // minimum: 2B countries + 12B gnssPlace + 3B odo
          const countryLeft = NATION_CODES[data[recOff]] || `0x${data[recOff].toString(16)}`;
          const countryEntered = NATION_CODES[data[recOff + 1]] || `0x${data[recOff + 1].toString(16)}`;
          const gnssPlace = parseGnssPlaceAuthRecord(data, recOff + 2, view);
          const odoOff = recOff + 14;
          const vehicleOdometerValue = (data[odoOff] << 16) | (data[odoOff + 1] << 8) | data[odoOff + 2];
          // Skip records with no valid timestamp
          if (!gnssPlace.timestamp) continue;
          borderCrossings.push({ countryLeft, countryEntered, gnssPlace, vehicleOdometerValue });
        }
        break;

      case 0x23: // VuLoadUnloadRecordArray (58B per record)
        for (let i = 0; i < noOfRecords; i++) {
          const recOff = arrayStart + i * recordSize;
          if (recOff + 16 > data.length) break; // minimum: 1B type + 12B gnssPlace + 3B odo
          const opByte = data[recOff];
          const operationType: LoadUnloadRecord['operationType'] =
            opByte === 0x01 ? 'loading' : opByte === 0x02 ? 'unloading' :
            opByte === 0x03 ? 'simultaneous' : 'unknown';
          const gnssPlace = parseGnssPlaceAuthRecord(data, recOff + 1, view);
          const odoOff = recOff + 13;
          const vehicleOdometerValue = (data[odoOff] << 16) | (data[odoOff + 1] << 8) | data[odoOff + 2];
          if (!gnssPlace.timestamp) continue;
          loadUnloadOperations.push({ operationType, gnssPlace, vehicleOdometerValue });
        }
        break;

      default:
        break;
    }

    pos = arrayStart + totalDataSize;
  }

  console.log(`[DDD] VU RecordArrays: ${recordArraysFound.length} arrays found: [${recordArraysFound.join('; ')}]`);
  console.log(`[DDD] VU RecordArrays: ${dates.length} dates, ${odometers.length} odometers, ${activityWords.length} activity words`);

  if (dates.length === 0 || activityWords.length === 0) {
    return { activities: [], borderCrossings, loadUnloadOperations };
  }

  // Split flat activity words into per-day groups.
  // Day boundaries are detected when the minutes value DECREASES
  // (e.g., from 1200 back to 0 = new day).
  const dayGroups: RawActivityWord[][] = [[]];
  let prevMinutes = -1;
  for (const word of activityWords) {
    if (prevMinutes >= 0 && word.minutes < prevMinutes && dayGroups[dayGroups.length - 1].length > 0) {
      dayGroups.push([]);
    }
    dayGroups[dayGroups.length - 1].push(word);
    prevMinutes = word.minutes;
  }

  // If the number of day groups doesn't match dates, try to align.
  // In most cases they should match, but edge cases exist.
  const records: ActivityRecord[] = [];
  const numDays = Math.min(dates.length, dayGroups.length);

  for (let i = 0; i < numDays; i++) {
    const date = dates[i];
    const dayDistance = (i < odometers.length - 1)
      ? Math.max(0, odometers[i + 1] - odometers[i])
      : 0;
    const rawEntries = dayGroups[i];
    const entries = decodeActivityEntries(rawEntries);

    if (entries.length === 0) continue;

    // Validate slot totals
    const slotTotals = { driver: 0, codriver: 0 };
    let valid = true;
    for (const e of entries) {
      const [hF, mF] = e.timeFrom.split(':').map(Number);
      const [hT, mT] = e.timeTo.split(':').map(Number);
      const dur = (hT * 60 + mT) - (hF * 60 + mF);
      if (dur <= 0 || dur > 1440) { valid = false; break; }
      slotTotals[e.slot] += dur;
    }
    if (!valid || slotTotals.driver > 1440 || slotTotals.codriver > 1440) continue;

    // BCD-decode dailyPresenceCounter if we had it (not in RecordArray format)
    records.push({ date, dailyPresenceCounter: 0, dayDistance, entries });
  }

  // If we got fewer days than expected, log it
  if (dayGroups.length !== dates.length) {
    console.log(`[DDD] VU RecordArrays: day groups (${dayGroups.length}) ≠ dates (${dates.length}), used min=${numDays}`);
  }

  console.log(`[DDD] VU RecordArrays: parsed ${records.length} activity days`);
  return { activities: records, borderCrossings, loadUnloadOperations };
}

type RawActivityWord = {
  slot: number;
  drivingStatus: number; // bit 14: 0=SINGLE, 1=CREW
  cardInserted: boolean;
  activity: number;
  minutes: number;
};

function decodeActivityEntries(rawEntries: RawActivityWord[]): ActivityChangeEntry[] {
  const statusMap: Record<number, ActivityChangeEntry['status']> = {
    0: 'break',
    1: 'availability',
    2: 'work',
    3: 'driving',
  };

  const entries: ActivityChangeEntry[] = [];

  for (const slot of [0, 1] as const) {
    // Annex 1C data can arrive newest→oldest in cyclic buffers.
    // Normalize to chronological order per slot before computing durations.
    const slotEntries = rawEntries
      .filter((e) => e.slot === slot)
      .sort((a, b) => a.minutes - b.minutes);

    for (let i = 0; i < slotEntries.length; i++) {
      const current = slotEntries[i];
      const nextMinutes = slotEntries[i + 1]?.minutes ?? 1440;
      if (current.minutes >= nextMinutes) continue;

      const hFrom = Math.floor(current.minutes / 60);
      const mFrom = current.minutes % 60;
      const hTo = Math.floor(Math.min(nextMinutes, 1440) / 60);
      const mTo = Math.min(nextMinutes, 1440) % 60;

      // Determine drivingStatus for this time segment: use the latest known value from this slot
      const drivingStatusValue = current.drivingStatus === 1 ? 'crew' as const : 'single' as const;

      entries.push({
        slot: slot === 0 ? 'driver' : 'codriver',
        drivingStatus: drivingStatusValue,
        status: statusMap[current.activity] || 'unknown',
        cardInserted: current.cardInserted,
        minutes: current.minutes,
        timeFrom: `${hFrom.toString().padStart(2, '0')}:${mFrom.toString().padStart(2, '0')}`,
        timeTo: `${hTo.toString().padStart(2, '0')}:${mTo.toString().padStart(2, '0')}`,
      });
    }
  }

  return entries.sort((a, b) => {
    if (a.minutes !== b.minutes) return a.minutes - b.minutes;
    if (a.slot === b.slot) return 0;
    return a.slot === 'driver' ? -1 : 1;
  });
}

// ─── Raw activities file parser ──────────────────────────────────────────────

function parseRawActivitiesFile(bytes: Uint8Array, warnings: ParserWarning[]): ActivityRecord[] {
  const records: ActivityRecord[] = [];
  if (bytes.length < 12) return records;

  const view = new DataView(toArrayBuffer(bytes));
  const r = new BinaryReader(toArrayBuffer(bytes));

  // Scan for valid timestamps. For each candidate, check if 4 bytes before
  // contain a valid recordLength (CardActivityDailyRecord format).
  // If so, derive activityChangeCount from (recordLength - 8) / 2.
  // Otherwise fall back to reading offset+8 as a heuristic count.
  const dayPositions: Array<{ pos: number; count: number }> = [];
  for (let i = 0; i < bytes.length - 10; i++) {
    const ts = view.getUint32(i, false);
    if (!isValidTimestamp(ts)) continue;
    const dist = view.getUint16(i + 6, false);
    if (dist > 9999) continue;

    // Try to derive count from recordLength prefix (4 bytes before timestamp)
    let activityChangeCount = -1;
    if (i >= 4) {
      const recLen = view.getUint16(i - 2, false);
      const prevLen = view.getUint16(i - 4, false);
      if (recLen >= 8 && recLen <= 3000 && prevLen <= 3000) {
        const derived = Math.floor((recLen - 8) / 2);
        if (derived >= 0 && derived <= 1440 && i + 8 + derived * 2 <= bytes.length) {
          activityChangeCount = derived;
        }
      }
    }

    // Fallback: read offset+8 as explicit count (legacy heuristic)
    if (activityChangeCount < 0) {
      if (i + 10 <= bytes.length) {
        const changes = view.getUint16(i + 8, false);
        if (changes <= 1440 && i + 10 + changes * 2 <= bytes.length) {
          activityChangeCount = changes;
        }
      }
    }

    if (activityChangeCount >= 0) {
      dayPositions.push({ pos: i, count: activityChangeCount });
    }
  }

  for (const { pos, count } of dayPositions) {
    r.position = pos;
    try {
      const tsValue = r.readUint32();
      const ts = new Date(tsValue * 1000);
      const dailyPresenceCounter = r.readUint16();
      const dayDistance = r.readUint16();

      // Check if count was derived from recordLength (no explicit count field in stream)
      // vs fallback (where we consumed a count word). If derived from recordLength,
      // the stream is already at the first ActivityChangeInfo word. If fallback,
      // we need to skip the 2-byte "count" that is actually the first activity word.
      // Since we always position at the timestamp and read 8 bytes (ts+counter+dist),
      // we're now at offset+8. For length-prefix records, this IS the first activity word.
      // For fallback, the "count" at offset+8 was already read as dayDistance... no:
      // ts=4, counter=2, dist=2 = 8 bytes, so r.position = pos+8.
      // If count came from recordLength, activities start at pos+8 (correct).
      // If count came from fallback heuristic (reading pos+8 as count), we need to skip 2.
      const hasLengthPrefix = pos >= 4 && (() => {
        const recLen = view.getUint16(pos - 2, false);
        const prevLen = view.getUint16(pos - 4, false);
        return recLen >= 8 && recLen <= 3000 && prevLen <= 3000 &&
               Math.floor((recLen - 8) / 2) === count;
      })();

      if (!hasLengthPrefix) {
        // Skip the 2-byte "count" field (legacy format)
        r.position = pos + 10;
      }

      const rawEntries: RawActivityWord[] = [];
      for (let i = 0; i < count && r.remaining >= 2; i++) {
        const word = r.readUint16();
        if (word === 0x0000 || word === 0xFFFF) continue; // skip padding/invalid
        const slot = (word >> 15) & 0x01;
        const drivingStatus = (word >> 14) & 0x01;
        const cardInserted = ((word >> 13) & 0x01) === 0;
        const activity = (word >> 11) & 0x03;
        const minutes = word & 0x07FF;
        if (minutes >= 1440) continue;
        rawEntries.push({ slot, drivingStatus, cardInserted, activity, minutes });
      }

      const entries = decodeActivityEntries(rawEntries);

      // Validate: total minutes per slot must not exceed 1440
      const slotTotals = { 0: 0, 1: 0 };
      for (const e of entries) {
        const [hF, mF] = e.timeFrom.split(':').map(Number);
        const [hT, mT] = e.timeTo.split(':').map(Number);
        const dur = (hT * 60 + mT) - (hF * 60 + mF);
        slotTotals[e.slot === 'driver' ? 0 : 1] += dur;
      }
      if (slotTotals[0] > 1440 || slotTotals[1] > 1440) continue;

      records.push({ date: ts, dailyPresenceCounter, dayDistance, entries });
    } catch {
      continue;
    }
  }

  // Deduplicate by day+presence and keep richer record, then sort
  const unique = new Map<string, ActivityRecord>();
  for (const rec of records) {
    const key = `${rec.date.getTime()}-${rec.dailyPresenceCounter}`;
    const existing = unique.get(key);
    if (!existing || rec.entries.length > existing.entries.length) {
      unique.set(key, rec);
    }
  }

  const deduped = Array.from(unique.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  if (deduped.length === 0) {
    warnings.push({ offset: 0, message: 'Could not extract activity records from raw file' });
  }

  return filterDistanceArtifacts(deduped);
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
  if (data.length < 12) return records;

  const view = new DataView(toArrayBuffer(data));

  // ─── Strategy 1: Cyclic buffer with pointer-based backward traversal ───
  // CardDriverActivity layout (Annex 1C):
  //   oldestDayRecordPointer  2B  (offset into cyclic buffer body)
  //   newestDayRecordPointer  2B  (offset into cyclic buffer body)
  //   activityDailyRecords[]  ...  (cyclic body)
  //
  // Each CardActivityDailyRecord:
  //   previousRecordLength  2B
  //   recordLength          2B   (covers date..activityChangeInfo[])
  //   activityRecordDate    4B
  //   dailyPresenceCounter  2B   (BCD)
  //   activityDayDistance    2B
   //   activityChangeInfo[N] N×2B  where N = (recordLength - 12) / 2
   //   NOTE: recordLength INCLUDES the 4-byte header (prevLen + recLen)

  // Detect cyclic header: try common header offsets
  for (const headerOffset of [0, 5, 3, 8, 12]) {
    if (headerOffset + 4 > data.length) continue;

    const oldestPtr = view.getUint16(headerOffset, false);
    const newestPtr = view.getUint16(headerOffset + 2, false);
    const bodyStart = headerOffset + 4;
    const bodyLen = data.length - bodyStart;

    if (bodyLen < 12) continue;
    // Allow oldestPtr to be out of bounds (truncated download of a larger card EF).
    // We only need newestPtr to be valid to traverse backward.
    if (newestPtr >= bodyLen) continue;

    // Validate: there should be a valid record at newestPtr
    const newestAbsPos = bodyStart + newestPtr;
    if (newestAbsPos + 12 > data.length) continue;
    const recLen = view.getUint16(newestAbsPos + 2, false);
    if (recLen < 12 || recLen > 3000) {
      console.log(`[DDD] Cyclic probe off=${headerOffset}: newest=${newestPtr}, recLen=${recLen} FAIL(range)`);
      continue;
    }
    const ts = view.getUint32(newestAbsPos + 4, false);
    if (!isValidTimestamp(ts)) {
      console.log(`[DDD] Cyclic probe off=${headerOffset}: newest=${newestPtr}, recLen=${recLen}, ts=0x${ts.toString(16)} FAIL(ts)`);
      continue;
    }

    // Valid cyclic buffer found — traverse backward from newest
    console.log(`[DDD] Cyclic header found: headerOffset=${headerOffset}, oldest=${oldestPtr}, newest=${newestPtr}, bodyLen=${bodyLen}, recLen=${recLen}, ts=${ts} (${new Date(ts*1000).toISOString()})`);
    const cyclicRecords = parseCyclicActivities(data, bodyStart, bodyLen, newestPtr);
    console.log(`[DDD] Cyclic traversal result: ${cyclicRecords.length} records`);
    if (cyclicRecords.length > 0) return cyclicRecords;
  }

  // ─── Strategy 2: Forward scan (fallback for non-cyclic or TLV data) ───
  return parseActivitiesForward(data);
}

/** Traverse cyclic buffer backward from newestPtr, extracting daily records. */
function parseCyclicActivities(
  data: Uint8Array, bodyStart: number, bodyLen: number, newestPtr: number
): ActivityRecord[] {
  const records: ActivityRecord[] = [];
  let pos = newestPtr;
  const maxIter = 400; // guard against infinite loops

  for (let iter = 0; iter < maxIter; iter++) {
    // Extract record bytes with wrap-around
    const recBytes = readCyclicBytes(data, bodyStart, bodyLen, pos, 4);
    if (!recBytes) break;

    const prevRecLen = (recBytes[0] << 8) | recBytes[1];
    const recLen = (recBytes[2] << 8) | recBytes[3];

    if (recLen < 12 || recLen > 3000) break;
    if (prevRecLen > 3000) break;

    // recordLength INCLUDES the 4-byte header (prevLen+recLen) per tachograph-go reference
    // Read full record as recLen bytes from pos (header is inside)
    const body = readCyclicBytes(data, bodyStart, bodyLen, pos, recLen);
    if (!body) break;

    // date at offset 4, counter at 8, distance at 10
    const tsValue = (body[4] << 24) | (body[5] << 16) | (body[6] << 8) | body[7];
    if (tsValue === 0 || tsValue === 0xFFFFFFFF || !isValidTimestamp(tsValue)) break;
    const date = new Date(tsValue * 1000);

    // DailyPresenceCounter — BCD encoded (2 bytes)
    const dailyPresenceCounter = decodeBcd(body[8]) * 100 + decodeBcd(body[9]);
    const dayDistance = (body[10] << 8) | body[11];
    if (dayDistance > 9999) break;

    // N = (totalLength - 4(header) - 4(date) - 2(counter) - 2(distance)) / 2
    const activityChangeCount = Math.floor((recLen - 12) / 2);
    const rawEntries: RawActivityWord[] = [];

    for (let i = 0; i < activityChangeCount; i++) {
      const off = 12 + i * 2;
      if (off + 1 >= body.length) break;
      const word = (body[off] << 8) | body[off + 1];
      // Skip padding/invalid entries per tachograph-go reference
      if (word === 0x0000 || word === 0xFFFF) continue;
      const slot = (word >> 15) & 0x01;
      const drivingStatus = (word >> 14) & 0x01;
      const cardInserted = ((word >> 13) & 0x01) === 0;
      const activity = (word >> 11) & 0x03;
      const minutes = word & 0x07FF;
      if (minutes >= 1440) continue;
      rawEntries.push({ slot, drivingStatus, cardInserted, activity, minutes });
    }

    const entries = decodeActivityEntries(rawEntries);
    records.push({ date, dailyPresenceCounter, dayDistance, entries });

    // Move backward: previousRecordLength bytes before current position
    if (prevRecLen === 0) break; // oldest record reached
    pos = ((pos - prevRecLen) % bodyLen + bodyLen) % bodyLen;

    // Safety: if we've looped back to newest, stop
    if (pos === newestPtr && iter > 0) break;
  }

  // Records were collected newest-first; reverse for chronological order
  records.reverse();

  // Deduplicate by date+counter
  const unique = new Map<string, ActivityRecord>();
  for (const rec of records) {
    const key = `${rec.date.getTime()}-${rec.dailyPresenceCounter}`;
    const existing = unique.get(key);
    if (!existing || rec.entries.length > existing.entries.length) {
      unique.set(key, rec);
    }
  }
  return filterDistanceArtifacts(Array.from(unique.values()).sort((a, b) => a.date.getTime() - b.date.getTime()));
}

/** Read `len` bytes from a cyclic buffer with wrap-around. Returns null if len is too large. */
function readCyclicBytes(
  data: Uint8Array, bodyStart: number, bodyLen: number, offset: number, len: number
): Uint8Array | null {
  if (len > bodyLen || len <= 0) return null;
  const result = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = data[bodyStart + ((offset + i) % bodyLen)];
  }
  return result;
}

/** Decode a BCD-encoded byte (e.g. 0x39 → 39). */
function decodeBcd(byte: number): number {
  return ((byte >> 4) & 0x0F) * 10 + (byte & 0x0F);
}

/** Forward scan fallback for parseActivities (non-cyclic data). */
function parseActivitiesForward(data: Uint8Array): ActivityRecord[] {
  const records: ActivityRecord[] = [];
  const r = new BinaryReader(toArrayBuffer(data));
  const view = new DataView(toArrayBuffer(data));

  // Scan ALL possible offsets for a valid record header (prevLen + recLen + valid timestamp).
  // The data may contain TRTP prefixes, partial records, or variable-length headers,
  // so fixed skip offsets are not reliable.
  let startPos = -1;
  for (let skip = 0; skip <= Math.min(40, data.length - 12); skip++) {
    const prevLen = view.getUint16(skip, false);
    const recLen = view.getUint16(skip + 2, false);
    if (recLen < 12 || recLen > 3000) continue;
    if (prevLen > 3000) continue;

    const ts = view.getUint32(skip + 4, false);
    if (!isValidTimestamp(ts)) continue;

    // recordLength includes the 4-byte header; (recLen - 12) must be even
    if ((recLen - 12) % 2 !== 0) continue;

    const dist = view.getUint16(skip + 10, false);
    if (dist > 9999) continue;

    // Verify the NEXT record also looks valid (to avoid false positives)
    // Next record starts at skip + recLen (recLen includes header)
    const nextRecordStart = skip + recLen;
    if (nextRecordStart + 12 <= data.length) {
      const nextPrevLen = view.getUint16(nextRecordStart, false);
      const nextRecLen = view.getUint16(nextRecordStart + 2, false);
      const nextTs = view.getUint32(nextRecordStart + 4, false);
      if (nextRecLen >= 12 && nextRecLen <= 3000 && nextPrevLen <= 3000 &&
          isValidTimestamp(nextTs) && (nextRecLen - 12) % 2 === 0) {
        startPos = skip;
        break;
      }
    } else {
      // Last record in buffer — accept without next-record validation
      startPos = skip;
      break;
    }
  }
  if (startPos < 0) return records;
  r.position = startPos;

  while (r.remaining >= 12) {
    try {
      const recordStart = r.position;
      const previousRecordLength = r.readUint16();
      const recordLength = r.readUint16();
      if (recordLength < 12 || recordLength > 3000) break;
      if (previousRecordLength > 3000) break;
      if ((recordLength - 12) % 2 !== 0) break;

      const tsValue = r.readUint32();
      if (tsValue === 0 || tsValue === 0xFFFFFFFF || !isValidTimestamp(tsValue)) break;
      const date = new Date(tsValue * 1000);

      const dailyPresenceCounter = r.readUint16();
      const dayDistance = r.readUint16();
      if (dayDistance > 9999) break;

      const activityChangeCount = Math.floor((recordLength - 12) / 2);
      if (activityChangeCount > 1440 || activityChangeCount < 0) break;

      const rawEntries: RawActivityWord[] = [];
      for (let i = 0; i < activityChangeCount && r.remaining >= 2; i++) {
        const word = r.readUint16();
        if (word === 0x0000 || word === 0xFFFF) continue; // skip padding
        const slot = (word >> 15) & 0x01;
        const drivingStatus = (word >> 14) & 0x01;
        const cardInserted = ((word >> 13) & 0x01) === 0;
        const activity = (word >> 11) & 0x03;
        const minutes = word & 0x07FF;
        if (minutes >= 1440) continue;
        rawEntries.push({ slot, drivingStatus, cardInserted, activity, minutes });
      }

      // recordLength includes the 4-byte header, so next record starts at recordStart + recordLength
      r.position = recordStart + recordLength;
      const entries = decodeActivityEntries(rawEntries);
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
