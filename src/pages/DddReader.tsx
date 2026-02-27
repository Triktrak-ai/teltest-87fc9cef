import { useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Radio, Upload, FileText, ArrowLeft, Activity, AlertTriangle, Wrench, Gauge, Search, X, Plus, CreditCard, MapPin, Car } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseDddFile, mergeDddData, emptyDddData, type DddFileData, type DddSection, type DriverCardData } from "@/lib/ddd-parser";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const ACTIVITY_COLORS: Record<string, string> = {
  driving: "bg-red-500",
  work: "bg-amber-500",
  availability: "bg-sky-500",
  break: "bg-emerald-500",
  unknown: "bg-muted",
};

const ACTIVITY_LABELS: Record<string, string> = {
  driving: "Jazda",
  work: "Praca",
  availability: "Dyspozycyjność",
  break: "Odpoczynek",
  unknown: "Nieznany",
};

const formatDate = (d: Date | null) => d ? d.toLocaleDateString("pl-PL") : "—";
const formatDateTime = (d: Date | null) => d ? d.toLocaleString("pl-PL") : "—";

const hexDump = (data: Uint8Array, maxBytes = 32): string => {
  const slice = data.slice(0, maxBytes);
  return Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
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

const DddReader = () => {
  const [data, setData] = useState<DddFileData | null>(null);
  const [loadedFiles, setLoadedFiles] = useState<string[]>([]);
  const [error, setError] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
          <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">Przeciągnij pliki .DDD lub kliknij aby wybrać</p>
          <p className="mt-1 text-xs text-muted-foreground">Pliki VU (overview, activities, events, speed, technical) lub karty kierowcy (driver1, driver2)</p>
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
                <div className="space-y-4">
                  {data.activities.slice(0, 60).map((day, idx) => (
                    <Card key={idx}>
                      <CardHeader className="py-3">
                        <CardTitle className="flex items-center justify-between text-sm">
                          <span>{formatDate(day.date)}</span>
                          <span className="text-xs font-normal text-muted-foreground">{day.dayDistance} km</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-2">
                        {day.entries.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Brak wpisów</p>
                        ) : (
                          <div className="space-y-1">
                            {day.entries.map((e, j) => (
                              <div key={j} className="flex items-center gap-2 text-xs">
                                <div className={`h-2.5 w-2.5 rounded-full ${ACTIVITY_COLORS[e.status]}`} />
                                <span className="w-20 font-medium">{ACTIVITY_LABELS[e.status]}</span>
                                <span className="text-muted-foreground">{e.timeFrom}–{e.timeTo}</span>
                                <Badge variant="outline" className="ml-auto text-[10px]">{e.slot === 'driver' ? 'K1' : 'K2'}</Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {data.activities.length > 60 && (
                    <p className="text-center text-xs text-muted-foreground">Pokazano 60 z {data.activities.length} dni</p>
                  )}
                </div>
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

            {/* Technical Data */}
            <TabsContent value="technical">
              {data.technicalData ? (
                <div className="space-y-4">
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
                  {data.technicalData.calibrations.length > 0 && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm">Kalibracje</CardTitle></CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Cel</TableHead>
                              <TableHead>Warsztat</TableHead>
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
                                <TableCell className="text-xs">{c.vehicleRegistrationNumber || "—"}</TableCell>
                                <TableCell className="text-xs">{formatDateTime(c.newDateTime)}</TableCell>
                                <TableCell className="text-xs">{c.newOdometerValue > 0 ? `${c.newOdometerValue} km` : "—"}</TableCell>
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
                      <p className="text-xs text-muted-foreground">Sekcje TLV</p>
                      <p className="mt-1 font-semibold">{data.rawSections.length}</p>
                    </CardContent>
                  </Card>
                </div>

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
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default DddReader;
