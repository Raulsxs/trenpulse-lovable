import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { User, Save, Loader2, Briefcase, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProfileAvatarSection from "@/components/profile/ProfileAvatarSection";
import ProfilePersonalInfo from "@/components/profile/ProfilePersonalInfo";
import ProfilePreferences from "@/components/profile/ProfilePreferences";
import SocialConnections from "@/components/profile/SocialConnections";

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
  const [profile, setProfile] = useState<ProfileRow | null>(null);
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
  });

  const [contentSettings, setContentSettings] = useState({
    business_niche: "",
    brand_voice: "natural",
    content_topics: [] as string[],
    reference_sources: [] as string[],
  });
  const [newTopic, setNewTopic] = useState("");
  const [newSource, setNewSource] = useState("");

  useEffect(() => {
    fetchProfile();
  }, []);

  // Handle OAuth callback params
  useEffect(() => {
    const connected = searchParams.get("pfm_connected");
    const error = searchParams.get("pfm_error");
    if (connected) {
      toast.success(`${connected} conectado com sucesso!`);
      searchParams.delete("pfm_connected");
      setSearchParams(searchParams, { replace: true });
    }
    if (error) {
      toast.error(`Erro ao conectar: ${error}`);
      searchParams.delete("pfm_error");
      setSearchParams(searchParams, { replace: true });
    }
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

  const addSource = () => {
    const s = newSource.trim();
    if (s && !contentSettings.reference_sources.includes(s)) {
      setContentSettings(prev => ({ ...prev, reference_sources: [...prev.reference_sources, s] }));
      setNewSource("");
    }
  };

  const removeSource = (source: string) => {
    setContentSettings(prev => ({ ...prev, reference_sources: prev.reference_sources.filter(s => s !== source) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        extra_context: { ...existingExtra, reference_sources: contentSettings.reference_sources },
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
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6 animate-fade-in max-w-4xl">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground flex items-center gap-2">
            <User className="w-7 h-7 text-primary" />
            Meu Perfil
            
          </h1>
          <p className="text-muted-foreground mt-1">Gerencie suas informações pessoais e preferências</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <ProfileAvatarSection
            avatarUrl={profile?.avatar_url}
            fullName={formData.full_name}
            companyName={formData.company_name}
            uploading={uploading}
            onAvatarUpload={handleAvatarUpload}
          />

          <ProfilePersonalInfo
            fullName={formData.full_name}
            companyName={formData.company_name}
            instagramHandle={formData.instagram_handle}
            onChange={handleFieldChange}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Briefcase className="w-5 h-5 text-primary" />
                Configurações de Conteúdo
              </CardTitle>
              <p className="text-sm text-muted-foreground">Essas informações personalizam a geração de conteúdo e as sugestões de temas</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="business_niche">Nicho / Área de atuação</Label>
                  <Input
                    id="business_niche"
                    value={contentSettings.business_niche}
                    onChange={e => setContentSettings(prev => ({ ...prev, business_niche: e.target.value }))}
                    placeholder="Ex: Marketing Digital, Gastronomia..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand_voice">Tom de voz</Label>
                  <Select
                    value={contentSettings.brand_voice}
                    onValueChange={v => setContentSettings(prev => ({ ...prev, brand_voice: v }))}
                  >
                    <SelectTrigger id="brand_voice">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VOICE_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Público-alvo</Label>
                  <Select
                    value={formData.preferred_audience}
                    onValueChange={v => handleFieldChange("preferred_audience", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIENCE_OPTIONS.map(a => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                    placeholder="Ex: liderança, inovação, tendências..."
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTopic())}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addTopic}>Adicionar</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <ProfilePreferences
            secondaryLanguages={formData.secondary_languages}
            rssSources={formData.rss_sources}
            onChange={handleFieldChange}
          />

          <SocialConnections />

          <div className="flex justify-end">
            <Button type="submit" className="gap-2" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Alterações
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
};

export default Profile;
