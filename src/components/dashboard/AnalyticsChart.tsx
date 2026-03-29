import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

interface ContentData {
  created_at: string;
  status: string;
}

interface AnalyticsChartProps {
  contents: ContentData[];
}

const AnalyticsChart = ({ contents }: AnalyticsChartProps) => {
  const chartData = useMemo(() => {
    const last7Days: { [key: string]: { date: string; criados: number; aprovados: number } } = {};
    
    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const dayLabel = date.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" });
      last7Days[dateStr] = { date: dayLabel, criados: 0, aprovados: 0 };
    }

    // Count contents per day
    contents.forEach((content) => {
      const dateStr = content.created_at.split("T")[0];
      if (last7Days[dateStr]) {
        last7Days[dateStr].criados++;
        if (content.status === "approved") {
          last7Days[dateStr].aprovados++;
        }
      }
    });

    return Object.values(last7Days);
  }, [contents]);

  const hasData = contents.length > 0;

  return (
    <Card className="shadow-card border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Atividade Recente
            </CardTitle>
            <CardDescription>
              Conteúdos gerados nos últimos 7 dias
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="h-[200px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorCriados" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorAprovados" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11 }} 
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 11 }} 
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  className="text-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="criados"
                  name="Criados"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCriados)"
                />
                <Area
                  type="monotone"
                  dataKey="aprovados"
                  name="Aprovados"
                  stroke="hsl(var(--success))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorAprovados)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
            Gere conteúdos para ver o gráfico de atividade
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AnalyticsChart;
