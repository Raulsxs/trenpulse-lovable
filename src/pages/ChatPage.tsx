import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ChatWindow from "@/components/chat/ChatWindow";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RecentContent {
  id: string;
  title: string;
  status: string | null;
  content_type: string;
  scheduled_at: string | null;
  slides: any;
}

export default function ChatPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [recentContents, setRecentContents] = useState<RecentContent[]>([]);
  const [scheduledDates, setScheduledDates] = useState<Date[]>([]);

  useEffect(() => {
    if (!sheetOpen) return;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data: contents } = await supabase
        .from("generated_contents")
        .select("id, title, status, content_type, scheduled_at, slides")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (contents) {
        setRecentContents(contents);
        setScheduledDates(
          contents
            .filter((c) => c.scheduled_at)
            .map((c) => new Date(c.scheduled_at!))
        );
      }
    };
    load();
  }, [sheetOpen]);

  const statusLabel: Record<string, string> = {
    draft: "Rascunho",
    approved: "Aprovado",
    scheduled: "Agendado",
    published: "Publicado",
  };

  const statusVariant = (s: string | null): "default" | "secondary" | "outline" | "destructive" => {
    if (s === "published") return "default";
    if (s === "scheduled") return "secondary";
    return "outline";
  };

  return (
    <DashboardLayout>
      <div className="h-full min-h-0 relative flex flex-col overflow-hidden bg-background">
        {/* Calendar button */}
        <div className="flex justify-end items-center gap-2 px-3 pt-8 pb-2 shrink-0">
          
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="gap-2">
                <CalendarDays className="w-4 h-4" />
                Calendário
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[380px] sm:w-[420px]">
              <SheetHeader>
                <SheetTitle>Agenda & Recentes</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-6">
                {/* Mini calendar */}
                <div>
                  <Calendar
                    mode="multiple"
                    selected={scheduledDates}
                    className="rounded-md border pointer-events-auto"
                    locale={ptBR}
                  />
                </div>

                {/* Recent contents */}
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-3">Últimos conteúdos</h4>
                  <ScrollArea className="h-[240px]">
                    <div className="space-y-2 pr-2">
                      {recentContents.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhum conteúdo gerado ainda
                        </p>
                      ) : (
                        recentContents.map((c) => {
                          const thumb = (c.slides as any)?.[0]?.background_url;
                          return (
                            <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors">
                              {thumb ? (
                                <img src={thumb} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-md bg-muted flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <Badge variant={statusVariant(c.status)} className="text-[10px] h-4">
                                    {statusLabel[c.status || "draft"] || c.status}
                                  </Badge>
                                  {c.scheduled_at && (
                                    <span className="text-[10px] text-muted-foreground">
                                      {format(new Date(c.scheduled_at), "dd/MM HH:mm")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatWindow />
        </div>
      </div>
    </DashboardLayout>
  );
}
