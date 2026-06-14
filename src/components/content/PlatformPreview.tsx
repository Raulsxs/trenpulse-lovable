/**
 * PlatformPreview — mostra o conteúdo gerado DENTRO da plataforma de destino real
 * (feed do Instagram, Story, post do LinkedIn). Fidelização: o cliente vê "como vai
 * ficar publicado", com seu avatar/@ reais e a legenda certa por rede. Endowment effect.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Globe, ThumbsUp, Repeat2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Frame = "instagram" | "story" | "linkedin";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: string[];
  caption: string;
  hashtags?: string[];
  platformCaptions?: Record<string, string> | null;
  defaultFrame?: Frame;
}

const FRAMES: { id: Frame; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "story", label: "Story" },
  { id: "linkedin", label: "LinkedIn" },
];

export default function PlatformPreview({ open, onOpenChange, images, caption, hashtags, platformCaptions, defaultFrame = "instagram" }: Props) {
  const [frame, setFrame] = useState<Frame>(defaultFrame);
  const [profile, setProfile] = useState<{ name: string; handle: string; avatar: string | null }>({ name: "Sua marca", handle: "voce", avatar: null });
  const [slide, setSlide] = useState(0);

  useEffect(() => { if (open) { setFrame(defaultFrame); setSlide(0); } }, [open, defaultFrame]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("full_name, instagram_handle, avatar_url").eq("user_id", user.id).maybeSingle();
      if (data) {
        setProfile({
          name: (data as any).full_name || "Sua marca",
          handle: ((data as any).instagram_handle || "voce").replace(/^@+/, ""),
          avatar: (data as any).avatar_url || null,
        });
      }
    })();
  }, [open]);

  const img = images[slide] || images[0];
  const fullCaption = [caption, hashtags?.length ? hashtags.map(h => h.startsWith("#") ? h : `#${h}`).join(" ") : ""].filter(Boolean).join("\n\n");
  // Legenda por plataforma quando existir (LinkedIn/X têm versão própria)
  const linkedinCaption = platformCaptions?.linkedin || caption;

  const Avatar = ({ size = 32 }: { size?: number }) => (
    profile.avatar
      ? <img src={profile.avatar} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
      : <div className="rounded-full bg-gradient-to-br from-primary to-accent shrink-0 grid place-items-center text-white font-bold" style={{ width: size, height: size, fontSize: size * 0.4 }}>{profile.name[0]?.toUpperCase()}</div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden bg-[#fafafa] dark:bg-neutral-900">
        <DialogTitle className="sr-only">Pré-visualização do conteúdo na rede social</DialogTitle>
        {/* Switcher de plataforma */}
        <div className="flex items-center gap-1 p-2 bg-background border-b border-border">
          {FRAMES.map((f) => (
            <button
              key={f.id}
              onClick={() => setFrame(f.id)}
              className={cn("flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors", frame === f.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {f.label}
            </button>
          ))}
          {/* fecha: o próprio DialogContent já tem o X no canto — não duplicar aqui */}
          <span className="w-6 shrink-0" aria-hidden="true" />
        </div>

        <div className="max-h-[78vh] overflow-y-auto">
          {/* ── INSTAGRAM FEED ── */}
          {frame === "instagram" && (
            <div className="bg-white dark:bg-black text-black dark:text-white">
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <Avatar size={32} />
                <span className="text-sm font-semibold flex-1">{profile.handle}</span>
                <MoreHorizontal className="w-5 h-5" />
              </div>
              <div className="relative aspect-square bg-neutral-100 dark:bg-neutral-800">
                <img src={img} alt="" className="w-full h-full object-cover" />
                {images.length > 1 && (
                  <>
                    <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">{slide + 1}/{images.length}</div>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                      {images.map((_, i) => <span key={i} className={cn("w-1.5 h-1.5 rounded-full", i === slide ? "bg-primary" : "bg-white/60")} />)}
                    </div>
                  </>
                )}
              </div>
              <div className="px-3 pt-2.5 pb-1 flex items-center gap-4">
                <Heart className="w-6 h-6" /><MessageCircle className="w-6 h-6" /><Send className="w-6 h-6" />
                <Bookmark className="w-6 h-6 ml-auto" />
              </div>
              <div className="px-3 pb-3 text-sm">
                <p className="font-semibold mb-1">1.248 curtidas</p>
                <p className="whitespace-pre-line leading-snug"><span className="font-semibold">{profile.handle}</span> {fullCaption}</p>
              </div>
            </div>
          )}

          {/* ── INSTAGRAM STORY ── */}
          {frame === "story" && (
            <div className="relative bg-neutral-900 aspect-[9/16] max-h-[78vh] mx-auto">
              {/* object-contain (letterbox) — conteúdo quadrado num frame 9:16 não pode ser cortado */}
              <img src={img} alt="" className="w-full h-full object-contain" />
              <div className="absolute top-0 inset-x-0 p-2">
                <div className="flex gap-1 mb-2">{(images.length > 1 ? images : [0]).map((_, i) => <span key={i} className={cn("h-0.5 flex-1 rounded-full", i <= slide ? "bg-white" : "bg-white/40")} />)}</div>
                <div className="flex items-center gap-2">
                  <Avatar size={28} />
                  <span className="text-white text-sm font-semibold drop-shadow">{profile.handle}</span>
                  <span className="text-white/70 text-xs">agora</span>
                  <X className="w-5 h-5 text-white ml-auto drop-shadow" />
                </div>
              </div>
            </div>
          )}

          {/* ── LINKEDIN POST ── */}
          {frame === "linkedin" && (
            <div className="bg-white dark:bg-neutral-800 text-black dark:text-white">
              <div className="flex items-start gap-2.5 px-3 py-2.5">
                <Avatar size={44} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight">{profile.name}</p>
                  <p className="text-xs text-neutral-500 leading-tight truncate">Especialista · Criador de conteúdo</p>
                  <p className="text-xs text-neutral-500 flex items-center gap-1">agora · <Globe className="w-3 h-3" /></p>
                </div>
                <MoreHorizontal className="w-5 h-5 text-neutral-500" />
              </div>
              <p className="px-3 pb-2.5 text-sm whitespace-pre-line leading-snug">{linkedinCaption}</p>
              <div className="aspect-square bg-neutral-100 dark:bg-neutral-700">
                <img src={img} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="px-3 py-2 flex items-center justify-between text-neutral-500 text-xs border-t border-neutral-200 dark:border-neutral-700 mt-1">
                <span className="flex items-center gap-1"><ThumbsUp className="w-4 h-4" /> Gostei</span>
                <span className="flex items-center gap-1"><MessageCircle className="w-4 h-4" /> Comentar</span>
                <span className="flex items-center gap-1"><Repeat2 className="w-4 h-4" /> Repostar</span>
                <span className="flex items-center gap-1"><Send className="w-4 h-4" /> Enviar</span>
              </div>
            </div>
          )}
        </div>

        {/* Navegação de slides (carrossel) */}
        {images.length > 1 && frame !== "linkedin" && (
          <div className="flex items-center justify-center gap-2 p-2 bg-background border-t border-border">
            <button onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0} className="px-3 py-1 text-xs rounded-md border border-border disabled:opacity-40">‹ Anterior</button>
            <span className="text-xs text-muted-foreground tabular-nums">{slide + 1} / {images.length}</span>
            <button onClick={() => setSlide(s => Math.min(images.length - 1, s + 1))} disabled={slide === images.length - 1} className="px-3 py-1 text-xs rounded-md border border-border disabled:opacity-40">Próximo ›</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
