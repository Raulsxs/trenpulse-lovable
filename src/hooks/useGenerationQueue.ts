import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fila de gerações do /agent. O usuário enfileira pedidos em linguagem livre; um worker server-side
 * (process-generation-jobs) processa UM POR VEZ e o status chega aqui AO VIVO via realtime na tabela
 * generation_jobs (ver migration 20260726120000). Enfileirar = INSERT (RLS: só os próprios) + um
 * "kick" no worker (fire-and-forget). Mesmo que o usuário feche a aba depois do kick, o worker segue
 * no servidor até esvaziar (e re-encadeia sozinho).
 */
export type JobStatus = "queued" | "processing" | "done" | "failed" | "needs_review" | "canceled";
export interface GenerationJob {
  id: string;
  prompt: string;
  title: string | null;
  status: JobStatus;
  content_id: string | null;
  error: string | null;
  model: string | null;
  brand_id: string | null;
  created_at: string;
}

const SUPABASE_URL = "https://qdmhqxpazffmaxleyzxs.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbWhxeHBhemZmbWF4bGV5enhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTI0OTQsImV4cCI6MjA4ODcyODQ5NH0.HlS0S8B1iqfO0MeUIKl8xu5unlK5jx6kvtPkcRklxuo";

export function useGenerationQueue() {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data } = await (supabase as any)
      .from("generation_jobs")
      .select("id, prompt, title, status, content_id, error, model, brand_id, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setJobs((data as GenerationJob[]) || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: reflete queued→processing→done/failed sem refresh (a policy SELECT "own" já restringe).
  // Amarrado ao userId resolvido → subscreve de forma confiável assim que o usuário é conhecido.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`generation_jobs-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generation_jobs", filter: `user_id=eq.${userId}` },
        (payload) => {
          setJobs((prev) => {
            if (payload.eventType === "DELETE") return prev.filter((j) => j.id !== (payload.old as any).id);
            const row = payload.new as GenerationJob;
            const idx = prev.findIndex((j) => j.id === row.id);
            if (idx === -1) return [row, ...prev].slice(0, 30);
            const next = [...prev];
            next[idx] = row;
            return next;
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  // "Chuta" o worker pra começar a processar já (fire-and-forget — o worker roda no servidor).
  const kick = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    fetch(`${SUPABASE_URL}/functions/v1/process-generation-jobs`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => { /* fire-and-forget: o cron é a rede de segurança */ });
  }, []);

  const enqueue = useCallback(async (prompt: string, opts?: { brandId?: string; model?: string }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "not_authenticated" };
    const title = prompt.length > 60 ? prompt.slice(0, 57) + "…" : prompt;
    const { data, error } = await (supabase as any)
      .from("generation_jobs")
      .insert({
        user_id: user.id, prompt, title, status: "queued",
        brand_id: opts?.brandId || null, model: opts?.model || null,
      })
      .select("id, prompt, title, status, content_id, error, model, brand_id, created_at")
      .single();
    if (error) return { error: error.message };
    // Atualização otimista (o realtime também traz, mas garante feedback imediato).
    setJobs((prev) => prev.some((j) => j.id === data.id) ? prev : [data as GenerationJob, ...prev]);
    kick();
    return { job: data as GenerationJob };
  }, [kick]);

  const cancelJob = useCallback(async (id: string) => {
    // Só cancela se ainda estiver na fila (o worker não pega 'canceled').
    await (supabase as any).from("generation_jobs").update({ status: "canceled" }).eq("id", id).eq("status", "queued");
  }, []);

  const removeJob = useCallback(async (id: string) => {
    await (supabase as any).from("generation_jobs").delete().eq("id", id);
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const clearFinished = useCallback(async () => {
    const finished = jobs.filter((j) => ["done", "failed", "canceled"].includes(j.status)).map((j) => j.id);
    if (!finished.length) return;
    await (supabase as any).from("generation_jobs").delete().in("id", finished);
    setJobs((prev) => prev.filter((j) => !finished.includes(j.id)));
  }, [jobs]);

  const activeCount = jobs.filter((j) => j.status === "queued" || j.status === "processing").length;

  return { jobs, enqueue, cancelJob, removeJob, clearFinished, activeCount, reload: load };
}
