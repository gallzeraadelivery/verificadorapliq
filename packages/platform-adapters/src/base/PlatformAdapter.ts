import { AuditLogger } from "@uber-automation/security";
import { AutomationStepError, VerificationDetectedError } from "../errors";
import type {
  AutomationContext,
  AutomationResult,
  AutomationStatus,
  IPlatformAdapter,
} from "../types";

export interface PlatformAdapterOptions {
  auditLogger?: AuditLogger;
}

/**
 * Esqueleto comum a qualquer adaptador de plataforma (Uber hoje, outras
 * plataformas de parceiros no futuro): controla status/etapa atual e
 * traduz o resultado de `executeSteps()` em `AutomationResult`, sem saber
 * nada sobre navegador, seletores ou fluxo especifico da plataforma - isso
 * fica inteiramente com a subclasse.
 *
 * Contrato do resultado:
 * - `executeSteps()` termina normalmente -> `SUCCESS`.
 * - lanca `VerificationDetectedError` -> `VERIFICATION_DETECTED` (nunca uma
 *   excecao para o chamador de `start()` - e sempre um retorno tratavel).
 * - lanca qualquer outro erro -> `ERROR` (retentavel ou nao fica a criterio
 *   de quem consome `AutomationResult`, ex: `apps/worker` numa fase futura).
 */
export abstract class PlatformAdapter implements IPlatformAdapter {
  protected context!: AutomationContext;
  protected currentStep = "INIT";
  protected status: AutomationStatus = "IDLE";
  protected readonly auditLogger: AuditLogger;

  constructor(options: PlatformAdapterOptions = {}) {
    this.auditLogger = options.auditLogger ?? new AuditLogger();
  }

  async start(context: AutomationContext): Promise<AutomationResult> {
    this.context = context;
    this.status = "RUNNING";
    this.currentStep = "INIT";
    await this.audit("automation_started", {});

    try {
      await this.executeSteps();
      this.status = "SUCCESS";
      await this.audit("automation_completed", { step: this.currentStep });
      return { status: "SUCCESS", currentStep: this.currentStep };
    } catch (error) {
      if (error instanceof VerificationDetectedError) {
        this.status = "PAUSED";
        await this.audit("verification_detected", {
          step: this.currentStep,
          type: error.verification.type,
          provider: error.verification.provider,
          confidence: error.verification.confidence,
        });
        return {
          status: "VERIFICATION_DETECTED",
          currentStep: this.currentStep,
          verificationDetected: error.verification,
        };
      }

      this.status = "ERROR";
      const code = error instanceof AutomationStepError ? error.code : "UNKNOWN_ERROR";
      const message = error instanceof Error ? error.message : String(error);
      await this.audit("automation_error", { step: this.currentStep, code, message });
      return { status: "ERROR", currentStep: this.currentStep, error: { code, message } };
    } finally {
      await this.cleanup();
    }
  }

  async pause(): Promise<void> {
    this.status = "PAUSED";
    await this.audit("automation_paused", { step: this.currentStep });
  }

  async resume(): Promise<void> {
    this.status = "RUNNING";
    await this.audit("automation_resumed", { step: this.currentStep });
  }

  async cancel(): Promise<void> {
    this.status = "CANCELLED";
    await this.audit("automation_cancelled", { step: this.currentStep });
    await this.cleanup();
  }

  getCurrentStep(): string {
    return this.currentStep;
  }

  getStatus(): AutomationStatus {
    return this.status;
  }

  /** Executa o fluxo especifico da plataforma. Ver contrato de erros acima. */
  protected abstract executeSteps(): Promise<void>;

  /**
   * Libera recursos (ex: fechar navegador). Sobrescrito por subclasses que
   * abrem um navegador - chamado sempre ao final de `start()` e em
   * `cancel()`, mesmo em caminho de erro.
   */
  protected async cleanup(): Promise<void> {}

  protected async audit(action: string, metadata: Record<string, unknown>): Promise<void> {
    await this.auditLogger.log({
      companyId: this.context?.companyId ?? "unknown",
      applicantId: this.context?.applicantId,
      action,
      metadata,
    });
  }
}
