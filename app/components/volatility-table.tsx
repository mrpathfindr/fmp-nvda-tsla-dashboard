import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface MonthVolatility {
  month: string;
  dailyStd: number;
  monthlyVol: number;
  annualizedVol: number;
  tradingDays: number;
}

interface FullYearVolatility {
  dailyStd: number;
  monthlyVol: number;
  annualizedVol: number;
  tradingDays: number;
}

interface StockVolatility {
  symbol: string;
  fullYear: FullYearVolatility;
  byMonth: MonthVolatility[];
}

interface VolatilityData {
  nvda: StockVolatility;
  tsla: StockVolatility;
}

interface VolatilityTableProps {
  data: VolatilityData;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return new Date(Number(year), Number(month) - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export default function VolatilityTable({ data }: VolatilityTableProps) {
  const months = data.nvda.byMonth.map((m) => m.month);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Volatility Comparison</CardTitle>
        <CardDescription>
          Monthly and annualized volatility for NVDA and TSLA in 2024.
          Calculated from daily log returns:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">r = ln(Pt / Pt-1)</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">NVDA Monthly</TableHead>
                <TableHead className="text-right">NVDA Annualized</TableHead>
                <TableHead className="text-right">TSLA Monthly</TableHead>
                <TableHead className="text-right">TSLA Annualized</TableHead>
                <TableHead className="text-right">Trading Days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((month) => {
                const nvdaMonth = data.nvda.byMonth.find((m) => m.month === month)!;
                const tslaMonth = data.tsla.byMonth.find((m) => m.month === month)!;

                return (
                  <TableRow key={month}>
                    <TableCell className="font-medium">
                      {formatMonthLabel(month)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(nvdaMonth.monthlyVol)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(nvdaMonth.annualizedVol)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(tslaMonth.monthlyVol)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPercent(tslaMonth.annualizedVol)}
                    </TableCell>
                    <TableCell className="text-right">
                      {nvdaMonth.tradingDays}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 font-semibold">
                <TableCell>Full Year 2024</TableCell>
                <TableCell className="text-right">
                  {formatPercent(data.nvda.fullYear.monthlyVol)}
                </TableCell>
                <TableCell className="text-right">
                  {formatPercent(data.nvda.fullYear.annualizedVol)}
                </TableCell>
                <TableCell className="text-right">
                  {formatPercent(data.tsla.fullYear.monthlyVol)}
                </TableCell>
                <TableCell className="text-right">
                  {formatPercent(data.tsla.fullYear.annualizedVol)}
                </TableCell>
                <TableCell className="text-right">
                  {data.nvda.fullYear.tradingDays}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
