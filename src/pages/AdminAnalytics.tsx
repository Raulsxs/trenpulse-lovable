import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Users,
  Activity,
  Sparkles,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Loader2,
  Image,
  BarChart3,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const ADMIN_EMAIL = "raul.sxs27@gmail.com";
const USD_TO_BRL = 5.80;

interface AdminData {
  kpis: {
    totalUsers: number;
    activeThisMonth: number;
    totalGenerations: number;
    generationsThisMonth: number;
    estimatedCostUsd: number;
    estimatedMrrBrl: number;
    totalImages: number;
  };
  users: Array<{
    userId: string;
    email: string;
    fullName: string | null;
    companyName: string | null;
    planName: string;
    generationsThisMonth: number;
    publicationsThisMonth: number;
    estimatedCostUsd: number;
    lastActive: string | null;
    createdAt: string;
  }>;
  costByModel: Array<{ model: string; calls: number; cost: number }>;
  costTrend: Array<{ month: string; cost: number }>;
  dailyGenerations: Array<{ date: string; count: number }>;
  platformSplit: Array<{ platform: string; count: number }>;
  contentTypeSplit: Array<{ contentType: string; count: number }>;
  statusSplit: Array<{ status: string; count: number }>;
}

const COLORS = ["#667eea", "#f093fb", "#4fd1c5", "#f6ad55", "#fc8181", "#90cdf4"];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatCurrency(value: number, currency = "USD") {
  if (currency === "BRL") return `R$ ${value.toFixed(2)}`;
  return `$ ${value.toFixed(2)}`;
}

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.email !== ADMIN_EMAIL) {
        toast.error("Acesso restrito");
        navigate("/dashboard");
        return;
      }
      setAuthorized(true);

      const { data: result, error } = await supabase.functions.invoke("admin-analytics");
      if (error) throw error;
      setData(result);
    } catch (err: any) {
      toast.error("Erro ao carregar analytics: " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (!authorized && !loading) return null;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold">Admin Analytics</h1>
            <p className="text-sm text-muted-foreground">Painel de controle da TrendPulse</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-1">Atualizar</span>
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <KpiCard icon={Users} label="Usuários" value={data.kpis.totalUsers} />
              <KpiCard icon={Activity} label="Ativos (mês)" value={data.kpis.activeThisMonth} />
              <KpiCard icon={Sparkles} label="Gerações total" value={data.kpis.totalGenerations} />
              <KpiCard icon={Sparkles} label="Gerações mês" value={data.kpis.generationsThisMonth} />
              <KpiCard icon={Image} label="Imagens total" value={data.kpis.totalImages} />
              <KpiCard icon={DollarSign} label="Custo API (USD)" value={formatCurrency(data.kpis.estimatedCostUsd)} color="text-red-500" />
              <KpiCard icon={TrendingUp} label="MRR (BRL)" value={formatCurrency(data.kpis.estimatedMrrBrl, "BRL")} color="text-green-500" />
            </div>

            {/* Profit indicator */}
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium">Margem estimada:</span>
                  <span className="font-bold text-green-600">
                    {formatCurrency(data.kpis.estimatedMrrBrl - (data.kpis.estimatedCostUsd * USD_TO_BRL), "BRL")}
                  </span>
                  <span className="text-muted-foreground">
                    (MRR R${data.kpis.estimatedMrrBrl.toFixed(0)} - Custo API R${(data.kpis.estimatedCostUsd * USD_TO_BRL).toFixed(0)})
                  </span>
                  <Badge variant={data.kpis.estimatedMrrBrl > data.kpis.estimatedCostUsd * USD_TO_BRL ? "default" : "destructive"}>
                    {data.kpis.estimatedMrrBrl > 0
                      ? `${Math.round(((data.kpis.estimatedMrrBrl - data.kpis.estimatedCostUsd * USD_TO_BRL) / data.kpis.estimatedMrrBrl) * 100)}%`
                      : "—"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Daily Generations */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Gerações (últimos 30 dias)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.dailyGenerations}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.substring(5)} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip labelFormatter={(v) => `Data: ${v}`} />
                        <Area type="monotone" dataKey="count" stroke="#667eea" fill="#667eea" fillOpacity={0.2} name="Gerações" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Cost by Model */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Custo por modelo (USD)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.costByModel} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                        <YAxis type="category" dataKey="model" tick={{ fontSize: 10 }} width={140} />
                        <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Custo"]} />
                        <Bar dataKey="cost" fill="#667eea" radius={[0, 4, 4, 0]}>
                          {data.costByModel.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 space-y-1">
                    {data.costByModel.map((m) => (
                      <div key={m.model} className="flex justify-between text-xs text-muted-foreground">
                        <span>{m.model}</span>
                        <span>{m.calls} calls &middot; ${m.cost.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Platform Split */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Plataforma</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.platformSplit.map((p) => (
                      <div key={p.platform} className="flex justify-between items-center">
                        <span className="text-sm capitalize">{p.platform}</span>
                        <Badge variant="secondary">{p.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Content Type Split */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Tipo de conteúdo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.contentTypeSplit.map((t) => (
                      <div key={t.contentType} className="flex justify-between items-center">
                        <span className="text-sm capitalize">{t.contentType}</span>
                        <Badge variant="secondary">{t.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Status Split */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.statusSplit.map((s) => (
                      <div key={s.status} className="flex justify-between items-center">
                        <span className="text-sm capitalize">{s.status}</span>
                        <Badge variant="secondary">{s.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Cost Trend */}
            {data.costTrend.length > 1 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Custo API mensal (USD)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.costTrend}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                        <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Custo"]} />
                        <Bar dataKey="cost" fill="#fc8181" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Users Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Usuários ({data.users.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="pb-2 pr-3">Usuário</th>
                      <th className="pb-2 pr-3">Plano</th>
                      <th className="pb-2 pr-3 text-right">Gerações/mês</th>
                      <th className="pb-2 pr-3 text-right">Publicações</th>
                      <th className="pb-2 pr-3 text-right">Custo est. (USD)</th>
                      <th className="pb-2 pr-3">Última atividade</th>
                      <th className="pb-2">Cadastro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.userId} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="py-2 pr-3">
                          <div className="font-medium">{u.fullName || u.email.split("@")[0]}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant={u.planName === "Free" ? "outline" : "default"} className="text-xs">
                            {u.planName}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono">{u.generationsThisMonth}</td>
                        <td className="py-2 pr-3 text-right font-mono">{u.publicationsThisMonth}</td>
                        <td className="py-2 pr-3 text-right font-mono">
                          ${u.estimatedCostUsd.toFixed(2)}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{formatDate(u.lastActive)}</td>
                        <td className="py-2 text-muted-foreground">{formatDate(u.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        ) : (
          <p className="text-center text-muted-foreground py-10">Nenhum dado disponível.</p>
        )}
      </div>
    </DashboardLayout>
  );
}

function KpiCard({ icon: Icon, label, value, color }: {
  icon: any;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`text-xl font-bold ${color || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
