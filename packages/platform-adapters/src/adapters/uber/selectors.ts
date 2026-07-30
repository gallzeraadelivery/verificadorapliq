/**
 * Seletores validados contra o mock server local (Fase 3). Preferimos
 * `data-testid` a `name`/`id`/texto visivel de proposito - e exatamente o
 * que o README do mock server recomenda ("use esses seletores em vez de
 * texto visivel, que pode mudar") e o que sobrevive a a maioria das
 * mudancas de layout/estilo, so quebrando se o `data-testid` em si for
 * renomeado.
 *
 * Quando a Uber real alterar o layout: atualize SOMENTE este arquivo (e
 * `config.ts` se a URL tambem mudar). Nenhuma logica de negocio em
 * `steps/*.ts` ou em `UberDriverApplicationAdapter.ts` deveria precisar
 * mudar.
 *
 * IMPORTANTE: nenhum seletor abaixo foi validado contra a Uber real
 * (partners.uber.com) - so contra `apps/mock-server`. Ver aviso em
 * `config.ts`.
 */
export const UBER_SELECTORS = {
  login: {
    /** Campo de e-mail na tela de login. */
    emailInput: '[data-testid="login-email"]',
    /** Campo de senha na tela de login. */
    passwordInput: '[data-testid="login-password"]',
    /** Botao "Entrar". */
    submitButton: '[data-testid="login-submit"]',
    /** Mensagem de erro (credenciais invalidas, campos faltando). */
    errorMessage: '[data-testid="login-error"]',
  },
  applicationForm: {
    /** Nome completo do motorista. */
    fullNameInput: '[data-testid="application-full-name"]',
    /** E-mail (reafirmado no formulario administrativo). */
    emailInput: '[data-testid="application-email"]',
    /** Telefone de contato. */
    phoneInput: '[data-testid="application-phone"]',
    /** Endereco. */
    addressInput: '[data-testid="application-address"]',
    /** Cidade. */
    cityInput: '[data-testid="application-city"]',
    /**
     * Estado (UF). No mock e um campo de texto livre (maxlength 2), nao um
     * `<select>` - corrigido aqui em relacao ao rascunho original desta
     * fase, que assumia um dropdown (`stateSelect`) sem checar o HTML real.
     */
    stateInput: '[data-testid="application-state"]',
    /** CEP. */
    postalCodeInput: '[data-testid="application-postal-code"]',
    /** Tipo de veiculo (`<select>`: sedan / suv / hatch). */
    vehicleTypeSelect: '[data-testid="application-vehicle-type"]',
    /** Botao "Continuar". */
    submitButton: '[data-testid="application-submit"]',
    /** Mensagem de erro (campo obrigatorio faltando). */
    errorMessage: '[data-testid="application-error"]',
  },
  emailVerification: {
    /** Campo do codigo de 6 digitos. */
    codeInput: '[data-testid="email-verification-code"]',
    /** Botao "Verificar". */
    submitButton: '[data-testid="email-verification-submit"]',
    /**
     * Botao "reenviar codigo", se existir. O mock server nao tem um (o
     * codigo ja e gerado e exibido automaticamente ao carregar a pagina,
     * so em modo teste) - mantido aqui para paridade com plataformas reais
     * que exigem uma acao explicita de "enviar codigo" antes de o e-mail
     * chegar. `requestEmailCode` so clica se este elemento existir.
     */
    resendButton: '[data-testid="email-verification-resend"]',
    /** Mensagem de erro (codigo incorreto). */
    errorMessage: '[data-testid="email-verification-error"]',
  },
  /**
   * Placeholder de proposito: nenhum cenario do mock server (Fase 3) chega
   * numa pagina de conclusao "limpa" sem etapa sensivel - a plataforma
   * sempre exige verificacao de identidade em algum ponto. Mantido para
   * quando a pagina real de conclusao da Uber for conhecida (ver
   * `CompletionStep.ts`); ate la, `UberDriverApplicationAdapter` nunca
   * declara sucesso so por nao reconhecer a pagina atual (ver
   * `AutomationStepError` `UNRECOGNIZED_PAGE`).
   */
  completion: {
    successIndicator: '[data-testid="application-complete"]',
  },
} as const;
