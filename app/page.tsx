import CandlestickChart from "./components/candlestick-chart";
import VolatilityTable from "./components/volatility-table";
import nvdaData from "../public/nvda_daily_2024.json";
import tslaData from "../public/tsla_daily_2024.json";
import volatilityData from "../public/volatility_2024.json";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-6 gap-8">
      <div className="w-full max-w-5xl">
        <CandlestickChart
          data={nvdaData}
          title="NVDA Daily Candlestick Chart"
          description="NVIDIA daily OHLCV data for the 2024 trading year"
        />
      </div>
      <div className="w-full max-w-5xl">
        <CandlestickChart
          data={tslaData}
          title="TSLA Daily Candlestick Chart"
          description="Tesla daily OHLCV data for the 2024 trading year"
        />
      </div>
      <div className="w-full max-w-5xl">
        <VolatilityTable data={volatilityData} />
      </div>
    </main>
  );
}
