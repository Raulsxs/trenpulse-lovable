import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, FileText, CheckCircle, Clock, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Stat {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}

interface StatsCardsProps {
  trendsCount?: number;
}

interface ContentStats {
  total: number;
  approved: number;
  draft: number;
  scheduled: number;
}

const StatsCards = ({ trendsCount = 0 }: StatsCardsProps) => {
  const [contentStats, setContentStats] = useState<ContentStats>({
    total: 0,
    approved: 0,
    draft: 0,
    scheduled: 0,
  });

  useEffect(() => {
    fetchContentStats();
  }, []);

  const fetchContentStats = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;

      const { data, error } = await supabase
        .from("generated_contents")
        .select("status, scheduled_at")
        .eq("user_id", session.session.user.id);

      if (error) throw error;

      const stats = {
        total: data?.length || 0,
        approved: data?.filter((c) => c.status === "approved").length || 0,
        draft: data?.filter((c) => c.status === "draft").length || 0,
        scheduled: data?.filter((c) => c.scheduled_at).length || 0,
      };

      setContentStats(stats);
    } catch (error) {
      console.error("Error fetching content stats:", error);
    }
  };

  const stats: Stat[] = [
    {
      label: "Tendências Ativas",
      value: trendsCount,
      change: "Atualizadas hoje",
      changeType: "positive",
      icon: TrendingUp,
      iconColor: "text-primary",
      iconBg: "bg-primary/10",
    },
    {
      label: "Conteúdos Gerados",
      value: contentStats.total,
      change: "Total criados",
      changeType: "neutral",
      icon: FileText,
      iconColor: "text-accent",
      iconBg: "bg-accent/10",
    },
    {
      label: "Prontos para Publicar",
      value: contentStats.approved,
      change: "Aprovados",
      changeType: "positive",
      icon: CheckCircle,
      iconColor: "text-success",
      iconBg: "bg-success/10",
    },
    {
      label: "Agendados",
      value: contentStats.scheduled,
      change: "Publicação programada",
      changeType: "neutral",
      icon: Calendar,
      iconColor: "text-warning",
      iconBg: "bg-warning/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-onboarding="stats-cards">
      {stats.map((stat, index) => (
        <Card key={index} className="shadow-card border-border/50">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-3xl font-heading font-bold text-foreground mt-1">
                  {stat.value}
                </p>
                {stat.change && (
                  <p
                    className={cn(
                      "text-xs mt-1",
                      stat.changeType === "positive" && "text-success",
                      stat.changeType === "negative" && "text-destructive",
                      stat.changeType === "neutral" && "text-muted-foreground"
                    )}
                  >
                    {stat.change}
                  </p>
                )}
              </div>
              <div className={cn("p-3 rounded-xl", stat.iconBg)}>
                <stat.icon className={cn("w-6 h-6", stat.iconColor)} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default StatsCards;
