# @uber-automation/platform-adapters

Adaptadores que navegam pelo fluxo de cadastro administrativo de motoristas
parceiros em uma plataforma real (hoje: Uber) e **param imediatamente** ao
encontrar qualquer etapa sensível (foto de perfil, CNH, CAPTCHA, 2FA, bloqueio
de segurança), devolvendo a sessão para o motorista concluir pessoalmente.

Este pacote nunca cria identidades falsas, envia documentos/selfies, acessa
câmera, resolve CAPTCHA/2FA, troca o provedor de verificação escolhido pela
plataforma, ou cancela/recria cadastros automaticamente. Se algo não puder ser
feito de forma legítima, a automação para e reporta - nunca contorna.

## Estrutura

```
src/
├── index.ts                    # API pública do pacote
├── types.ts                    # AutomationContext/Result, IPlatformAdapter
├── errors.ts                   # VerificationDetectedError, AutomationStepError
├── base/
│   └── PlatformAdapter.ts      # esqueleto comum (status, etapa atual, auditoria)
└── adapters/
    ├── types.ts                 # IPageTypeDetector (contrato com a Fase 4)
    └── uber/
        ├── config.ts             # URLs e timeouts
        ├── selectors.ts          # seletores CSS (data-testid), documentados
        ├── UberDriverApplicationAdapter.ts
        └── steps/
            ├── LoginStep.ts
            ├── ApplicationFormStep.ts
            ├── EmailVerificationStep.ts   # requestEmailCode/retrieveEmailCode/submitEmailCode
            ├── ProfilePhotoStep.ts        # so detecta, nunca fotografa/envia
            ├── DriverLicenseStep.ts       # so detecta, nunca envia documento
            └── CompletionStep.ts          # so declara sucesso com indicador positivo conhecido
```

## Como usar

```ts
import { UberDriverApplicationAdapter } from "@uber-automation/platform-adapters";
import { VerificationFlowDetector } from "@uber-automation/verification-detector";
import { EmailVerificationWorker } from "@uber-automation/email-service";

const adapter = new UberDriverApplicationAdapter(
  new VerificationFlowDetector(),
  new EmailVerificationWorker({ companyId }),
  {
    // Opcional - so necessario se a pagina de login da plataforma realmente
    // pedir credenciais (o adaptador so falha se o formulario de login
    // aparecer e nenhuma credencial tiver sido configurada).
    credentials: { email: "...", password: "..." },
  },
);

const result = await adapter.start({
  companyId,
  applicantId,
  browserProfileId,
  emailAccountId,
  proxyId,
  applicantData: { fullName, email, phone, address, city, state, postalCode, vehicleType },
});

switch (result.status) {
  case "VERIFICATION_DETECTED":
    // Marcar `applicant` como AWAITING_HUMAN_ACTION e notificar o motorista.
    // `result.verificationDetected` traz { type, provider, confidence }.
    break;
  case "SUCCESS":
    // So acontece se a plataforma tiver uma pagina de conclusao positiva
    // conhecida (ver CompletionStep.ts) - raro/inexistente no mock atual.
    break;
  case "ERROR":
    // Falha tecnica (`result.error.code`) - decidir se é retentável.
    break;
}
```

`getCurrentStep()`/`getStatus()` podem ser consultados a qualquer momento
(inclusive de fora, por um processo que monitora a automação);
`pause()`/`resume()`/`cancel()` permitem interromper a sessão manualmente.

### Ciclo de vida do navegador

Por padrão, o adaptador abre um Chromium headless sem proxy
(`chromium.launch({ headless: true })`) e o fecha ao final. **Isso não é
adequado para produção**: uma integração real deve

1. rotear pelo proxy associado a `context.proxyId` (`@uber-automation/proxy-manager`);
2. restaurar/persistir a sessão via `BrowserProfileManager`
   (`@uber-automation/automation`) usando `context.browserProfileId`, para
   isolamento estrito por motorista (Fase 2).

Substitua isso passando `createBrowserSession` nas opções do adaptador - é
exatamente o hook que os testes deste pacote usam para capturar a `Page` real
e não abrir um navegador de produção. Essa integração completa com
`apps/worker` fica para uma fase futura de wiring.

## Como adicionar um novo provedor de verificação

Este pacote não decide quais provedores existem - quem faz isso é
`@uber-automation/verification-detector` (Fase 4). Para ensinar o detector a
reconhecer um novo provedor nomeado, veja
[`packages/verification-detector/src/providerRegistry.ts`](../verification-detector/src/providerRegistry.ts)
(`KNOWN_OTHER_PROVIDERS`). Nenhuma mudança é necessária aqui - `ProfilePhotoStep`/
`DriverLicenseStep` já repassam qualquer classificação (`SOCURE`, `NOT_SOCURE`,
`OTHER_PROVIDER`, `UBER_INTERNAL`, `UNKNOWN`) sem lógica própria de provedor.

## Como adicionar uma nova plataforma (ex: Lyft)

1. Crie `src/adapters/<plataforma>/` com a mesma forma de `uber/`
   (`config.ts`, `selectors.ts`, `steps/`, `<Nome>DriverApplicationAdapter.ts`).
2. Estenda `PlatformAdapter` (`src/base/PlatformAdapter.ts`) e implemente
   `executeSteps()`.
3. Reaproveite `IPageTypeDetector`/`VerificationFlowDetector` (Fase 4) e
   `IEmailVerificationWorker` (Fase 2) - nenhum deles é específico da Uber.

## Como atualizar seletores quando o layout mudar

Só dois arquivos deveriam precisar mudar: `adapters/uber/config.ts` (se a
URL/rota mudar) e `adapters/uber/selectors.ts` (se o seletor mudar). Nenhuma
lógica em `steps/*.ts` ou em `UberDriverApplicationAdapter.ts` deveria
precisar mudar.

```ts
// Antes
emailInput: '[data-testid="login-email"]',

// Depois (Uber renomeou o data-testid)
emailInput: '[data-testid="uber-login-email-v2"]',
```

**Aviso importante sobre validação**: os seletores e URLs em `config.ts`/
`selectors.ts` que apontam para o mock server (`UBER_MOCK_CONFIG`, valor
padrão de `UBER_CONFIG`) foram validados contra `apps/mock-server` (Fase 3) -
todos os 9 testes deste pacote rodam contra um Chromium real navegando nesse
servidor. Já `UBER_PRODUCTION_CONFIG_PLACEHOLDER` (em `config.ts`) e os
seletores baseados em `name`/`id` mencionados nos comentários **nunca foram
validados contra partners.uber.com** - este projeto nunca navegou no site
real. Antes de apontar para produção: inspecione o fluxo real logado como o
próprio motorista, atualize `config.ts`/`selectors.ts` de acordo, e valide
manualmente antes de confiar na automação.

## Tratamento de erros

- **Etapa sensível detectada** (`VerificationDetectedError` internamente) ->
  `AutomationResult.status = 'VERIFICATION_DETECTED'`. Nunca uma exceção para
  quem chama `start()` - sempre um retorno tratável.
- **Falha técnica** (timeout, seletor não encontrado, sessão expirada, página
  não reconhecida) -> `AutomationStepError` -> `status = 'ERROR'` com
  `error.code` (ex: `UBER_CREDENTIALS_MISSING`, `UNRECOGNIZED_PAGE`).
- **Página não reconhecida** nunca é tratada como sucesso silencioso: só se
  declara `SUCCESS` quando um indicador de conclusão positivo e conhecido é
  encontrado (`CompletionStep.ts`) - caso contrário, `UNRECOGNIZED_PAGE`,
  para evitar mascarar uma etapa sensível cujo layout mudou.

## Logging/auditoria

Cada transição de etapa é registrada via `AuditLogger` (`@uber-automation/security`),
que mascara automaticamente qualquer campo sensível antes de persistir - o
código de verificação nunca aparece em texto puro, só mascarado
(`maskCode`, ex: `****42`):

```
uber_step_login_complete
uber_step_form_filled
uber_step_code_requested
uber_step_code_retrieved        { maskedCode: "****42", confidence: "HIGH" }
uber_step_email_verified
uber_step_administrative_steps_complete
verification_detected           { type: "PROFILE_PHOTO", provider: "SOCURE", confidence: "HIGH" }
```

## Testes

```bash
pnpm --filter @uber-automation/platform-adapters test
```

`UberDriverApplicationAdapter.test.ts` sobe o mock server (Fase 3) num
processo HTTP real numa porta efêmera e dirige um Chromium headless real
contra ele (não HTML capturado à mão, não mocks de DOM) para os 8 cenários
existentes, mais um teste dedicado de "pausa em etapa sensível". Ver o
relatório de testes abaixo.

## Relatório de testes (Fase 5)

| Cenário                                             | Resultado esperado                                      | Status |
| ---------------------------------------------------- | -------------------------------------------------------- | ------ |
| Fluxo completo (login → formulário → e-mail) até etapa sensível | login/form/e-mail bem-sucedidos, `VERIFICATION_DETECTED` no primeiro cenário sensível | ✅ passou |
| Foto de perfil - Socure                              | `PROFILE_PHOTO` / `SOCURE` / `HIGH`                       | ✅ passou |
| Foto de perfil - outro provedor                      | `PROFILE_PHOTO` / `NOT_SOCURE` / `HIGH`                   | ✅ passou |
| CNH - Socure                                         | `DRIVER_LICENSE` / `SOCURE` / `HIGH`                      | ✅ passou |
| CNH - outro provedor                                 | `DRIVER_LICENSE` / `NOT_SOCURE` / `HIGH`                  | ✅ passou |
| CAPTCHA                                              | `VERIFICATION_DETECTED` / `CAPTCHA`, sem tentar resolver  | ✅ passou |
| Autenticação em duas etapas                          | `VERIFICATION_DETECTED` / `TWO_FACTOR`, sem tentar contornar | ✅ passou |
| Bloqueio de segurança                                | `VERIFICATION_DETECTED` / `SECURITY_BLOCK`                | ✅ passou |
| Pausa em etapa sensível                              | `getStatus() === 'PAUSED'` após `start()`, sessão não é fechada nem retomada sozinha | ✅ passou |

**9/9 testes passando** (100%), rodando um Chromium headless real contra o
mock server real (Fase 3) - não fixtures escritas à mão. Nenhum erro
encontrado nos cenários cobertos. Cenário de "conclusão limpa sem etapa
sensível" não tem cobertura de teste porque nenhum cenário do mock server
chega lá (ver `CompletionStep.ts`) - é esperado, dado que a plataforma real
sempre exige verificação de identidade em algum ponto do cadastro de
motorista.

### Desvios deliberados em relação ao rascunho original desta fase

- `LoginStep` nunca usa uma senha hardcoded (`'temp-password'` no rascunho
  original nunca autenticaria de verdade); credenciais vêm de
  `options.credentials`, e a ausência delas quando a página de login as exige
  é um erro técnico explícito (`UBER_CREDENTIALS_MISSING`), não uma tentativa
  silenciosa com valor inventado.
- O campo "Estado" no formulário administrativo é um `<input>` de texto no
  mock real, não um `<select>` - corrigido em `selectors.ts`
  (`stateInput`, não `stateSelect`).
- Detecção de página não reconhecida nunca é tratada como sucesso implícito
  (o rascunho original assumia sucesso sempre que nenhuma das checagens
  ingênuas de `html.includes(...)` desse positivo) - isso poderia mascarar
  uma etapa sensível real cujo HTML mudou o suficiente para não bater com um
  `includes()` textual. Este pacote reaproveita a classificação mais robusta
  do `VerificationFlowDetector` (Fase 4) e falha alto (`UNRECOGNIZED_PAGE`)
  em vez de assumir sucesso por omissão.
