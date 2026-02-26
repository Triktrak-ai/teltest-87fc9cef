export type SessionStatus =
  | "connecting"
  | "auth_gen1"
  | "auth_gen2v1"
  | "auth_gen2v2"
  | "downloading"
  | "completed"
  | "error"
  | "waiting";

export interface TachoSession {
  id: string;
  imei: string;
  vehiclePlate: string;
  status: SessionStatus;
  generation: "Gen1" | "Gen2v1" | "Gen2v2";
  progress: number;
  filesDownloaded: number;
  totalFiles: number;
  startedAt: string;
  lastActivity: string;
  errorCode?: string;
}

export interface EventLog {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  imei: string;
  message: string;
}

export const mockSessions: TachoSession[] = [
  {
    id: "s1",
    imei: "352093089012345",
    vehiclePlate: "WA 1234X",
    status: "auth_gen2v2",
    generation: "Gen2v2",
    progress: 0,
    filesDownloaded: 0,
    totalFiles: 0,
    startedAt: "2026-02-26T07:45:12Z",
    lastActivity: "2026-02-26T07:45:30Z",
  },
  {
    id: "s2",
    imei: "352093089054321",
    vehiclePlate: "KR 5678Y",
    status: "downloading",
    generation: "Gen2v2",
    progress: 65,
    filesDownloaded: 4,
    totalFiles: 6,
    startedAt: "2026-02-26T07:30:00Z",
    lastActivity: "2026-02-26T07:44:55Z",
  },
  {
    id: "s3",
    imei: "352093089067890",
    vehiclePlate: "GD 9012Z",
    status: "completed",
    generation: "Gen1",
    progress: 100,
    filesDownloaded: 4,
    totalFiles: 4,
    startedAt: "2026-02-26T07:10:00Z",
    lastActivity: "2026-02-26T07:25:33Z",
  },
  {
    id: "s4",
    imei: "352093089011111",
    vehiclePlate: "PO 3456A",
    status: "error",
    generation: "Gen2v2",
    progress: 0,
    filesDownloaded: 0,
    totalFiles: 0,
    startedAt: "2026-02-26T07:40:00Z",
    lastActivity: "2026-02-26T07:41:12Z",
    errorCode: "020A",
  },
  {
    id: "s5",
    imei: "352093089022222",
    vehiclePlate: "LU 7890B",
    status: "auth_gen1",
    generation: "Gen1",
    progress: 0,
    filesDownloaded: 0,
    totalFiles: 0,
    startedAt: "2026-02-26T07:46:00Z",
    lastActivity: "2026-02-26T07:46:05Z",
  },
  {
    id: "s6",
    imei: "352093089033333",
    vehiclePlate: "SZ 2345C",
    status: "waiting",
    generation: "Gen2v1",
    progress: 0,
    filesDownloaded: 0,
    totalFiles: 0,
    startedAt: "2026-02-26T07:35:00Z",
    lastActivity: "2026-02-26T07:42:00Z",
  },
];

export const mockEvents: EventLog[] = [
  { id: "e1", timestamp: "07:46:05", type: "info", imei: "...22222", message: "STATUS received — Features: 0x01, Ignition: ON" },
  { id: "e2", timestamp: "07:45:30", type: "info", imei: "...12345", message: "Gen2v2 AUTH — APDU exchange in progress (payload 0x12)" },
  { id: "e3", timestamp: "07:44:55", type: "success", imei: "...54321", message: "File 4/6 downloaded — VU_Activities_2026.DDD (128 KB)" },
  { id: "e4", timestamp: "07:42:00", type: "warning", imei: "...33333", message: "Wait Request sent (0x91) — retry in 5 min" },
  { id: "e5", timestamp: "07:41:12", type: "error", imei: "...11111", message: "ERROR 020A — Gen2v2 authentication failed (certificate rejected)" },
  { id: "e6", timestamp: "07:25:33", type: "success", imei: "...67890", message: "Session completed — 4 files downloaded (Gen1)" },
  { id: "e7", timestamp: "07:25:00", type: "info", imei: "...67890", message: "File Data EOF received — all files transferred" },
  { id: "e8", timestamp: "07:10:05", type: "info", imei: "...67890", message: "Connection established — Gen1 device detected" },
];
