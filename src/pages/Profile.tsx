import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Save, Loader2, Briefcase, X, Coins, Sparkles, Link2, CheckCircle2, ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ImageEditorModal from "@/components/ui/ImageEditorModal";
import ProfilePreferences from "@/components/profile/ProfilePreferences";
import SocialConnections from "@/components/profile/SocialConnections";
import BuyCreditsModal from "@/components/billing/BuyCreditsModal";
import { useCredits } from "@/hooks/useCredits";
import { Camera } from "lucide-react";

interface ProfileRow {
  id: string;
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  instagram_handle: string | null;
  avatar_url: string | null;
  native_language: string;
  secondary_languages: string[];
  preferred_tone: string;
  preferred_audience: string;
  rss_sources: string[];
  interest_areas: string[];
}

const VOICE_OPTIONS = [
  { value: "profissional", label: "Profissional" },
  { value: "casual", label: "Casual" },
  { value: "técnico", label: "Técnico" },
  { value: "inspirador", label: "Inspirador" },
  { value: "educativo", label: "Educativo" },
  { value: "bem-humorado", label: "Bem-humorado" },
  { value: "natural", label: "Natural" },
];

const AUDIENCE_OPTIONS = [
  { value: "empreendedores", label: "Empreendedores" },
  { value: "gestores", label: "Gestores e líderes" },
  { value: "profissionais", label: "Profissionais da área" },
  { value: "estudantes", label: "Estudantes" },
  { value: "clientes_finais", label: "Clientes finais (B2C)" },
  { value: "empresas", label: "Empresas (B2B)" },
  { value: "geral", label: "Público geral" },
];

const Profile = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState("conta");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const { balance, loading: creditsLoading, refresh: refreshCredits } = useCredits();
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    company_name: "",
    instagram_handle: "",
    native_language: "pt-BR",
    secondary_languages: [] as string[],
    preferred_tone: "profissional",
    preferred_audience: "gestores",
    interest_areas: [] as string[],
    rss_sources: [] as string[],
    bilingual_platforms: [] as string[],
  });

  const [contentSettings, setContentSettings] = useState({
    business_niche: "",
    brand_voice: "natural",
    content_topics: [] as string[],
    reference_sources: [] as string[],
  });
  const [newTopic, setNewTopic] = useState("");

  useEffect(() => {
    fetchProfile();
  }, []);

  // Handle OAuth callback params — manda direto pra aba Conexões pra ver o resultado
  useEffect(() => {
    const connected = searchParams.get("pfm_connected");
    const error = searchParams.get("pfm_error");
    if (connected) {
      toast.success(`${connected} conectado com sucesso!`);
      setTab("conexoes");
      searchParams.delete("pfm_connected");
      setSearchParams(searchParams, { replace: true });
    }
    if (error) {
      toast.error(`Erro ao conectar: ${error}`);
      setTab("conexoes");
      searchParams.delete("pfm_error");
      setSearchParams(searchParams, { replace: true });
    }
    // deep-link opcional: ?tab=plano | conexoes | conta
    const t = searchParams.get("tab");
    if (t === "plano" || t === "conexoes" || t === "conta") setTab(t);
  }, [searchParams, setSearchParams]);

  const fetchProfile = async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) { navigate("/auth"); return; }
      const uid = session.session.user.id;

      const [profileRes, ctxRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", uid).single(),
        supabase.from("ai_user_context").select("business_niche, brand_voice, content_topics, extra_context").eq("user_id", uid).maybeSingle(),
      ]);

      if (profileRes.error && profileRes.error.code !== "PGRST116") throw profileRes.error;

      if (profileRes.data) {
        const row = profileRes.data as unknown as ProfileRow;
        setProfile(row);
        setFormData({
          full_name: row.full_name || "",
          company_name: row.company_name || "",
          instagram_handle: row.instagram_handle || "",
          native_language: row.native_language || "pt-BR",
          secondary_languages: row.secondary_languages || [],
          preferred_tone: row.preferred_tone || "profissional",
          preferred_audience: row.preferred_audience || "gestores",
          interest_areas: row.interest_areas || [],
          rss_sources: row.rss_sources || [],
          bilingual_platforms: [] as string[],
        });
      }

      if (ctxRes.data) {
        const extra = (ctxRes.data.extra_context as Record<string, any>) || {};
        setContentSettings({
          business_niche: ctxRes.data.business_niche || "",
          brand_voice: ctxRes.data.brand_voice || "natural",
          content_topics: ctxRes.data.content_topics || [],
          reference_sources: (extra.reference_sources as string[]) || [],
        });
        if (extra.bilingual_platforms) {
          setFormData(prev => ({ ...prev, bilingual_platforms: extra.bilingual_platforms || [] }));
        }
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Erro ao carregar perfil");
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    setUploading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Não autenticado");

      const fileExt = file.name.split(".").pop();
      const fileName = `${session.session.user.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from("content-images").upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(fileName);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("user_id", session.session.user.id);
      setProfile((prev) => prev ? { ...prev, avatar_url: avatarUrl } : null);
      toast.success("Avatar atualizado!");
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast.error("Erro ao fazer upload do avatar");
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (e.target) e.target.value = "";
    setEditorFile(file);
    setEditorOpen(true);
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addTopic = () => {
    const t = newTopic.trim();
    if (t && !contentSettings.content_topics.includes(t)) {
      setContentSettings(prev => ({ ...prev, content_topics: [...prev.content_topics, t] }));
      setNewTopic("");
    }
  };

  const removeTopic = (topic: string) => {
    setContentSettings(prev => ({ ...prev, content_topics: prev.content_topics.filter(t => t !== topic) }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error("Não autenticado");
      const uid = session.session.user.id;

      const [profileRes, ctxFetchRes] = await Promise.all([
        supabase.from("profiles").upsert({
          user_id: uid,
          full_name: formData.full_name,
          company_name: formData.company_name,
          instagram_handle: formData.instagram_handle,
          native_language: formData.native_language,
          secondary_languages: formData.secondary_languages,
          preferred_tone: formData.preferred_tone,
          preferred_audience: formData.preferred_audience,
          interest_areas: formData.interest_areas,
          rss_sources: formData.rss_sources,
        } as any, { onConflict: 'user_id' }),
        supabase.from("ai_user_context").select("extra_context").eq("user_id", uid).maybeSingle(),
      ]);

      if (profileRes.error) throw profileRes.error;

      const existingExtra = (ctxFetchRes.data?.extra_context as Record<string, any>) || {};
      const ctxPayload = {
        user_id: uid,
        business_niche: contentSettings.business_niche || null,
        brand_voice: contentSettings.brand_voice || null,
        content_topics: contentSettings.content_topics.length > 0 ? contentSettings.content_topics : null,
        extra_context: { ...existingExtra, reference_sources: contentSettings.reference_sources, bilingual_platforms: formData.bilingual_platforms },
      };
      const { error: ctxErr } = await supabase.from("ai_user_context").upsert(ctxPayload as any, { onConflict: 'user_id' });

      if (ctxErr) throw ctxErr;

      toast.success("Perfil atualizado com sucesso!");
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error("Erro ao salvar perfil");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Card de créditos — fonte de verdade: tabela user_credits (modelo pré-pago, não expira).
  // Sem barra de teto: créditos prepagos não têm denominador.
  const creditsCard = (
    <Card className="shadow-card border-border/50 overflow-hidden">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plano &amp; Créditos</span>
          <Badge variant="outline" className="text-[10px] border-[hsl(var(--credit))]/30 text-[hsl(var(--credit))] bg-[hsl(var(--credit-bg))]">
            pré-pago
          </Badge>
        </div>
        <div className="flex items-baseline gap-2">
          <Coins className="w-5 h-5 text-[hsl(var(--credit))] shrink-0 self-center" />
          {creditsLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-4xl font-heading font-extrabold text-[hsl(var(--credit))] tabular-nums leading-none">
              {(balance ?? 0).toLocaleString("pt-BR")}
            </span>
          )}
          <span className="text-sm text-muted-foreground">créditos</span>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          ≈ {Math.floor((balance ?? 0) / 8)} posts com imagem · não expiram
        </p>
        <Button onClick={() => setBuyOpen(true)} className="w-full gap-2">
          <Sparkles className="w-4 h-4" />
          Recarregar créditos
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in max-w-5xl">
      <ImageEditorModal
        open={editorOpen}
        file={editorFile}
        onConfirm={(editedFile) => { setEditorOpen(false); setEditorFile(null); handleAvatarUpload(editedFile); }}
        onCancel={() => { setEditorOpen(false); setEditorFile(null); }}
        aspectRatio={1}
        title="Ajustar foto de perfil"
      />
      <BuyCreditsModal open={buyOpen} onClose={() => setBuyOpen(false)} onCredited={refreshCredits} />

      {/* Header: avatar + nome + Salvar (fixo acima das abas) */}
      <div className="flex items-center gap-4">
        <div className="relative group shrink-0">
          <Avatar className="w-14 h-14 border-2 border-primary/20">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="text-lg bg-primary/10 text-primary">
              {formData.full_name?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
            {uploading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} disabled={uploading} />
          </label>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-heading font-bold text-foreground truncate">{formData.full_name || "Seu nome"}</h1>
          <p className="text-sm text-muted-foreground truncate">{formData.company_name || "Sua empresa"}</p>
        </div>
        <Button onClick={handleSave} className="gap-2 shrink-0" disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="conta">Conta</TabsTrigger>
          <TabsTrigger value="conexoes">Conexões</TabsTrigger>
          <TabsTrigger value="plano">Plano &amp; Créditos</TabsTrigger>
        </TabsList>

        {/* ───────── Aba Conta ───────── */}
        <TabsContent value="conta" className="mt-0">
          <div className="grid lg:grid-cols-2 gap-6 items-start">
            {/* Coluna esquerda: dados pessoais + preferências globais */}
            <div className="space-y-6">
              <Card className="shadow-card border-border/50">
                <CardHeader>
                  <CardTitle className="text-base">Dados pessoais</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Nome completo</Label>
                    <Input id="full_name" value={formData.full_name} onChange={(e) => handleFieldChange("full_name", e.target.value)} placeholder="Seu nome completo" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company_name">Empresa / Instituição</Label>
                    <Input id="company_name" value={formData.company_name} onChange={(e) => handleFieldChange("company_name", e.target.value)} placeholder="Nome da empresa" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="instagram_handle">Handle do Instagram</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                      <Input
                        id="instagram_handle"
                        value={formData.instagram_handle}
                        onChange={(e) => handleFieldChange("instagram_handle", e.target.value.replace(/[^a-zA-Z0-9._]/g, ""))}
                        placeholder="seu_usuario"
                        className="pl-8"
                        maxLength={30}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card border-border/50">
                <CardHeader>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-primary" />
                      Preferências globais
                    </CardTitle>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      a marca sobrescreve
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Usadas quando você gera sem uma marca selecionada. Se uma marca estiver ativa, os valores dela prevalecem.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="business_niche">Nicho / Área</Label>
                      <Input
                        id="business_niche"
                        value={contentSettings.business_niche}
                        onChange={e => setContentSettings(prev => ({ ...prev, business_niche: e.target.value }))}
                        placeholder="Ex: Marketing, Saúde..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="brand_voice">Tom padrão</Label>
                      <Select
                        value={contentSettings.brand_voice}
                        onValueChange={v => setContentSettings(prev => ({ ...prev, brand_voice: v }))}
                      >
                        <SelectTrigger id="brand_voice"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {VOICE_OPTIONS.map(o => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Público padrão</Label>
                    <Select value={formData.preferred_audience} onValueChange={v => handleFieldChange("preferred_audience", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AUDIENCE_OPTIONS.map(a => (<SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Temas de conteúdo</Label>
                    <p className="text-xs text-muted-foreground">Temas que você publica com frequência — influenciam sugestões e geração</p>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {contentSettings.content_topics.map(topic => (
                        <Badge key={topic} variant="secondary" className="gap-1 pr-1">
                          {topic}
                          <button type="button" onClick={() => removeTopic(topic)} className="ml-1 hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newTopic}
                        onChange={e => setNewTopic(e.target.value)}
                        placeholder="Ex: liderança, inovação..."
                        onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTopic())}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={addTopic}>Adicionar</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <ProfilePreferences
                secondaryLanguages={formData.secondary_languages}
                bilingualPlatforms={formData.bilingual_platforms}
                rssSources={formData.rss_sources}
                onChange={handleFieldChange}
              />
            </div>

            {/* Coluna direita: plano/créditos + conexões em destaque */}
            <div className="space-y-6">
              {creditsCard}

              <Card className="shadow-card border-border/50">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Conexões · auto-publish</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Conecte suas redes para publicar e agendar direto do TrendPulse.
                  </p>
                  <Button variant="outline" className="w-full gap-2" onClick={() => setTab("conexoes")}>
                    Gerenciar conexões
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ───────── Aba Conexões ───────── */}
        <TabsContent value="conexoes" className="mt-0">
          <SocialConnections />
        </TabsContent>

        {/* ───────── Aba Plano & Créditos ───────── */}
        <TabsContent value="plano" className="mt-0">
          <div className="grid lg:grid-cols-2 gap-6 items-start">
            {creditsCard}

            <Card className="shadow-card border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[hsl(var(--credit))]" />
                  Como funcionam os créditos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[hsl(var(--credit))] mt-0.5 shrink-0" />
                  Você paga só pelo que gera — cada ação mostra o custo em créditos antes de confirmar.
                </p>
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[hsl(var(--credit))] mt-0.5 shrink-0" />
                  Créditos <strong className="text-foreground font-medium">não expiram</strong>: o saldo fica disponível até você usar.
                </p>
                <p className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[hsl(var(--credit))] mt-0.5 shrink-0" />
                  Recarregue por PIX (na hora) ou cartão — pacotes maiores rendem bônus.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Profile;
