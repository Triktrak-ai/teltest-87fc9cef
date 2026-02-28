import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, AlertTriangle, Info } from "lucide-react";

type Compat = "ok" | "warn" | "fail";

interface MatrixCell {
  compat: Compat;
  tooltip: string;
}

const vuGens = ["Gen1", "Gen2v1", "Gen2v2"] as const;
const vuLabels: Record<string, string> = {
  Gen1: "Gen1 (Stary)",
  Gen2v1: "Gen2v1 (Smart 1)",
  Gen2v2: "Gen2v2 (Smart 2)",
};
const cardGens = ["G1", "G2v1", "G2v2"] as const;
const cardLabels: Record<string, string> = {
  G1: "G1 (Stara)",
  G2v1: "G2v1 (Smart 1)",
  G2v2: "G2v2 (Smart 2)",
};

const companyMatrix: Record<string, Record<string, MatrixCell>> = {
  G1: {
    Gen1:   { compat: "ok",   tooltip: "OK – otwiera zamek" },
    Gen2v1: { compat: "ok",   tooltip: "OK – otwiera zamek" },
    Gen2v2: { compat: "warn", tooltip: "PROBLEM – może nie autoryzować poboru nowych sekcji danych" },
  },
  G2v1: {
    Gen1:   { compat: "ok",   tooltip: "OK – wstecznie kompatybilna" },
    Gen2v1: { compat: "ok",   tooltip: "OK – otwiera zamek" },
    Gen2v2: { compat: "warn", tooltip: "Ograniczona – może nie wspierać nowych certyfikatów bezpieczeństwa" },
  },
  G2v2: {
    Gen1:   { compat: "ok",   tooltip: "OK – wstecznie kompatybilna" },
    Gen2v1: { compat: "ok",   tooltip: "OK – wstecznie kompatybilna" },
    Gen2v2: { compat: "ok",   tooltip: "OK – wymagana do pełnego odczytu Smart 2" },
  },
};

const driverMatrix: Record<string, Record<string, MatrixCell>> = {
  G1: {
    Gen1:   { compat: "ok",   tooltip: "Pełna kompatybilność (standard)" },
    Gen2v1: { compat: "warn", tooltip: "Jazda OK / Brak zapisu GPS na karcie" },
    Gen2v2: { compat: "warn", tooltip: "Jazda OK / Brak zapisu GPS i granic na karcie" },
  },
  G2v1: {
    Gen1:   { compat: "warn", tooltip: "Jazda OK / Błędy przy odczycie .ddd" },
    Gen2v1: { compat: "ok",   tooltip: "Pełna kompatybilność (standard)" },
    Gen2v2: { compat: "warn", tooltip: "Jazda OK / Brak zapisu granic/ładunku na karcie" },
  },
  G2v2: {
    Gen1:   { compat: "warn", tooltip: "Jazda OK / Ryzyko błędów odczytu" },
    Gen2v1: { compat: "warn", tooltip: "Jazda OK / Ryzyko błędów odczytu" },
    Gen2v2: { compat: "ok",   tooltip: "Pełna kompatybilność (standard)" },
  },
};

const compatStyles: Record<Compat, string> = {
  ok:   "bg-success/20 text-success border-success/30",
  warn: "bg-warning/20 text-warning border-warning/30",
  fail: "bg-destructive/20 text-destructive border-destructive/30",
};

const CompatIcon = ({ compat }: { compat: Compat }) => {
  if (compat === "ok") return <Check className="h-3.5 w-3.5" />;
  if (compat === "warn") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <X className="h-3.5 w-3.5" />;
};

function MatrixTable({ matrix }: { matrix: Record<string, Record<string, MatrixCell>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="px-2 py-2 text-left text-muted-foreground font-medium">
              <span className="text-[10px] uppercase tracking-wider">Karta ↓ / Tacho →</span>
            </th>
            {vuGens.map((vu) => (
              <th key={vu} className="px-2 py-2 text-center">
                <Badge variant="outline" className="bg-info/10 text-info border-info/20 font-mono text-[10px]">
                  {vuLabels[vu]}
                </Badge>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cardGens.map((card) => (
            <tr key={card} className="border-t border-border/30">
              <td className="px-2 py-2.5">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-mono text-[10px]">
                  {cardLabels[card]}
                </Badge>
              </td>
              {vuGens.map((vu) => {
                const cell = matrix[card][vu];
                return (
                  <td key={vu} className="px-2 py-2.5 text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className={`inline-flex items-center justify-center gap-1 rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold ${compatStyles[cell.compat]}`}
                          >
                            <CompatIcon compat={cell.compat} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">{cell.tooltip}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompatibilityMatrix() {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-5 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Macierz kompatybilności
        </h2>
      </div>
      <div className="p-4">
        <Tabs defaultValue="company">
          <TabsList className="mb-4">
            <TabsTrigger value="company">Karta firmowa</TabsTrigger>
            <TabsTrigger value="driver">Karta kierowcy</TabsTrigger>
          </TabsList>

          <TabsContent value="company">
            <MatrixTable matrix={companyMatrix} />
            <div className="mt-3 flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Nowe karty są wstecznie kompatybilne. Do pełnej funkcjonalności w Gen2v2 zalecana jest karta G2v2,
                zwłaszcza dla zdalnego downloadu. Starsze karty mogą powodować błędy „Authentication failed" przy
                pobieraniu plików .ddd z nowymi danymi (np. GNSS).
              </span>
            </div>
          </TabsContent>

          <TabsContent value="driver">
            <MatrixTable matrix={driverMatrix} />
            <div className="mt-3 flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Starsze karty w nowych tachografach — dane o granicach i GNSS muszą być pobierane z tachografu
                podczas inspekcji. Nowe karty w starszych tachografach — tachograf traktuje je jak starsze,
                ignorując dodatkowe funkcje (np. brak dostępu do rozszerzonej pamięci 56 dni).
              </span>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-success" /> Zgodne
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-warning" /> Ograniczone
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-destructive" /> Niezgodne
          </span>
        </div>
      </div>
    </div>
  );
}
