import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type {
  IEmailVerificationWorker,
  SecurityChallengeResult,
  SecurityChallengeType,
  VerificationCodeResult,
} from "@uber-automation/email-service";
import { UberDriverApplicationAdapter } from "./UberDriverApplicationAdapter";
import type { UberAdapterConfig } from "./config";
import type { AutomationContext } from "../../types";

/**
 * Testa o adaptador com um navegador Chromium real contra o mock server da
 * Fase 3 (`apps/mock-server`), servido num processo HTTP real numa porta
 * efemera - nao contra HTML capturado a mao. Nao usamos `supertest` aqui
 * (como `verificationFlowDetector.test.ts` faz) porque o adaptador precisa
 * de um `Page` de verdade para preencher/clicar - supertest so faz
 * requisicoes HTTP isoladas, sem DOM.
 */

let server: Server;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  process.env.MOCK_SESSION_SECRET ??= "test-secret";
  const { createApp } = await import("@uber-automation/mock-server/src/app");
  const app = createApp();

  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;

  browser = await chromium.launch({ headless: true, executablePath: "/opt/pw-browsers/chromium" });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function configFor(scenario: string): UberAdapterConfig {
  return {
    baseUrl,
    endpoints: {
      login: `/mock-uber/login?scenario=${scenario}`,
      application: "/mock-uber/application",
      emailVerification: "/mock-uber/email-verification",
    },
    timeouts: { pageLoad: 15_000, elementWait: 5_000, actionDelay: 100 },
  };
}

const APPLICANT_DATA = {
  fullName: "João da Silva",
  email: "joao.silva@example.com",
  phone: "11999999999",
  address: "Rua Teste, 123",
  city: "São Paulo",
  state: "SP",
  postalCode: "01000000",
  vehicleType: "sedan",
};

function contextFor(applicantId: string): AutomationContext {
  return {
    companyId: "company-1",
    applicantId,
    browserProfileId: `profile-${applicantId}`,
    emailAccountId: `email-${applicantId}`,
    proxyId: `proxy-${applicantId}`,
    applicantData: APPLICANT_DATA,
  };
}

/**
 * Fake de `IEmailVerificationWorker` para este teste: em vez de acessar um
 * Gmail real (fora de escopo/impossivel num teste automatizado), le o
 * codigo diretamente do banner "MODO TESTE" que o mock server (Fase 3)
 * exibe SOMENTE em ambiente de teste - o mesmo dado que o
 * `EmailVerificationWorker` real seria responsavel por localizar no
 * e-mail. Nunca contorna nem simula 2FA/CAPTCHA do lado do Gmail.
 */
class TestBannerEmailWorker implements IEmailVerificationWorker {
  constructor(private readonly getPage: () => Page) {}

  async findVerificationCode(): Promise<VerificationCodeResult> {
    const page = this.getPage();
    await page.waitForSelector('[data-testid="test-code-value"]', { timeout: 10_000 });
    const code = await page.locator('[data-testid="test-code-value"]').innerText();
    return { code: code.trim(), confidence: "HIGH" };
  }

  async handleSecurityChallenge(_challenge: SecurityChallengeType): Promise<SecurityChallengeResult> {
    return { status: "PAUSED", reason: "não usado neste teste" };
  }
}

function createAdapter(scenario: string, applicantId: string) {
  let capturedPage: Page | undefined;

  const emailWorker = new TestBannerEmailWorker(() => {
    if (!capturedPage) throw new Error("página ainda não está pronta");
    return capturedPage;
  });

  const adapter = new UberDriverApplicationAdapter(undefined, emailWorker, {
    config: configFor(scenario),
    // O mock server aceita qualquer e-mail/senha ("ambiente de teste") - não
    // é o bug do `'temp-password'` hardcoded corrigido em LoginStep.ts, e
    // sim uma credencial de teste explícita fornecida por quem chama o
    // adaptador, como seria numa integração real.
    credentials: { email: "driver@example.com", password: "test-password" },
    createBrowserSession: async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      capturedPage = page;
      return { page, close: () => context.close() };
    },
  });

  return { adapter, context: contextFor(applicantId) };
}

describe("UberDriverApplicationAdapter - fluxo completo até a etapa sensível", () => {
  it(
    "preenche login, formulário e verificação de e-mail com sucesso e para na primeira etapa sensível encontrada",
    async () => {
      // Nenhum cenário do mock server (Fase 3) chega numa conclusão "limpa" -
      // a plataforma sempre exige verificação de identidade em algum ponto,
      // por desenho. Este teste prova que TODO o trecho administrativo
      // (login -> formulário -> e-mail) funciona de ponta a ponta antes de
      // qualquer etapa sensível - o cenário padrão (photo-socure) serve de
      // prova de que a automação chega até lá.
      const { adapter, context } = createAdapter("photo-socure", "applicant-full-flow");

      const result = await adapter.start(context);

      expect(result.status).toBe("VERIFICATION_DETECTED");
      expect(result.verificationDetected?.type).toBe("PROFILE_PHOTO");
      expect(adapter.getStatus()).toBe("PAUSED");
    },
    30_000,
  );
});

describe("UberDriverApplicationAdapter - detecção de etapas sensíveis", () => {
  it(
    "foto de perfil via Socure -> PROFILE_PHOTO / SOCURE / HIGH",
    async () => {
      const { adapter, context } = createAdapter("photo-socure", "applicant-photo-socure");
      const result = await adapter.start(context);

      expect(result.status).toBe("VERIFICATION_DETECTED");
      expect(result.verificationDetected).toEqual({
        type: "PROFILE_PHOTO",
        provider: "SOCURE",
        confidence: "HIGH",
      });
    },
    30_000,
  );

  it(
    "foto de perfil via outro provedor -> PROFILE_PHOTO / NOT_SOCURE / HIGH",
    async () => {
      const { adapter, context } = createAdapter("photo-other", "applicant-photo-other");
      const result = await adapter.start(context);

      expect(result.status).toBe("VERIFICATION_DETECTED");
      expect(result.verificationDetected?.type).toBe("PROFILE_PHOTO");
      expect(result.verificationDetected?.provider).toBe("NOT_SOCURE");
    },
    30_000,
  );

  it(
    "CNH via Socure -> DRIVER_LICENSE / SOCURE / HIGH",
    async () => {
      const { adapter, context } = createAdapter("license-socure", "applicant-license-socure");
      const result = await adapter.start(context);

      expect(result.status).toBe("VERIFICATION_DETECTED");
      expect(result.verificationDetected).toEqual({
        type: "DRIVER_LICENSE",
        provider: "SOCURE",
        confidence: "HIGH",
      });
    },
    30_000,
  );

  it(
    "CNH via outro provedor -> DRIVER_LICENSE / NOT_SOCURE / HIGH",
    async () => {
      const { adapter, context } = createAdapter("license-other", "applicant-license-other");
      const result = await adapter.start(context);

      expect(result.status).toBe("VERIFICATION_DETECTED");
      expect(result.verificationDetected?.type).toBe("DRIVER_LICENSE");
      expect(result.verificationDetected?.provider).toBe("NOT_SOCURE");
    },
    30_000,
  );

  it(
    "CAPTCHA -> VERIFICATION_DETECTED / CAPTCHA, sem tentar resolver",
    async () => {
      const { adapter, context } = createAdapter("captcha", "applicant-captcha");
      const result = await adapter.start(context);

      expect(result.status).toBe("VERIFICATION_DETECTED");
      expect(result.verificationDetected?.type).toBe("CAPTCHA");
    },
    30_000,
  );

  it(
    "2FA -> VERIFICATION_DETECTED / TWO_FACTOR, sem tentar contornar",
    async () => {
      const { adapter, context } = createAdapter("2fa", "applicant-2fa");
      const result = await adapter.start(context);

      expect(result.status).toBe("VERIFICATION_DETECTED");
      expect(result.verificationDetected?.type).toBe("TWO_FACTOR");
    },
    30_000,
  );

  it(
    "bloqueio de segurança -> VERIFICATION_DETECTED / SECURITY_BLOCK",
    async () => {
      const { adapter, context } = createAdapter("block", "applicant-block");
      const result = await adapter.start(context);

      expect(result.status).toBe("VERIFICATION_DETECTED");
      expect(result.verificationDetected?.type).toBe("SECURITY_BLOCK");
    },
    30_000,
  );
});

describe("UberDriverApplicationAdapter - pausa em etapa sensível", () => {
  it(
    "entrega o controle da sessão (status PAUSED) em vez de continuar ou fechar sozinho",
    async () => {
      const { adapter, context } = createAdapter("license-socure", "applicant-pause");

      expect(adapter.getStatus()).toBe("IDLE");

      const result = await adapter.start(context);

      expect(result.status).toBe("VERIFICATION_DETECTED");
      expect(result.currentStep).toBe("ADMINISTRATIVE_STEPS_COMPLETE");
      expect(adapter.getStatus()).toBe("PAUSED");
    },
    30_000,
  );
});
