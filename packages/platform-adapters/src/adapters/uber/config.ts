export interface UberEndpoints {
  login: string;
  application: string;
  emailVerification: string;
}

export interface UberTimeouts {
  /** Tempo maximo para uma navegacao/`waitForLoadState` completar. */
  pageLoad: number;
  /** Tempo maximo para um seletor aparecer antes de `fill`/`click`. */
  elementWait: number;
  /** Pausa curta apos uma acao sem navegacao (ex: clicar em "reenviar codigo"). */
  actionDelay: number;
}

export interface UberAdapterConfig {
  baseUrl: string;
  endpoints: UberEndpoints;
  timeouts: UberTimeouts;
}

/**
 * Config validada: aponta para o mock server local da Fase 3
 * (`apps/mock-server`), cujas rotas e formulario real foram lidos
 * diretamente de `apps/mock-server/src/routes/flow.routes.ts` e
 * `src/views/*.ejs` - nao inventadas. Todos os testes deste pacote rodam
 * contra ela.
 */
export const UBER_MOCK_CONFIG: UberAdapterConfig = {
  baseUrl: process.env.UBER_MOCK_BASE_URL ?? "http://localhost:3001",
  endpoints: {
    login: "/mock-uber/login",
    application: "/mock-uber/application",
    emailVerification: "/mock-uber/email-verification",
  },
  timeouts: {
    pageLoad: 30_000,
    elementWait: 10_000,
    actionDelay: 500,
  },
};

/**
 * PLACEHOLDER NAO VALIDADO. Este projeto nunca navegou nem inspecionou
 * partners.uber.com - os caminhos abaixo sao apenas um ponto de partida
 * plausivel (mesmo formato usado por outras integracoes de parceiro) para
 * quem for adaptar isto para a Uber real. Antes de usar em producao:
 * 1. Inspecione o fluxo real de cadastro de motorista parceiro logado como
 *    o proprio motorista (nunca com credenciais compartilhadas/de terceiros).
 * 2. Atualize `baseUrl`/`endpoints` aqui e os seletores em `selectors.ts`.
 * 3. Nao presuma que a estrutura de URLs bate com o mock - so o *formato*
 *    da automacao (login -> formulario -> verificacao de e-mail -> etapa
 *    sensivel) foi validado, nao os caminhos exatos.
 */
export const UBER_PRODUCTION_CONFIG_PLACEHOLDER: UberAdapterConfig = {
  baseUrl: "https://partners.uber.com",
  endpoints: {
    login: "/login",
    application: "/applications/driver",
    emailVerification: "/applications/driver/email-verify",
  },
  timeouts: {
    pageLoad: 30_000,
    elementWait: 10_000,
    actionDelay: 1_000,
  },
};

/**
 * Config usada por padrao pelo `UberDriverApplicationAdapter`. Troque para
 * `UBER_PRODUCTION_CONFIG_PLACEHOLDER` (ou passe seu proprio `config` nas
 * opcoes do adaptador) somente depois de validar os seletores contra a Uber
 * real - ver aviso acima.
 */
export const UBER_CONFIG: UberAdapterConfig =
  process.env.UBER_ADAPTER_TARGET === "production"
    ? UBER_PRODUCTION_CONFIG_PLACEHOLDER
    : UBER_MOCK_CONFIG;
