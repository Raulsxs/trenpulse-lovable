import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Instagram,
  ExternalLink,
  Loader2,
  CalendarDays,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PublishedContent {
  id: string;
  title: string;
  content_type: string;
  published_at: string;
  instagram_media_id: string;
  slides: any[];
  caption: string | null;
  brand_snapshot: any;
}

const InstagramHistory = () => {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<PublishedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 20;

  const fetchPosts = async (pageNum: number) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("generated_contents")
        .select("id, title, content_type, published_at, instagram_media_id, slides, caption, brand_snapshot")
        .eq("user_id", user.id)
        .eq("status", "published")
        .not("instagram_media_id", "is", null)
        .order("published_at", { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      setPosts(data as unknown as PublishedContent[] || []);
      setHasMore((data?.length || 0) === PAGE_SIZE);
    } catch (error) {
      console.error("Error fetching history:", error);
      toast.error("Erro ao carregar histórico");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPosts(page); }, [page]);

  const getThumb = (slides: any[]) => {
    if (!slides?.length) return null;
    return slides[0]?.image_url || slides[0]?.previewImage || slides[0]?.imageUrl || slides[0]?.background_image_url;
  };

  const formatBadge = (type: string) => {
    switch (type) {
      case "carousel": return "Carrossel";
      case "story": return "Story";
      default: return "Post";
    }
  };

  const getInstagramLink = (mediaId: string) => {
    // Instagram media IDs can be used to construct a permalink
    // However, the actual permalink format requires the shortcode
    // We'll link to the content editor as fallback
    return null;
  };

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
              <Instagram className="w-7 h-7 text-primary" />
              Histórico de Publicações
            </h1>
            <p className="text-muted-foreground text-sm">
              Todos os conteúdos publicados no Instagram
            </p>
          </div>
          <Badge variant="secondary" className="text-sm px-3 py-1">
            {loading ? "..." : `${posts.length} publicações`}
          </Badge>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : posts.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Instagram className="w-12 h-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">Nenhuma publicação ainda</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Seus posts publicados no Instagram aparecerão aqui com data, thumbnail e link.
              </p>
              <Button variant="outline" className="mt-4 gap-2" onClick={() => navigate("/calendar")}>
                <CalendarDays className="w-4 h-4" />
                Ir ao Calendário
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {posts.map(post => {
                const thumb = getThumb(post.slides);
                return (
                  <Card
                    key={post.id}
                    className="group overflow-hidden border-border/50 hover:shadow-lg transition-all cursor-pointer"
                    onClick={() => navigate(`/content/${post.id}`)}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-muted relative overflow-hidden">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={post.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-10 h-10 text-muted-foreground/30" />
                        </div>
                      )}
                      {/* Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="secondary" className="w-full gap-1.5 text-xs bg-background/90 backdrop-blur">
                          <ExternalLink className="w-3 h-3" />
                          Ver Detalhes
                        </Button>
                      </div>
                      {/* Format badge */}
                      <Badge
                        variant="secondary"
                        className="absolute top-2 right-2 text-[10px] bg-background/80 backdrop-blur"
                      >
                        {formatBadge(post.content_type)}
                      </Badge>
                    </div>

                    {/* Info */}
                    <CardContent className="p-3 space-y-1.5">
                      <p className="text-sm font-medium text-foreground truncate">{post.title}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {post.published_at
                            ? format(new Date(post.published_at), "dd MMM yyyy, HH:mm", { locale: ptBR })
                            : "—"}
                        </span>
                      </div>
                      {post.brand_snapshot?.name && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {post.brand_snapshot.name}
                        </p>
                      )}
                      {post.caption && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {post.caption}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                className="gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page + 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore}
                onClick={() => setPage(p => p + 1)}
                className="gap-1"
              >
                Próxima
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default InstagramHistory;
