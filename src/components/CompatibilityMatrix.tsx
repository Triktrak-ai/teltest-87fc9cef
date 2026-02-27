import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, X, AlertTriangle } from "lucide-react";

type Compat = "ok" | "warn" | "fail";

interface MatrixCell {
  compat: Compat;
  label: string;
  tooltip: string;
}

const cardGens = ["Gen1", "Gen2v1", "Gen2v2"] as const;
const vuGens = ["Gen1", "Gen2v1", "Gen2v2"] as const;

const matrix: Record<string, Record<string, MatrixCell>> = {
  Gen1: {
    Gen1:   { compat: "ok",   label: "✓", tooltip: "Pełna kompatybilność" },
    Gen2v1: { compat: "ok",   label: "✓", tooltip: "Karta Gen1 działa z tachografem Gen2v1" },
    Gen2v2: { compat: "ok",   label: "✓", tooltip: "Karta Gen1 działa z tachografem Gen2v2" },
  },
  Gen2v1: {
    Gen1:   { compat: "warn", label: "⚠", tooltip: "Niezgodność — może działać z permisywnym firmware" },
    Gen2v1: { compat: "ok",   label: "✓", tooltip: "Pełna kompatybilność" },
    Gen2v2: { compat: "ok",   label: "✓", tooltip: "Karta Gen2v1 działa z tachografem Gen2v2" },
  },
  Gen2v2: {
    Gen1:   { compat: "fail", label: "✗", tooltip: "Brak kompatybilności — wymagany tachograf Gen2v2" },
    Gen2v1: { compat: "fail", label: "✗", tooltip: "Brak kompatybilności — wymagany tachograf Gen2v2" },
    Gen2v2: { compat: "ok",   label: "✓", tooltip: "Pełna kompatybilność" },
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

export function CompatibilityMatrix() {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-5 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Macierz kompatybilności
        </h2>
      </div>
      <div className="p-4">
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
                      {vu}
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
                      {card}
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
        <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-success" /> Zgodne
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-warning" /> Ryzykowne
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-destructive" /> Niezgodne
          </span>
        </div>
      </div>
    </div>
  );
}
