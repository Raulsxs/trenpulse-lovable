import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useProject, usePosts, useCreatePost, useCreateSlides } from "@/hooks/useStudio";
import { CONTENT_TYPE_LABELS } from "@/types/studio";
import { Plus, ArrowLeft, FileText, Image, Calendar } from "lucide-react";

export default function StudioProject() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading: loadingProject } = useProject(id!);
  const { data: posts, isLoading: loadingPosts } = usePosts(id!);
  const createPost = useCreatePost();
  const createSlides = useCreateSlides();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPost, setNewPost] = useState({ 
    raw_post_text: "", 
    content_type: "educativo" 
  });

  const handleCreatePost = async () => {
    if (!newPost.raw_post_text) return;
    
    // Create post
    const post = await createPost.mutateAsync({
      project_id: id!,
      raw_post_text: newPost.raw_post_text,
      content_type: newPost.content_type
    });
    
    // Auto-generate slides from text
    const lines = newPost.raw_post_text.split('\n').filter(l => l.trim());
    const slideTexts = [];
    
    // Simple slide splitting logic (can be enhanced with AI later)
    let currentSlide = "";
    let slideIndex = 0;
    
    for (const line of lines) {
      if (currentSlide.length + line.length > 200 || slideIndex === 0) {
        if (currentSlide) {
          slideTexts.push({ slide_text: currentSlide.trim(), slide_index: slideIndex++ });
          currentSlide = "";
        }
      }
      currentSlide += line + "\n";
    }
    
    if (currentSlide.trim()) {
      slideTexts.push({ slide_text: currentSlide.trim(), slide_index: slideIndex });
    }
    
    // Ensure at least 1 slide
    if (slideTexts.length === 0) {
      slideTexts.push({ slide_text: newPost.raw_post_text, slide_index: 0 });
    }
    
    // Create slides
    await createSlides.mutateAsync({ postId: post.id, slides: slideTexts });
    
    setNewPost({ raw_post_text: "", content_type: "educativo" });
    setDialogOpen(false);
    
    // Navigate to editor
    navigate(`/studio/post/${post.id}`);
  };

  if (loadingProject) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-64" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/studio")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-heading font-bold text-foreground">
                {project?.name}
              </h1>
              {project?.brand && (
                <Badge variant="outline">{project.brand.name}</Badge>
              )}
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Novo Post
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Criar Post</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Tipo de Conteúdo</Label>
                  <Select 
                    value={newPost.content_type}
                    onValueChange={(value) => setNewPost({ ...newPost, content_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CONTENT_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Conteúdo do Post</Label>
                  <Textarea 
                    value={newPost.raw_post_text}
                    onChange={(e) => setNewPost({ ...newPost, raw_post_text: e.target.value })}
                    placeholder="Cole aqui o texto completo do post. Cada parágrafo ou tópico será transformado em um slide..."
                    rows={10}
                  />
                  <p className="text-xs text-muted-foreground">
                    Dica: Use parágrafos ou linhas em branco para separar os slides
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button 
                  onClick={handleCreatePost} 
                  disabled={!newPost.raw_post_text || createPost.isPending}
                >
                  {createPost.isPending ? "Criando..." : "Criar Post"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Posts List */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Posts</h2>
          
          {loadingPosts ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          ) : posts && posts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {posts.map((post) => (
                <Card 
                  key={post.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/studio/post/${post.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg line-clamp-1">
                            {post.raw_post_text.substring(0, 50)}...
                          </CardTitle>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline">
                              {CONTENT_TYPE_LABELS[post.content_type]}
                            </Badge>
                            <Badge variant="secondary">
                              {post.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {post.raw_post_text}
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Image className="w-3 h-3" />
                        {(post.slides?.length || 0)} slides
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(post.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhum post ainda</h3>
                <p className="text-muted-foreground mb-4">
                  Cole o texto do seu post e gere imagens incríveis
                </p>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Primeiro Post
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
