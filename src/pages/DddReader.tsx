import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Radio, Upload, FileText, ArrowLeft, Activity, AlertTriangle, Wrench, Gauge, Search, X, Plus, CreditCard, MapPin, Car, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Globe, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseDddFile, mergeDddData, emptyDddData, type DddFileData, type DddSection, type DriverCardData, type RawFileBuffer, type ActivityRejection } from "@/lib/ddd-parser";
import ActivityTimeline from "@/components/ActivityTimeline";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { listDddFiles, downloadDddFile } from "@/lib/ddd-storage";
import { toast } from "sonner";



const formatDate = (d: Date | null) => d ? d.toLocaleDateString("pl-PL") : "—";
const formatDateTime = (d: Date | null) => d ? d.toLocaleString("pl-PL") : "—";

const hexDump = (data: Uint8Array, maxBytes = 32): string => {
  const slice = data.slice(0, maxBytes);
  return Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
};

const formatHexDumpBlock = (data: Uint8Array, startOffset = 0, endOffset?: number): string => {
  const end = Math.min(endOffset ?? (startOffset + 200), data.length);
  const start = Math.max(0, Math.min(startOffset, data.length));
  const slice = data.slice(start, end);
  const lines: string[] = [];
  for (let i = 0; i < slice.length; i += 16) {
    const row = slice.slice(i, i + 16);
    const offset = (start + i).toString(16).padStart(6, '0');
    const hex = Array.from(row).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(row).map(b => (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : '.').join('');
    lines.push(`${offset}  ${hex.padEnd(48)}  |${ascii}|`);
  }
  return lines.join('\n');
};

const TAG_NAMES: Record<number, string> = {
  0x01: 'Cert Member State (G1)', 0x02: 'Cert VU (G1)', 0x03: 'Cert CA (G1)',
  0x05: 'Overview (G1)', 0x06: 'Activities (G1)', 0x07: 'Events & Faults (G1)',
  0x08: 'Detailed Speed (G1)', 0x09: 'Technical Data (G1)',
  0x21: 'Cert Member State (G2)', 0x22: 'Cert VU (G2)', 0x23: 'Cert CA (G2)',
  0x25: 'Overview (G2)', 0x26: 'Activities (G2)', 0x27: 'Events & Faults (G2)',
  0x28: 'Detailed Speed (G2)', 0x29: 'Technical Data (G2)',
  0x31: 'Cert CA (G2v2)', 0x32: 'Cert VU (G2v2)', 0x33: 'Cert Link (G2v2)',
  0x35: 'Overview (G2v2)', 0x36: 'Activities (G2v2)', 0x37: 'Events & Faults (G2v2)',
  0x38: 'Detailed Speed (G2v2)', 0x39: 'Technical Data (G2v2)',
};

const CHUNK_SIZES = [128, 256, 512, 1024, 2048] as const;

const HexDumpExplorer = ({ buffers }: { buffers: RawFileBuffer[] }) => {
  const [selectedFile, setSelectedFile] = useState(0);
  const [startOffset, setStartOffset] = useState(0);
  const [chunkSize, setChunkSize] = useState<number>(256);
  const [goToInput, setGoToInput] = useState("");

  const fb = buffers[selectedFile];
  const fileSize = fb?.data.length ?? 0;
  const endOffset = Math.min(startOffset + chunkSize, fileSize);

  const hexOutput = useMemo(() => {
    if (!fb) return "";
    return formatHexDumpBlock(fb.data, startOffset, endOffset);
  }, [fb, startOffset, endOffset]);

  const handleGoTo = () => {
    const parsed = parseInt(goToInput, goToInput.startsWith("0x") ? 16 : 10);
    if (!isNaN(parsed)) {
      setStartOffset(Math.max(0, Math.min(parsed, fileSize - 1)));
    }
  };

  const navigate = (dir: "first" | "prev" | "next" | "last") => {
    switch (dir) {
      case "first": setStartOffset(0); break;
      case "prev": setStartOffset(Math.max(0, startOffset - chunkSize)); break;
      case "next": setStartOffset(Math.min(fileSize - 1, startOffset + chunkSize)); break;
      case "last": setStartOffset(Math.max(0, fileSize - chunkSize)); break;
    }
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Hex dump — eksplorator plików</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* File selector */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(selectedFile)} onValueChange={(v) => { setSelectedFile(Number(v)); setStartOffset(0); }}>
            <SelectTrigger className="w-auto min-w-[200px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {buffers.map((b, i) => (
                <SelectItem key={i} value={String(i)} className="text-xs">
                  <span className="font-mono">{b.fileType}</span> — {b.fileName} ({b.data.length.toLocaleString()} B)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(chunkSize)} onValueChange={(v) => setChunkSize(Number(v))}>
            <SelectTrigger className="w-auto h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHUNK_SIZES.map(s => (
                <SelectItem key={s} value={String(s)} className="text-xs">{s} B / strona</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Navigation */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => navigate("first")} disabled={startOffset === 0}>
            <ChevronsLeft className="h-3 w-3" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => navigate("prev")} disabled={startOffset === 0}>
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span className="text-xs font-mono text-muted-foreground">
            0x{startOffset.toString(16).padStart(6, '0')} — 0x{(endOffset - 1).toString(16).padStart(6, '0')}
            <span className="ml-2">({startOffset}–{endOffset - 1} / {fileSize})</span>
          </span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => navigate("next")} disabled={endOffset >= fileSize}>
            <ChevronRight className="h-3 w-3" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => navigate("last")} disabled={endOffset >= fileSize}>
            <ChevronsRight className="h-3 w-3" />
          </Button>

          <div className="flex items-center gap-1 ml-auto">
            <Input
              className="h-7 w-28 text-xs font-mono"
              placeholder="Offset (0x...)"
              value={goToInput}
              onChange={(e) => setGoToInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGoTo()}
            />
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleGoTo}>
              Idź
            </Button>
          </div>
        </div>

        {/* Hex output */}
        <ScrollArea className="max-h-[500px]">
          <pre className="text-[10px] leading-4 font-mono bg-muted/50 rounded-md p-3 overflow-x-auto whitespace-pre">
            {hexOutput}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

const DddReader = () => {
  const [data, setData] = useState<DddFileData | null>(null);
  const [loadedFiles, setLoadedFiles] = useState<string[]>([]);
  const [error, setError] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [searchParams] = useSearchParams();
  const autoLoadedRef = useRef(false);

  const processFiles = useCallback((files: FileList | File[]) => {
    setError("");
    const fileArray = Array.from(files);
    
    let processed = 0;
    let mergedResult = data ?? emptyDddData();
    const newNames = [...loadedFiles];

    fileArray.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buf = e.target?.result as ArrayBuffer;
          const parsed = parseDddFile(buf, file.name);
          mergedResult = mergeDddData(mergedResult, parsed);
          newNames.push(file.name);
        } catch (err) {
          setError(prev => prev + (prev ? '\n' : '') + `${file.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
        processed++;
        if (processed === fileArray.length) {
          setData(mergedResult);
          setLoadedFiles([...newNames]);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }, [data, loadedFiles]);

  const clearAll = useCallback(() => {
    setData(null);
    setLoadedFiles([]);
    setError("");
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  // Auto-load from URL params (?sessionImei=...&after=...&before=...)
  useEffect(() => {
    if (autoLoadedRef.current) return;
    const imei = searchParams.get("sessionImei");
    const after = searchParams.get("after");
    const before = searchParams.get("before");
    if (!imei || !after || !before) return;
    autoLoadedRef.current = true;
    setAutoLoading(true);

    (async () => {
      try {
        const files = await listDddFiles(imei, after, before);
        if (files.length === 0) {
          toast.error("Brak plików DDD dla tej sesji");
          setAutoLoading(false);
          return;
        }
        const fileObjects: File[] = [];
        for (const f of files) {
          const buf = await downloadDddFile(imei, f.name);
          fileObjects.push(new File([buf], f.name));
        }
        processFiles(fileObjects);
        toast.success(`Załadowano ${fileObjects.length} plików z serwera`);
      } catch (err) {
        toast.error(`Błąd ładowania: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setAutoLoading(false);
      }
    })();
  }, [searchParams, processFiles]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Radio className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Czytnik DDD</h1>
              <p className="text-xs text-muted-foreground">Analiza plików DDD (VU / Karta kierowcy)</p>
            </div>
          </div>
          <Link to="/">
            <Button variant="ghost" size="sm"><ArrowLeft className="mr-1.5 h-4 w-4" />Monitor</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
          }`}
        >
          {autoLoading ? (
            <>
              <Loader2 className="mx-auto mb-3 h-10 w-10 text-primary animate-spin" />
              <p className="text-sm font-medium">Ładowanie plików z serwera…</p>
            </>
          ) : (
            <>
              <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">Przeciągnij pliki .DDD lub kliknij aby wybrać</p>
              <p className="mt-1 text-xs text-muted-foreground">Pliki VU (overview, activities, events, speed, technical) lub karty kierowcy (driver1, driver2)</p>
            </>
          )}
          {loadedFiles.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {loadedFiles.map((name, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{name}</Badge>
              ))}
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={(e) => { e.stopPropagation(); clearAll(); }}>
                <X className="mr-1 h-3 w-3" />Wyczyść
              </Button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".ddd,.DDD"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && e.target.files.length > 0 && processFiles(e.target.files)}
          />
        </div>

        {/* Load test data button (dev) */}
        {!data && !autoLoading && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={async (e) => {
                e.stopPropagation();
                const testFiles = [
                  '358480081630115_overview_20260227_030316.ddd',
                  '358480081630115_events_20260227_030447.ddd',
                  '358480081630115_activities_20260227_030429.ddd',
                  '358480081630115_speed_20260227_031233.ddd',
                  '358480081630115_technical_20260227_031247.ddd',
                ];
                try {
                  const files: File[] = [];
                  for (const name of testFiles) {
                    const res = await fetch(`/test-data/${name}`);
                    if (!res.ok) continue;
                    const buf = await res.arrayBuffer();
                    files.push(new File([buf], name));
                  }
                  if (files.length > 0) {
                    processFiles(files);
                    toast.success(`Załadowano ${files.length} plików testowych`);
                  }
                } catch (err) {
                  toast.error(`Błąd: ${err instanceof Error ? err.message : String(err)}`);
                }
              }}
            >
              <FileText className="mr-1.5 h-4 w-4" />
              Załaduj dane testowe
            </Button>
          </div>
        )}

        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {data && (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="flex-wrap">
              <TabsTrigger value="overview"><FileText className="mr-1.5 h-3.5 w-3.5" />Przegląd</TabsTrigger>
              <TabsTrigger value="activities"><Activity className="mr-1.5 h-3.5 w-3.5" />Czynności ({data.activities.length})</TabsTrigger>
              <TabsTrigger value="events"><AlertTriangle className="mr-1.5 h-3.5 w-3.5" />Zdarzenia ({data.events.length + data.faults.length})</TabsTrigger>
              <TabsTrigger value="technical"><Wrench className="mr-1.5 h-3.5 w-3.5" />Dane techniczne</TabsTrigger>
              {data.speedRecords.length > 0 && (
                <TabsTrigger value="speed"><Gauge className="mr-1.5 h-3.5 w-3.5" />Prędkość ({data.speedRecords.length})</TabsTrigger>
              )}
              {data.borderCrossings.length > 0 && (
                <TabsTrigger value="borders"><Globe className="mr-1.5 h-3.5 w-3.5" />Granice ({data.borderCrossings.length})</TabsTrigger>
              )}
              {data.loadUnloadOperations.length > 0 && (
                <TabsTrigger value="loadunload"><Package className="mr-1.5 h-3.5 w-3.5" />Załadunki ({data.loadUnloadOperations.length})</TabsTrigger>
              )}
              {data.driverCard && (
                <TabsTrigger value="drivercard"><CreditCard className="mr-1.5 h-3.5 w-3.5" />Karta kierowcy</TabsTrigger>
              )}
              <TabsTrigger value="diagnostics"><Search className="mr-1.5 h-3.5 w-3.5" />Diagnostyka ({data.rawSections.length})</TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.overview && Object.entries({
                  "Nr rejestracyjny": data.overview.vehicleRegistrationNumber || "—",
                  "Kraj": data.overview.vehicleRegistrationNation,
                  "Nr seryjny VU": data.overview.vuSerialNumber || "—",
                  "Producent": data.overview.vuManufacturerName || "—",
                  "Wersja oprogramowania": data.overview.vuSoftwareVersion || "—",
                  "Nr homologacji": data.overview.vuApprovalNumber || "—",
                  "Data pobrania": formatDateTime(data.overview.currentDateTime),
                  "Okres od": formatDate(data.overview.vuDownloadablePeriodBegin),
                  "Okres do": formatDate(data.overview.vuDownloadablePeriodEnd),
                }).map(([label, value]) => (
                  <Card key={label}>
                    <CardContent className="py-4">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 font-semibold">{value}</p>
                    </CardContent>
                  </Card>
                ))}
                <Card>
                  <CardContent className="py-4">
                    <p className="text-xs text-muted-foreground">Generacja</p>
                    <Badge variant="outline" className="mt-1">{data.generation.toUpperCase()}</Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4">
                    <p className="text-xs text-muted-foreground">Sekcje w pliku</p>
                    <p className="mt-1 font-semibold">{data.rawSections.length}</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Activities */}
            <TabsContent value="activities">
              {data.activities.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Brak danych o czynnościach</CardContent></Card>
              ) : (
                <ActivityTimeline activities={data.activities} />
              )}
            </TabsContent>

            {/* Events & Faults */}
            <TabsContent value="events">
              <div className="space-y-4">
                {data.events.length > 0 && (
                  <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm">Zdarzenia</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Typ</TableHead>
                            <TableHead>Początek</TableHead>
                            <TableHead>Koniec</TableHead>
                            <TableHead>Kierowca</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.events.map((ev, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">{ev.eventTypeName}</TableCell>
                              <TableCell className="text-xs">{formatDateTime(ev.eventBeginTime)}</TableCell>
                              <TableCell className="text-xs">{formatDateTime(ev.eventEndTime)}</TableCell>
                              <TableCell className="text-xs font-mono">{ev.cardNumberDriverSlot || "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
                {data.faults.length > 0 && (
                  <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm">Usterki</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Typ</TableHead>
                            <TableHead>Początek</TableHead>
                            <TableHead>Koniec</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.faults.map((f, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">{f.faultTypeName}</TableCell>
                              <TableCell className="text-xs">{formatDateTime(f.faultBeginTime)}</TableCell>
                              <TableCell className="text-xs">{formatDateTime(f.faultEndTime)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
                {data.events.length === 0 && data.faults.length === 0 && (
                  <Card><CardContent className="py-8 text-center text-muted-foreground">Brak zdarzeń i usterek</CardContent></Card>
                )}
              </div>
            </TabsContent>

            {/* Border Crossings */}
            <TabsContent value="borders">
              {data.borderCrossings.length > 0 ? (
                <Card>
                  <CardHeader className="py-3"><CardTitle className="text-sm">Przekroczenia granic ({data.borderCrossings.length})</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Kraj opuszczany</TableHead>
                          <TableHead>Kraj wjeżdżany</TableHead>
                          <TableHead>Pozycja</TableHead>
                          <TableHead>Przebieg</TableHead>
                          <TableHead>GNSS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.borderCrossings.map((bc, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{formatDateTime(bc.gnssPlace.timestamp)}</TableCell>
                            <TableCell className="text-xs font-semibold">{bc.countryLeft}</TableCell>
                            <TableCell className="text-xs font-semibold">{bc.countryEntered}</TableCell>
                            <TableCell className="text-xs font-mono">
                              {bc.gnssPlace.latitude !== 0 || bc.gnssPlace.longitude !== 0
                                ? `${bc.gnssPlace.latitude.toFixed(4)}°, ${bc.gnssPlace.longitude.toFixed(4)}°`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-xs">{bc.vehicleOdometerValue < 0xFFFFFF ? `${bc.vehicleOdometerValue} km` : '—'}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant={bc.gnssPlace.authenticationStatus === 'authenticated' ? 'default' : 'outline'} className="text-[10px]">
                                {bc.gnssPlace.authenticationStatus === 'authenticated' ? '✓ Auth' : bc.gnssPlace.authenticationStatus === 'not_authenticated' ? '✗ No auth' : '?'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Brak danych o przekroczeniach granic</CardContent></Card>
              )}
            </TabsContent>

            {/* Load/Unload Operations */}
            <TabsContent value="loadunload">
              {data.loadUnloadOperations.length > 0 ? (
                <Card>
                  <CardHeader className="py-3"><CardTitle className="text-sm">Operacje załadunku/rozładunku ({data.loadUnloadOperations.length})</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Data</TableHead>
                          <TableHead>Typ operacji</TableHead>
                          <TableHead>Pozycja</TableHead>
                          <TableHead>Przebieg</TableHead>
                          <TableHead>GNSS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.loadUnloadOperations.map((lu, i) => {
                          const opLabel = lu.operationType === 'loading' ? 'Załadunek' :
                            lu.operationType === 'unloading' ? 'Rozładunek' :
                            lu.operationType === 'simultaneous' ? 'Załadunek/Rozładunek' : 'Nieznany';
                          return (
                            <TableRow key={i}>
                              <TableCell className="text-xs">{formatDateTime(lu.gnssPlace.timestamp)}</TableCell>
                              <TableCell className="text-xs font-semibold">{opLabel}</TableCell>
                              <TableCell className="text-xs font-mono">
                                {lu.gnssPlace.latitude !== 0 || lu.gnssPlace.longitude !== 0
                                  ? `${lu.gnssPlace.latitude.toFixed(4)}°, ${lu.gnssPlace.longitude.toFixed(4)}°`
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-xs">{lu.vehicleOdometerValue < 0xFFFFFF ? `${lu.vehicleOdometerValue} km` : '—'}</TableCell>
                              <TableCell className="text-xs">
                                <Badge variant={lu.gnssPlace.authenticationStatus === 'authenticated' ? 'default' : 'outline'} className="text-[10px]">
                                  {lu.gnssPlace.authenticationStatus === 'authenticated' ? '✓ Auth' : lu.gnssPlace.authenticationStatus === 'not_authenticated' ? '✗ No auth' : '?'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Brak danych o załadunkach/rozładunkach</CardContent></Card>
              )}
            </TabsContent>

            <TabsContent value="technical">
              {data.technicalData ? (
                <div className="space-y-4">
                  {/* VU Identification */}
                  {data.technicalData.vuIdentification && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm">Identyfikacja VU</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
                          {[
                            { label: 'Producent', value: data.technicalData.vuIdentification.vuManufacturerName },
                            { label: 'Adres producenta', value: data.technicalData.vuIdentification.vuManufacturerAddress },
                            { label: 'Nr seryjny VU', value: data.technicalData.vuIdentification.vuSerialNumber },
                            { label: 'Nr części', value: data.technicalData.vuIdentification.vuPartNumber },
                            { label: 'Wersja oprogramowania', value: data.technicalData.vuIdentification.vuSoftwareVersion },
                            { label: 'Data produkcji', value: data.technicalData.vuIdentification.vuManufacturingDate ? formatDateTime(data.technicalData.vuIdentification.vuManufacturingDate) : '—' },
                            { label: 'Nr homologacji', value: data.technicalData.vuIdentification.vuApprovalNumber },
                          ].map((item, i) => (
                            <div key={i} className="bg-card p-3">
                              <p className="text-xs text-muted-foreground">{item.label}</p>
                              <p className="mt-0.5 font-mono text-sm font-semibold">{item.value || '—'}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Fallback serial numbers if no VU identification */}
                  {!data.technicalData.vuIdentification && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Card>
                        <CardContent className="py-4">
                          <p className="text-xs text-muted-foreground">Nr seryjny VU</p>
                          <p className="mt-1 font-mono font-semibold">{data.technicalData.vuSerialNumber || "—"}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="py-4">
                          <p className="text-xs text-muted-foreground">Nr seryjny czujnika</p>
                          <p className="mt-1 font-mono font-semibold">{data.technicalData.sensorSerialNumber || "—"}</p>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Sensors Paired */}
                  {data.technicalData.sensorsPaired.length > 0 && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm">Sparowane czujniki ({data.technicalData.sensorsPaired.length})</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nr seryjny</TableHead>
                              <TableHead>Nr homologacji</TableHead>
                              <TableHead>Data sparowania</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.technicalData.sensorsPaired.map((s, i) => (
                              <TableRow key={i}>
                                <TableCell className="font-mono text-xs">{s.sensorSerialNumber}</TableCell>
                                <TableCell className="text-xs">{s.sensorApprovalNumber || '—'}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(s.sensorPairingDate)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Calibrations */}
                  {data.technicalData.calibrations.length > 0 && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm">Kalibracje ({data.technicalData.calibrations.length})</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Cel</TableHead>
                              <TableHead>Warsztat</TableHead>
                              <TableHead>VIN</TableHead>
                              <TableHead>VRN</TableHead>
                              <TableHead>Data</TableHead>
                              <TableHead>Przebieg</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.technicalData.calibrations.map((c, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{c.calibrationPurposeName}</TableCell>
                                <TableCell className="text-xs">{c.workshopName || "—"}</TableCell>
                                <TableCell className="font-mono text-xs">{c.vehicleIdentificationNumber || "—"}</TableCell>
                                <TableCell className="text-xs">{c.vehicleRegistrationNumber || "—"}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(c.newDateTime)}</TableCell>
                                <TableCell className="text-xs">{c.newOdometerValue > 0 && c.newOdometerValue < 16777215 ? `${c.newOdometerValue} km` : "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Seals */}
                  {data.technicalData.seals.length > 0 && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm">Plomby ({data.technicalData.seals.length})</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Element</TableHead>
                              <TableHead>Identyfikator plomby</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.technicalData.seals.map((s, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{s.equipmentTypeName}</TableCell>
                                <TableCell className="font-mono text-xs">{s.sealIdentifier || '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Company Locks */}
                  {data.technicalData.companyLocks.length > 0 && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm">Blokady firmowe ({data.technicalData.companyLocks.length})</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Firma</TableHead>
                              <TableHead>Adres</TableHead>
                              <TableHead>Nr karty</TableHead>
                              <TableHead>Zablokowano</TableHead>
                              <TableHead>Odblokowano</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.technicalData.companyLocks.map((l, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{l.companyName || '—'}</TableCell>
                                <TableCell className="text-xs">{l.companyAddress || '—'}</TableCell>
                                <TableCell className="font-mono text-xs">{l.companyCardNumber || '—'}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(l.lockInTime)}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(l.lockOutTime)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Download Activities */}
                  {data.technicalData.downloadActivities.length > 0 && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm">Pobieranie danych z VU ({data.technicalData.downloadActivities.length})</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data pobrania</TableHead>
                              <TableHead>Firma / Warsztat</TableHead>
                              <TableHead>Nr karty</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.technicalData.downloadActivities.map((d, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{formatDateTime(d.downloadTimestamp)}</TableCell>
                                <TableCell className="text-xs">{d.companyOrWorkshopName || '—'}</TableCell>
                                <TableCell className="font-mono text-xs">{d.cardNumber || '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Control Activities */}
                  {data.technicalData.controlActivities.length > 0 && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm">Kontrole drogowe ({data.technicalData.controlActivities.length})</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data kontroli</TableHead>
                              <TableHead>Typ</TableHead>
                              <TableHead>Nr karty kontrolera</TableHead>
                              <TableHead>Okres od</TableHead>
                              <TableHead>Okres do</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.technicalData.controlActivities.map((c, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{formatDateTime(c.controlTimestamp)}</TableCell>
                                <TableCell className="text-xs">{c.controlTypeName}</TableCell>
                                <TableCell className="font-mono text-xs">{c.controlCardNumber || '—'}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(c.downloadPeriodBegin)}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(c.downloadPeriodEnd)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {data.technicalData.gnssRecords.length > 0 && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm">Rekordy GNSS ({data.technicalData.gnssRecords.length})</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data/czas</TableHead>
                              <TableHead>Szerokość</TableHead>
                              <TableHead>Długość</TableHead>
                              <TableHead>Przebieg</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.technicalData.gnssRecords.map((g, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{formatDateTime(g.timestamp)}</TableCell>
                                <TableCell className="font-mono text-xs">{g.latitude.toFixed(6)}°</TableCell>
                                <TableCell className="font-mono text-xs">{g.longitude.toFixed(6)}°</TableCell>
                                <TableCell className="text-xs">{g.vehicleOdometerValue > 0 ? `${g.vehicleOdometerValue} km` : '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Brak danych technicznych</CardContent></Card>
              )}
            </TabsContent>

            {/* Speed */}
            {data.speedRecords.length > 0 && (
              <TabsContent value="speed">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Szczegółowa prędkość ({data.speedRecords.length} rekordów)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.speedRecords.slice(0, 10000).map((r) => ({
                          time: r.timestamp.toLocaleTimeString("pl-PL"),
                          speed: r.speed,
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                          <YAxis unit=" km/h" tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="speed" stroke="hsl(var(--primary))" dot={false} strokeWidth={1.5} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
            {/* Driver Card */}
            {data.driverCard && (
              <TabsContent value="drivercard">
                <div className="space-y-4">
                  {/* Identification */}
                  {data.driverCard.identification && (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.entries({
                        "Numer karty": data.driverCard.identification.cardNumber || "—",
                        "Kraj wydania": data.driverCard.identification.cardIssuingMemberState,
                        "Nazwisko": data.driverCard.identification.driverName.surname || "—",
                        "Imię": data.driverCard.identification.driverName.firstName || "—",
                        "Data wydania": formatDate(data.driverCard.identification.cardIssueDate),
                        "Data ważności": formatDate(data.driverCard.identification.cardExpiryDate),
                      }).map(([label, value]) => (
                        <Card key={label}>
                          <CardContent className="py-4">
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="mt-1 font-semibold">{value}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Vehicles Used */}
                  {data.driverCard.vehiclesUsed.length > 0 && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="flex items-center gap-2 text-sm"><Car className="h-4 w-4" />Pojazdy używane ({data.driverCard.vehiclesUsed.length})</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nr rejestracyjny</TableHead>
                              <TableHead>Kraj</TableHead>
                              <TableHead>Pierwsze użycie</TableHead>
                              <TableHead>Ostatnie użycie</TableHead>
                              <TableHead>Przebieg pocz.</TableHead>
                              <TableHead>Przebieg końc.</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.driverCard.vehiclesUsed.map((v, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs font-mono">{v.vehicleRegistrationNumber || "—"}</TableCell>
                                <TableCell className="text-xs">{v.vehicleRegistrationNation}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(v.firstUse)}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(v.lastUse)}</TableCell>
                                <TableCell className="text-xs">{v.odometerBegin > 0 ? `${v.odometerBegin} km` : "—"}</TableCell>
                                <TableCell className="text-xs">{v.odometerEnd > 0 ? `${v.odometerEnd} km` : "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Places */}
                  {data.driverCard.places.length > 0 && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4" />Miejsca ({data.driverCard.places.length})</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data i czas</TableHead>
                              <TableHead>Kraj</TableHead>
                              <TableHead>Region</TableHead>
                              <TableHead>Przebieg</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.driverCard.places.map((p, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{formatDateTime(p.entryTime)}</TableCell>
                                <TableCell className="text-xs">{p.dailyWorkPeriodCountry}</TableCell>
                                <TableCell className="text-xs font-mono">{p.dailyWorkPeriodRegion}</TableCell>
                                <TableCell className="text-xs">{p.vehicleOdometerValue > 0 ? `${p.vehicleOdometerValue} km` : "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {/* Card Events/Faults */}
                  {(data.driverCard.events.length > 0 || data.driverCard.faults.length > 0) && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm">Zdarzenia i usterki karty</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Typ</TableHead>
                              <TableHead>Początek</TableHead>
                              <TableHead>Koniec</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.driverCard.events.map((ev, i) => (
                              <TableRow key={`e${i}`}>
                                <TableCell className="text-xs">{ev.eventTypeName}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(ev.eventBeginTime)}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(ev.eventEndTime)}</TableCell>
                              </TableRow>
                            ))}
                            {data.driverCard.faults.map((f, i) => (
                              <TableRow key={`f${i}`}>
                                <TableCell className="text-xs">{f.faultTypeName}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(f.faultBeginTime)}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(f.faultEndTime)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {!data.driverCard.identification && data.driverCard.vehiclesUsed.length === 0 && data.driverCard.places.length === 0 && (
                    <Card><CardContent className="py-8 text-center text-muted-foreground">Nie udało się odczytać danych z karty kierowcy</CardContent></Card>
                  )}
                </div>
              </TabsContent>
            )}
            {/* Diagnostics */}
            <TabsContent value="diagnostics">
              <div className="space-y-4">
                {/* Per-file section breakdown */}
                {(() => {
                  const bySource = new Map<string, number>();
                  data.rawSections.forEach(s => {
                    const src = s.sourceFile || 'unknown';
                    const shortName = src.replace(/^.*[\\/]/, '').replace(/^\d+_/, '');
                    bySource.set(shortName, (bySource.get(shortName) || 0) + 1);
                  });
                  const activityDaysFound = data.activities.length + data.activityRejections.length;
                  const activityDaysDisplayed = data.activities.length;
                  const activityDaysRejected = data.activityRejections.length;
                  return (
                    <>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <Card>
                          <CardContent className="py-4">
                            <p className="text-xs text-muted-foreground">Rozmiar pliku</p>
                            <p className="mt-1 font-semibold font-mono">{data.fileSize.toLocaleString()} B</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="py-4">
                            <p className="text-xs text-muted-foreground">Bajty sparsowane</p>
                            <p className="mt-1 font-semibold font-mono">{data.bytesParsed.toLocaleString()} B ({Math.round(data.bytesParsed / data.fileSize * 100)}%)</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="py-4">
                            <p className="text-xs text-muted-foreground">Sekcje TLV (łącznie)</p>
                            <p className="mt-1 font-semibold">{data.rawSections.length}</p>
                            {bySource.size > 1 && (
                              <div className="mt-1 space-y-0.5">
                                {Array.from(bySource.entries()).map(([src, count]) => (
                                  <p key={src} className="text-xs text-muted-foreground font-mono">{src}: {count}</p>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                      {activityDaysFound > 0 && (
                        <Card className="border-primary/20">
                          <CardContent className="py-4">
                            <p className="text-xs text-muted-foreground font-medium mb-2">Dni czynności</p>
                            <div className="flex items-center gap-4">
                              <div className="text-center">
                                <p className="text-lg font-semibold">{activityDaysFound}</p>
                                <p className="text-xs text-muted-foreground">znalezionych</p>
                              </div>
                              <span className="text-muted-foreground">→</span>
                              {activityDaysRejected > 0 && (
                                <>
                                  <div className="text-center">
                                    <p className="text-lg font-semibold text-orange-500">{activityDaysRejected}</p>
                                    <p className="text-xs text-muted-foreground">odfiltrowanych</p>
                                  </div>
                                  <span className="text-muted-foreground">→</span>
                                </>
                              )}
                              <div className="text-center">
                                <p className="text-lg font-semibold text-green-600">{activityDaysDisplayed}</p>
                                <p className="text-xs text-muted-foreground">wyświetlonych</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  );
                })()}

                <Card>
                  <CardHeader className="py-3"><CardTitle className="text-sm">Znalezione sekcje</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="max-h-[500px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Tag</TableHead>
                            <TableHead>Nazwa</TableHead>
                            <TableHead>Plik źródłowy</TableHead>
                            <TableHead>Offset</TableHead>
                            <TableHead>Długość</TableHead>
                            <TableHead>Hex dump (32B)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.rawSections.map((s, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs font-mono">{i + 1}</TableCell>
                              <TableCell className="text-xs font-mono">0x76 0x{s.tag.toString(16).padStart(2, '0')}</TableCell>
                              <TableCell className="text-xs">{TAG_NAMES[s.tag] || 'Nieznany'}</TableCell>
                              <TableCell className="text-xs font-mono truncate max-w-[120px]" title={s.sourceFile || ''}>{(s.sourceFile || '').replace(/^.*[\\/]/, '').replace(/^\d+_/, '') || '—'}</TableCell>
                              <TableCell className="text-xs font-mono">{s.offset}</TableCell>
                              <TableCell className="text-xs font-mono">{s.length.toLocaleString()}</TableCell>
                              <TableCell className="text-xs font-mono break-all max-w-xs">{hexDump(s.data)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {data.warnings.length > 0 && (
                  <Card className="border-amber-500/30">
                    <CardHeader className="py-3"><CardTitle className="text-sm text-amber-600">Ostrzeżenia parsera ({data.warnings.length})</CardTitle></CardHeader>
                    <CardContent className="space-y-1">
                      {data.warnings.map((w, i) => (
                        <p key={i} className="text-xs font-mono text-muted-foreground">
                          <span className="text-amber-600">offset {w.offset}:</span> {w.message}
                        </p>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Activity rejections log */}
                {data.activityRejections.length > 0 && (
                  <Card className="border-orange-500/30">
                    <CardHeader className="py-3"><CardTitle className="text-sm text-orange-600">Odrzucone rekordy czynności ({data.activityRejections.length})</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <ScrollArea className="max-h-[400px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-20">Offset</TableHead>
                              <TableHead className="w-24">Data</TableHead>
                              <TableHead>Powód odrzucenia</TableHead>
                              <TableHead className="w-16">Dystans</TableHead>
                              <TableHead className="w-16">Wpisy</TableHead>
                              <TableHead className="w-28">K1/K2 min</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.activityRejections.map((r, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs font-mono">{r.offset}</TableCell>
                                <TableCell className="text-xs font-mono">{r.date}</TableCell>
                                <TableCell className="text-xs">{r.reason}</TableCell>
                                <TableCell className="text-xs font-mono">{r.dayDistance != null ? `${r.dayDistance} km` : '—'}</TableCell>
                                <TableCell className="text-xs font-mono">{r.changeCount ?? '—'}</TableCell>
                                <TableCell className="text-xs font-mono">
                                  {r.slotTotals ? `${r.slotTotals.driver}/${r.slotTotals.codriver}` : '—'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Raw file hex dumps */}
                {data.rawFileBuffers.length > 0 && (
                  <HexDumpExplorer buffers={data.rawFileBuffers} />
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default DddReader;
