import type { Session } from "@supabase/supabase-js";

/**
 * Contas salvas no aparelho para o switcher multi-conta.
 *
 * POR QUE VIROU MÓDULO: o salvamento vivia copiado dentro do Auth.tsx (no login por senha e na
 * troca de conta). O login com Google não passa por nenhum dos dois — ele volta por REDIRECT, para
 * outra página — então uma terceira cópia colada em algum lugar era o caminho natural, e o caminho
 * errado. Com o helper aqui, quem estabelece sessão só chama `rememberAccount(session)`.
 *
 * Guardamos access + refresh token em localStorage. Não é ideal, mas é o que permite trocar de conta
 * sem refazer login, e é a mesma superfície de risco que a sessão do próprio Supabase já tem
 * (o client está configurado com `storage: localStorage`).
 */

const KEY = "tp_saved_accounts";
const MAX = 5;

export interface SavedAccount {
  userId: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
}

export function loadAccounts(): SavedAccount[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: SavedAccount[]): void {
  const trimmed = accounts.slice(-MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // Cota do localStorage estourada: descarta a conta mais antiga e tenta uma vez.
    try {
      localStorage.setItem(KEY, JSON.stringify(trimmed.slice(1)));
    } catch {
      // Desiste em silêncio — o usuário só fica sem multi-conta neste aparelho.
    }
  }
}

export function forgetAccount(userId: string): void {
  saveAccounts(loadAccounts().filter((a) => a.userId !== userId));
}

/**
 * Registra (ou atualiza) a conta da sessão atual.
 *
 * O nome vem de `name` (signUp por senha), `full_name` (Google) ou do começo do email — mesma ordem
 * do trigger handle_new_user no banco, pra a lista não mostrar um nome diferente do perfil.
 */
export function rememberAccount(session: Session | null | undefined): void {
  if (!session?.user) return;
  const u = session.user;
  const email = u.email || "";
  const meta = (u.user_metadata || {}) as Record<string, unknown>;
  const name =
    (typeof meta.name === "string" && meta.name.trim()) ||
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    email.split("@")[0];

  const accounts = loadAccounts();
  const acct: SavedAccount = {
    userId: u.id,
    email,
    name,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
  const idx = accounts.findIndex((a) => a.userId === u.id);
  if (idx >= 0) accounts[idx] = acct;
  else accounts.push(acct);
  saveAccounts(accounts);
}
