/**
 * Analytics page — content performance dashboard.
 * Shows internal stats (content created/published) + engagement metrics from social APIs.
 */
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  BarChart3,
  TrendingUp,
  Heart,
  MessageCircle,
  Eye,
  FileText,
  Calendar,
  RefreshCw,
  Loader2,
  Trophy,
  Clock,
  Zap,
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
} from "recharts";

interface ContentStat {
  date: string;
  created: number;
  published: number;
}

interface TopContent {
  id: string;
  title: string;
  content_type: string;
  platform: string;
  published_at: string;
  likes: number;
  comments: number;
}

export default function Analytics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalGenerated: 0,
    totalPublished: 0,
    totalScheduled: 0,
    totalLikes: 0,
    totalComments: 0,
    thisWeekGenerated: 0,
  });
  const [weeklyData, setWeeklyData] = useState<ContentStat[]>([]);
  const [topContent, setTopContent] = useState<TopContent[]>([]);
  const [contentByType, setContentByType] = useState<{ type: string; count: number }[]>([]);

  const fetchAnalytics = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      const userId = session.session.user.id;

      // 1. Overall stats
      const { data: allContent } = await supabase
        .from("generated_contents")
        .select("id, status, content_type, platform, created_at, published_at")
        .eq("user_id", userId);

      const contents = allContent || [];
      const published = contents.filter(c => c.status === "published");
      const scheduled = contents.filter(c => c.status === "scheduled");

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const thisWeek = contents.filter(c => new Date(c.created_at) >= weekAgo);

      // 2. Engagement metrics
      const { data: metrics } = await supabase
        .from("content_metrics" as any)
        .select("content_id, likes, comments, shares, saves")
        .eq("user_id", userId);

      const metricsArr = (metrics || []) as any[];
      const totalLikes = metricsArr.reduce((sum: number, m: any) => sum + (m.likes || 0), 0);
      const totalComments = metricsArr.reduce((sum: number, m: any) => sum + (m.comments || 0), 0);

      setStats({
        totalGenerated: contents.length,
        totalPublished: published.length,
        totalScheduled: scheduled.length,
        totalLikes,
        totalComments,
        thisWeekGenerated: thisWeek.length,
      });

      // 3. Weekly activity (last 14 days)
      const days: ContentStat[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const dayLabel = `${d.getDate()}/${d.getMonth() + 1}`;

        const created = contents.filter(c => c.created_at?.startsWith(dateStr)).length;
        const pub = published.filter(c => c.published_at?.startsWith(dateStr)).length;

        days.push({ date: dayLabel, created, published: pub });
      }
      setWeeklyData(days);

      // 4. Top performing content
      const contentMetricsMap: Record<string, any> = {};
      for (const m of metricsArr) {
        contentMetricsMap[m.content_id] = m;
      }

      const top = published
        .map(c => ({
          id: c.id,
          title: (c as any).title || "Sem título",
          content_type: c.content_type,
          platform: c.platform || "instagram",
          published_at: c.published_at || "",
          likes: contentMetricsMap[c.id]?.likes || 0,
          comments: contentMetricsMap[c.id]?.comments || 0,
        }))
        .sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))
        .slice(0, 5);

      setTopContent(top);

      // 5. Content by type
      const typeCount: Record<string, number> = {};
      for (const c of contents) {
        const t = c.content_type || "post";
        typeCount[t] = (typeCount[t] || 0) + 1;
      }
      setContentByType(Object.entries(typeCount).map(([type, count]) => ({ type, count })));

    } catch (err) {
      console.error("[Analytics] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleRefreshMetrics = async () => {
    setRefreshing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const { error } = await supabase.functions.invoke("fetch-social-metrics", {
        body: { user_id: session.session.user.id },
      });

      if (error) throw error;
      toast.success("Métricas atualizadas!");
      await fetchAnalytics();
    } catch (err: any) {
      toast.error("Erro ao atualizar métricas", { description: err.message });
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Analytics</h1>
            <p className="text-muted-foreground text-sm mt-1">Performance do seu conteúdo</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleRefreshMetrics}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Atualizar métricas
          </Button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileText className="w-4 h-4" />
                <span className="text-xs">Criados</span>
              </div>
              <p className="text-2xl font-bold">{stats.totalGenerated}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Zap className="w-4 h-4" />
                <span className="text-xs">Publicados</span>
              </div>
              <p className="text-2xl font-bold">{stats.totalPublished}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Calendar className="w-4 h-4" />
                <span className="text-xs">Agendados</span>
              </div>
              <p className="text-2xl font-bold">{stats.totalScheduled}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Heart className="w-4 h-4 text-red-500" />
                <span className="text-xs">Curtidas</span>
              </div>
              <p className="text-2xl font-bold">{stats.totalLikes}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <MessageCircle className="w-4 h-4 text-blue-500" />
                <span className="text-xs">Comentários</span>
              </div>
              <p className="text-2xl font-bold">{stats.totalComments}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs">Esta semana</span>
              </div>
              <p className="text-2xl font-bold">{stats.thisWeekGenerated}</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Activity chart */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Atividade (14 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyData}>
                    <defs>
                      <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorPublished" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 11 }} />
                    <YAxis className="text-xs" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Area type="monotone" dataKey="created" stroke="hsl(var(--primary))" fill="url(#colorCreated)" name="Criados" />
                    <Area type="monotone" dataKey="published" stroke="#22c55e" fill="url(#colorPublished)" name="Publicados" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Content by type */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Por formato
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={contentByType} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis dataKey="type" type="category" tick={{ fontSize: 11 }} width={70} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Conteúdos" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top content */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              Top Conteúdos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topContent.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Publique conteúdo para ver métricas de engagement aqui.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/chat")}>
                  Criar conteúdo
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {topContent.map((content, i) => (
                  <div
                    key={content.id}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/content/${content.id}`)}
                  >
                    <span className="text-lg font-bold text-muted-foreground w-6">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{content.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[10px]">{content.content_type}</Badge>
                        <Badge variant="outline" className="text-[10px]">{content.platform}</Badge>
                        {content.published_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(content.published_at).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1 text-red-500">
                        <Heart className="w-3.5 h-3.5" />
                        {content.likes}
                      </span>
                      <span className="flex items-center gap-1 text-blue-500">
                        <MessageCircle className="w-3.5 h-3.5" />
                        {content.comments}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
