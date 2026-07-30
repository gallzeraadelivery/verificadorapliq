import type { Page } from "playwright";
import { chromium } from "playwright";
import { maskCode } from "@uber-automation/security";
import type { IEmailVerificationWorker } from "@uber-automation/email-service";
import { VerificationFlowDetector } from "@uber-automation/verification-detector";
import { PlatformAdapter, type PlatformAdapterOptions } from "../../base/PlatformAdapter";
import { AutomationStepError, VerificationDetectedError } from "../../errors";
import type { IPageTypeDetector } from "../types";
import { UBER_CONFIG, type UberAdapterConfig } from "./config";
import { performLogin, type UberCredentials } from "./steps/LoginStep";
import { fillApplicationForm } from "./steps/ApplicationFormStep";
import { requestEmailCode, retrieveEmailCode, submitEmailCode } from "./steps/EmailVerificationStep";
import { detectProfilePhotoStep } from "./steps/ProfilePhotoStep";
import { detectDriverLicenseStep } from "./steps/DriverLicenseStep";
import { checkCompletion } from "./steps/CompletionStep";
import type { AutomationContext } from "../../types";

export interface UberBrowserSession {
  page: Page;
  close(): Promise<void>;
}

export interface UberDriverApplicationAdapterOptions extends PlatformAdapterOptions {
  config?: UberAdapterConfig;
  /** Credenciais de login da conta Uber do motorista, se a plataforma exigir. Ver `LoginStep.ts`. */
  credentials?: UberCredentials;
  /**
   * Cria a pagina/navegador usado pela automacao. O padrao abre um Chromium
   * headless sem proxy - suficiente para testar contra o mock server, mas
   * NAO adequado para producao: uma integracao real deve rotear pelo proxy
   * associado a `context.proxyId` (`@uber-automation/proxy-manager`) e
   * restaurar/persistir a sessao via `BrowserProfileManager`
   * (`@uber-automation/automation`) usando `context.browserProfileId` - essa
   * integracao fica para a fase de wiring com `apps/worker` (Fase 6+).
   * Sobrescreva esta opcao para injetar esse comportamento, ou para
   * testes, sem tocar na logica de automacao.
   */
  createBrowserSession?: (context: AutomationContext) => Promise<UberBrowserSession>;
}

const MAX_ADMINISTRATIVE_CONTINUE_ATTEMPTS = 5;

async function defaultCreateBrowserSession(): Promise<UberBrowserSession> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  return {
    page,
    close: async () => {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
}

/**
 * Automatiza o preenchimento administrativo do cadastro de motorista
 * parceiro da Uber: login (se exigido) -> formulario administrativo ->
 * verificacao de e-mail -> etapas administrativas adicionais, se houver.
 * Para IMEDIATAMENTE (nunca completa) ao chegar em foto de perfil, CNH,
 * CAPTCHA, 2FA ou bloqueio de seguranca, reportando o provedor detectado
 * (Fase 4) e devolvendo a sessao para o motorista.
 *
 * URLs/seletores ficam inteiramente em `config.ts`/`selectors.ts` - esta
 * classe so orquestra as etapas (`steps/*.ts`).
 */
export class UberDriverApplicationAdapter extends PlatformAdapter {
  private readonly detector: IPageTypeDetector;
  private readonly emailWorker: IEmailVerificationWorker;
  private readonly config: UberAdapterConfig;
  private readonly credentials?: UberCredentials;
  private readonly createBrowserSession: (
    context: AutomationContext,
  ) => Promise<UberBrowserSession>;

  private session?: UberBrowserSession;

  constructor(
    detector: IPageTypeDetector = new VerificationFlowDetector(),
    emailWorker: IEmailVerificationWorker,
    options: UberDriverApplicationAdapterOptions = {},
  ) {
    super(options);
    this.detector = detector;
    this.emailWorker = emailWorker;
    this.config = options.config ?? UBER_CONFIG;
    this.credentials = options.credentials;
    this.createBrowserSession = options.createBrowserSession ?? defaultCreateBrowserSession;
  }

  protected async executeSteps(): Promise<void> {
    this.session = await this.createBrowserSession(this.context);
    const page = this.session.page;

    await performLogin(page, this.credentials, this.config);
    await this.advanceStep("LOGIN_COMPLETE");

    await fillApplicationForm(page, this.context.applicantData, this.config);
    await this.advanceStep("FORM_FILLED");

    await requestEmailCode(page, this.config);
    await this.advanceStep("CODE_REQUESTED");

    const codeResult = await retrieveEmailCode(this.context, this.emailWorker);
    await this.advanceStep("CODE_RETRIEVED", {
      maskedCode: maskCode(codeResult.code),
      confidence: codeResult.confidence,
    });

    await submitEmailCode(page, codeResult.code, this.config);
    await this.advanceStep("EMAIL_VERIFIED");

    await this.continueAdministrativeSteps(page);
    await this.advanceStep("ADMINISTRATIVE_STEPS_COMPLETE");

    await this.detectVerificationStep(page);
  }

  /**
   * Alguns fluxos administrativos reais podem ter paginas intermediarias
   * extras entre a verificacao de e-mail e a etapa terminal (sensivel ou de
   * conclusao) - o mock server (Fase 3) nao tem nenhuma, entao este loop
   * roda zero vezes contra ele. Mantido para plataformas com mais etapas:
   * clica em um botao "continuar" generico enquanto a pagina atual nao for
   * reconhecida como nenhum tipo conhecido (sensivel, desafio ou
   * conclusao), ate um limite de tentativas.
   */
  private async continueAdministrativeSteps(page: Page): Promise<void> {
    for (let attempt = 0; attempt < MAX_ADMINISTRATIVE_CONTINUE_ATTEMPTS; attempt++) {
      const html = await page.content();
      const pageType = this.detector.classifyPageType(html);
      if (pageType !== "UNKNOWN") return;

      const completion = await checkCompletion(page);
      if (completion.completed) return;

      const continueButton = page.locator(
        '[data-testid$="continue-button"], [data-testid$="continue"]',
      );
      const hasContinue = await continueButton
        .count()
        .then((count) => count > 0)
        .catch(() => false);
      if (!hasContinue) return;

      await continueButton.first().click();
      await page.waitForLoadState("domcontentloaded", { timeout: this.config.timeouts.pageLoad });
    }
  }

  /**
   * Classifica a pagina atual e decide o desfecho final:
   * - foto de perfil / CNH -> identifica o provedor (Fase 4) e para.
   * - CAPTCHA / 2FA / bloqueio de seguranca -> para sem tentar identificar
   *   provedor (nao se aplica).
   * - nenhum tipo conhecido -> so declara sucesso se um indicador de
   *   conclusao POSITIVO for encontrado; caso contrario, falha alto e claro
   *   (`UNRECOGNIZED_PAGE`) em vez de assumir sucesso silenciosamente.
   */
  private async detectVerificationStep(page: Page): Promise<void> {
    const html = await page.content();
    const pageType = this.detector.classifyPageType(html);

    switch (pageType) {
      case "PROFILE_PHOTO":
        await detectProfilePhotoStep(page, this.detector);
        return;
      case "DRIVER_LICENSE":
        await detectDriverLicenseStep(page, this.detector);
        return;
      case "CAPTCHA":
        throw new VerificationDetectedError({
          type: "CAPTCHA",
          provider: "UNKNOWN",
          confidence: "HIGH",
        });
      case "TWO_FACTOR":
        throw new VerificationDetectedError({
          type: "TWO_FACTOR",
          provider: "UNKNOWN",
          confidence: "HIGH",
        });
      case "SECURITY_BLOCK":
        throw new VerificationDetectedError({
          type: "SECURITY_BLOCK",
          provider: "UNKNOWN",
          confidence: "HIGH",
        });
      case "UNKNOWN": {
        const completion = await checkCompletion(page);
        if (completion.completed) {
          await this.advanceStep("APPLICATION_COMPLETE");
          return;
        }
        throw new AutomationStepError(
          "UNRECOGNIZED_PAGE",
          `Página não reconhecida em ${completion.url} - verifique se os endpoints (config.ts) e seletores (selectors.ts) ainda correspondem ao layout atual.`,
        );
      }
    }
  }

  private async advanceStep(step: string, metadata: Record<string, unknown> = {}): Promise<void> {
    this.currentStep = step;
    await this.audit(`uber_step_${step.toLowerCase()}`, metadata);
  }

  protected async cleanup(): Promise<void> {
    await this.session?.close().catch(() => undefined);
    this.session = undefined;
  }
}
