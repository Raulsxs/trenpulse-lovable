import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Repeat, Upload, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RecurringSchedule {
  id: string;
  user_id: string;
  content_id: string;
  name: string | null;
  platforms: string[];
  days_of_week: number[];
  hour_utc: number;
  jitter_minutes: number;
  active: boolean;
  last_run_at: string | null;
  created_at: string;
}

const JITTER_OPTIONS = [
  { value: 0, label: "Exato" },
  { value: 15, label: "± 15 min" },
  { value: 30, label: "± 30 min" },
  { value: 60, label: "± 1 hora" },
];

interface ContentOption {
  id: string;
  title: string | null;
  content_type: string;
  platform: string;
  image_urls: string[] | null;
}

const DAY_LABELS = [
  { dow: 0, label: "Dom" },
  { dow: 1, label: "Seg" },
  { dow: 2, label: "Ter" },
  { dow: 3, label: "Qua" },
  { dow: 4, label: "Qui" },
  { dow: 5, label: "Sex" },
  { dow: 6, label: "Sáb" },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);

const PLATFORM_OPTIONS = [
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X (Twitter)" },
  { id: "tiktok", label: "TikTok" },
];

const CONTENT_TYPE_OPTIONS = [
  { id: "post", label: "Post (1:1)" },
  { id: "story", label: "Story (9:16)" },
  { id: "carousel", label: "Carrossel" },
];

// UTC offset of the user's local browser, used to translate the picker hour to hour_utc.
const localToUtcHour = (localHour: number) => ((localHour - new Date().getTimezoneOffset() / -60) + 24) % 24;
const utcToLocalHour = (utcHour: number) => ((utcHour + new Date().getTimezoneOffset() / -60) + 24) % 24;

export default function RecurringSchedules({ userId }: { userId: string }) {
  const [schedules, setSchedules] = useState<RecurringSchedule[]>([]);
  const [contents, setContents] = useState<ContentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Create-form state
  const [mode, setMode] = useState<"existing" | "upload">("existing");
  const [name, setName] = useState("");
  const [selectedContentId, setSelectedContentId] = useState<string>("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadType, setUploadType] = useState<string>("post");
  const [uploadPlatform, setUploadPlatform] = useState<string>("instagram");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [selectedHourLocal, setSelectedHourLocal] = useState<number>(9);
  const [selectedJitter, setSelectedJitter] = useState<number>(15);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram"]);
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [{ data: scheds }, { data: ctns }] = await Promise.all([
      supabase
        .from("recurring_schedules")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("generated_contents")
        .select("id, title, content_type, platform, image_urls")
        .eq("user_id", userId)
        .not("image_urls", "is", null)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setSchedules((scheds as RecurringSchedule[]) || []);
    setContents((ctns as ContentOption[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const resetForm = () => {
    setMode("existing");
    setName("");
    setSelectedContentId("");
    setUploadFile(null);
    setUploadCaption("");
    setUploadType("post");
    setUploadPlatform("instagram");
    setSelectedDays([1, 2, 3, 4, 5]);
    setSelectedHourLocal(9);
    setSelectedJitter(15);
    setSelectedPlatforms(["instagram"]);
  };

  const toggleDay = (dow: number) => {
    setSelectedDays(prev => prev.includes(dow) ? prev.filter(d => d !== dow) : [...prev, dow].sort());
  };

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const handleUploadAndCreateContent = async (): Promise<string | null> => {
    if (!uploadFile) return null;
    const ext = (uploadFile.name.split(".").pop() || "png").toLowerCase();
    const path = `recurring/${userId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("generated-images").upload(path, uploadFile, {
      contentType: uploadFile.type || `image/${ext}`,
      upsert: false,
    });
    if (upErr) {
      toast.error("Erro no upload: " + upErr.message);
      return null;
    }
    const { data: urlData } = supabase.storage.from("generated-images").getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    const { data: inserted, error: insertErr } = await supabase
      .from("generated_contents")
      .insert({
        user_id: userId,
        title: name || uploadFile.name,
        caption: uploadCaption || null,
        image_urls: [publicUrl],
        slides: [{
          headline: "",
          body: "",
          image_url: publicUrl,
          background_image_url: publicUrl,
          render_mode: "ai_full_design",
        }],
        platform: uploadPlatform,
        content_type: uploadType,
        status: "draft",
        visual_mode: "ai_full_design",
        generation_metadata: { source: "manual_upload" },
      })
      .select("id")
      .maybeSingle();

    if (insertErr || !inserted) {
      toast.error("Erro ao salvar conteúdo: " + (insertErr?.message || "desconhecido"));
      return null;
    }
    return inserted.id;
  };

  const handleCreate = async () => {
    if (selectedDays.length === 0) {
      toast.error("Escolha pelo menos um dia da semana");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast.error("Escolha pelo menos uma plataforma");
      return;
    }
    setSubmitting(true);
    try {
      let contentId = selectedContentId;
      if (mode === "upload") {
        if (!uploadFile) {
          toast.error("Escolha um arquivo para fazer upload");
          setSubmitting(false);
          return;
        }
        const created = await handleUploadAndCreateContent();
        if (!created) { setSubmitting(false); return; }
        contentId = created;
      }
      if (!contentId) {
        toast.error("Escolha um conteúdo do histórico ou faça upload");
        setSubmitting(false);
        return;
      }

      const hourUtc = Math.round(localToUtcHour(selectedHourLocal));

      const { error } = await supabase.from("recurring_schedules").insert({
        user_id: userId,
        content_id: contentId,
        name: name || null,
        platforms: selectedPlatforms,
        days_of_week: selectedDays,
        hour_utc: hourUtc,
        jitter_minutes: selectedJitter,
        active: true,
      });

      if (error) {
        toast.error("Erro ao criar agendamento: " + error.message);
        setSubmitting(false);
        return;
      }
      toast.success("Agendamento recorrente criado!");
      setCreateOpen(false);
      resetForm();
      fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (sched: RecurringSchedule) => {
    setBusyId(sched.id);
    const { error } = await supabase
      .from("recurring_schedules")
      .update({ active: !sched.active })
      .eq("id", sched.id);
    setBusyId(null);
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    setSchedules(prev => prev.map(s => s.id === sched.id ? { ...s, active: !sched.active } : s));
  };

  const handleDelete = async (sched: RecurringSchedule) => {
    if (!confirm(`Excluir agendamento "${sched.name || "sem nome"}"?`)) return;
    setBusyId(sched.id);
    const { error } = await supabase.from("recurring_schedules").delete().eq("id", sched.id);
    setBusyId(null);
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    setSchedules(prev => prev.filter(s => s.id !== sched.id));
    toast.success("Agendamento excluído");
  };

  const contentMap = useMemo(() => {
    const m = new Map<string, ContentOption>();
    contents.forEach(c => m.set(c.id, c));
    return m;
  }, [contents]);

  const formatDays = (days: number[]) => {
    if (days.length === 7) return "Todos os dias";
    if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return "Seg–Sex";
    if (days.length === 2 && days.includes(0) && days.includes(6)) return "Fim de semana";
    return days.map(d => DAY_LABELS[d]?.label).join(", ");
  };

  const formatHour = (utcHour: number) => {
    const local = Math.round(utcToLocalHour(utcHour));
    return `${local.toString().padStart(2, "0")}:00`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Repeat className="w-4 h-4 text-primary" />
          <CardTitle className="text-base">Agendamentos recorrentes</CardTitle>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Novo recorrente
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum agendamento recorrente. Crie um para postar conteúdo automaticamente em dias e horários fixos.
          </p>
        ) : (
          <div className="space-y-2">
            {schedules.map(sched => {
              const content = contentMap.get(sched.content_id);
              const preview = content?.image_urls?.[0];
              return (
                <div
                  key={sched.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${sched.active ? "border-border bg-background" : "border-dashed border-border/60 bg-muted/30 opacity-70"}`}
                >
                  {preview ? (
                    <img src={preview} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0">
                      <ImageIcon className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {sched.name || content?.title || "Sem nome"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {formatDays(sched.days_of_week)} · {formatHour(sched.hour_utc)}{sched.jitter_minutes > 0 ? ` (±${sched.jitter_minutes}min)` : ""} · {sched.platforms.join(", ")}
                    </p>
                  </div>
                  <Switch
                    checked={sched.active}
                    onCheckedChange={() => handleToggleActive(sched)}
                    disabled={busyId === sched.id}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(sched)}
                    disabled={busyId === sched.id}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo agendamento recorrente</DialogTitle>
            <DialogDescription>
              Configure um conteúdo para ser publicado automaticamente em dias e horários fixos da semana.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome (opcional)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Story diário motivacional"
              />
            </div>

            <div className="space-y-2">
              <Label>Conteúdo a publicar</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "existing" ? "default" : "outline"}
                  onClick={() => setMode("existing")}
                  className="flex-1"
                >
                  Do meu histórico
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "upload" ? "default" : "outline"}
                  onClick={() => setMode("upload")}
                  className="flex-1"
                >
                  <Upload className="w-3 h-3 mr-1" />
                  Subir nova
                </Button>
              </div>

              {mode === "existing" ? (
                <Select value={selectedContentId} onValueChange={setSelectedContentId}>
                  <SelectTrigger>
                    <SelectValue placeholder={contents.length === 0 ? "Nenhum conteúdo gerado ainda" : "Escolha um conteúdo"} />
                  </SelectTrigger>
                  <SelectContent>
                    {contents.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="text-xs text-muted-foreground mr-2">[{c.content_type}]</span>
                        {c.title || "Sem título"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-2 border border-border rounded-md p-3">
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="text-xs"
                  />
                  {uploadFile && (
                    <p className="text-xs text-muted-foreground truncate">📎 {uploadFile.name}</p>
                  )}
                  <Textarea
                    value={uploadCaption}
                    onChange={(e) => setUploadCaption(e.target.value)}
                    placeholder="Caption (opcional — pode adicionar depois)"
                    rows={2}
                    className="text-xs"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={uploadType} onValueChange={setUploadType}>
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONTENT_TYPE_OPTIONS.map(opt => <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={uploadPlatform} onValueChange={setUploadPlatform}>
                      <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PLATFORM_OPTIONS.map(opt => <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Dias da semana</Label>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_LABELS.map(d => (
                  <button
                    key={d.dow}
                    type="button"
                    onClick={() => toggleDay(d.dow)}
                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                      selectedDays.includes(d.dow)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Horário (no seu fuso)</Label>
                <Select value={String(selectedHourLocal)} onValueChange={(v) => setSelectedHourLocal(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_OPTIONS.map(h => (
                      <SelectItem key={h} value={String(h)}>
                        {h.toString().padStart(2, "0")}:00
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label title="Variar o horário aleatoriamente para evitar parecer bot">
                  Variar horário
                </Label>
                <Select value={String(selectedJitter)} onValueChange={(v) => setSelectedJitter(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JITTER_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Plataformas</Label>
              <div className="flex gap-1.5 flex-wrap">
                {PLATFORM_OPTIONS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlatform(p.id)}
                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                      selectedPlatforms.includes(p.id)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="ghost" onClick={() => { setCreateOpen(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Criar agendamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
