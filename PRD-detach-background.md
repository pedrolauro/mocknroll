# PRD — Modo background (`--detach`) para o Mockoon CLI

## Problem Statement

Ao rodar `mockoon-cli start`, o processo vive em foreground e **toma o terminal**:
o usuário não consegue seguir com outros comandos na mesma sessão sem abrir outro
terminal ou mandar o processo pra background manualmente (`&`, `nohup`, etc.) e
gerenciar PID e redirecionamento de log na unha. Não existe um comando de primeira
classe para subir o mock em background, descobrir se ele está rodando, saber onde
estão os logs, nem para derrubá-lo de forma limpa.

## Solution

Adicionar um modo background nativo ao CLI:

- Uma flag `--detach`/`-D` no comando `start` que sobe o servidor como processo
  destacado, libera o terminal imediatamente e imprime onde ficam os logs.
- Um comando `stop` que derruba o daemon de forma graciosa, sem o usuário precisar
  saber o PID.
- Um comando `status` que informa se há um daemon rodando, com seus metadados
  (PID, portas, arquivos de dados, horário de início, watch) e os caminhos de log.
- Logs do processo destacado sempre encaminhados para um arquivo fixo e conhecido
  (`~/.mockoon-cli/logs/detach.log`), com o caminho sempre informado na saída.
- Se o usuário tentar subir um segundo daemon, o CLI avisa que **já está rodando**
  e indica o caminho do log, em vez de subir uma instância concorrente.
- `--watch` continua funcionando normalmente no modo destacado.

## User Stories

1. Como desenvolvedor, quero subir o mock em background com `start --detach`, para
   continuar usando o mesmo terminal sem abrir outra aba.
2. Como desenvolvedor, quero que o terminal seja liberado imediatamente após o
   `start --detach`, para não ficar com o prompt travado.
3. Como desenvolvedor, quero que o `start --detach` me informe o PID e o caminho do
   log ao subir, para saber onde acompanhar a saída do daemon.
4. Como desenvolvedor, quero parar o daemon com um único comando `stop` sem informar
   PID nem porta, para não precisar caçar o processo manualmente.
5. Como desenvolvedor, quero que o `stop` faça shutdown gracioso do servidor HTTP,
   para não deixar conexões/portas penduradas.
6. Como desenvolvedor, quero que o `stop` force o encerramento (SIGKILL) se o
   processo não morrer em 3 segundos, para nunca ficar sem saída limpa.
7. Como desenvolvedor, quero rodar `stop` mesmo quando nada está rodando sem que o
   comando quebre meu pipeline, para poder colocar `stop` antes de `start` em scripts.
8. Como desenvolvedor, quero consultar `status` para saber se há um daemon rodando,
   para decidir se preciso subir ou parar algo.
9. Como desenvolvedor, quero que o `status` mostre PID, portas, arquivos de dados,
   horário de início e se está em modo watch, para entender o estado do daemon.
10. Como desenvolvedor, quero que o `status` mostre tanto o log do processo
    (`detach.log`) quanto os logs estruturados por env, para achar cada tipo de log
    sem caçar.
11. Como desenvolvedor, quero que o `status` retorne código de saída diferente de
    zero quando nada está rodando, para usar em condicionais de shell.
12. Como desenvolvedor, quero que ao tentar subir um segundo `start --detach` o CLI
    me avise que já está rodando e mostre o caminho do log, para eu ir direto ver o
    que já está no ar.
13. Como desenvolvedor, quero que a saída do processo destacado vá sempre para um
    arquivo fixo e conhecido, para não ter que adivinhar onde está o log.
14. Como desenvolvedor, quero que cada `start --detach` comece com um log limpo
    (truncado), para não misturar a saída de execuções anteriores.
15. Como desenvolvedor, quero que `--watch` funcione no modo destacado, para o mock
    recarregar ao editar o arquivo de dados mesmo rodando em background.
16. Como desenvolvedor, quero subir múltiplos envs/portas numa única invocação
    `start --detach`, para manter o comportamento multi-env do `start` atual.
17. Como desenvolvedor, quero que o CLI detecte um state file órfão (processo morto)
    e o limpe automaticamente, para não ficar travado por um daemon fantasma.
18. Como desenvolvedor em Linux/macOS, quero que o modo background funcione de forma
    confiável, para usar no meu fluxo diário.
19. Como desenvolvedor em Windows, quero uma mensagem clara de que o modo background
    ainda não é suportado, em vez de um comportamento quebrado que deixa processos
    órfãos.
20. Como desenvolvedor, quero que o modo `--detach` recuse arquivos que precisam de
    migração/repair com uma mensagem clara, para não ter um prompt interativo travando
    um processo sem terminal.
21. Como desenvolvedor, quero que `--repair` combinado com `--detach` seja rejeitado
    explicitamente, para não criar a falsa expectativa de que o repair rodou.
22. Como desenvolvedor, quero que o `start` sem `--detach` continue exatamente como
    hoje (foreground), para não quebrar meu fluxo atual.
23. Como desenvolvedor, quero que o logger estruturado por env
    (`~/.mockoon-cli/logs/<env>.log`) continue funcionando como hoje, com ou sem
    detach, para não perder o histórico de transações.
24. Como mantenedor, quero que a lógica de daemon (estado, liveness, spawn, stop)
    fique num módulo isolado e testável, para cobrir os fluxos sem depender da
    orquestração do oclif.

## Implementation Decisions

### Modelo de instância
- **Singleton global**: existe no máximo um daemon em background por máquina.
  A invocação que o cria pode segurar múltiplos `-d`/`-p` (multi-env interno),
  preservando o comportamento atual do `start`. Uma segunda tentativa de
  `start --detach` (com qualquer config) reporta "já está rodando" e não sobe nada.
- `stop` e `status` não recebem argumentos — operam sobre o singleton.

### Superfície de comandos
- Flag `--detach`/`-D` adicionada ao comando `start` (modificador; herda todas as
  flags existentes do `start`, inclusive `--watch`, `-p`, `-d`).
- Novo comando `stop` (sem args).
- Novo comando `status` (sem args).

### Mecanismo de detach (fire-and-forget)
- O comando pai parseia, valida e então faz `spawn` de um filho destacado
  (`detached: true`, `stdio: ['ignore', logFd, logFd]`, `windowsHide: true`) seguido
  de `unref()`.
- O argv do filho é o `process.argv` do pai com o token `--detach`/`-D` removido,
  reaproveitando o mesmo entrypoint (`process.argv[1]`). O filho roda o `start`
  **foreground normal** — sem nenhuma lógica de detach própria.
- **Sem IPC / sem readiness check**: o pai grava o state file, imprime PID + caminho
  do log e sai. A mensagem de sucesso indica "iniciado em background", sem prometer
  saúde verificada. Daemons que morrerem logo após (ex.: porta ocupada) são tratados
  pela detecção de stale nas próximas invocações.

### Estado persistido
- State file JSON em `~/.mockoon-cli/daemon.json`, **escrito pelo pai** após o spawn.
- Campos: `pid`, `ports` (resolvidas), `dataFiles` (paths originais), `logFile`
  (`~/.mockoon-cli/logs/detach.log`), `startedAt` (ISO), `watch` (bool).
- O pai parseia os data files para extrair as portas efetivas antes de gravar
  (parse acontece tanto no pai quanto no filho; o custo é aceito para evitar corrida
  no `status` logo após o `start`).
- **Escritor único**: somente o pai escreve o state file. Em consequência, se
  `--watch` reiniciar o servidor numa porta diferente, o campo `ports` pode ficar
  desatualizado (drift aceito; o `pid` permanece correto e o `stop` nunca quebra).

### Detecção de liveness / stale
- Liveness via `process.kill(pid, 0)`.
- State file apontando para processo morto = stale → auto-limpeza.
  - `start --detach`: stale → limpa e sobe; vivo → "já está rodando", exit 1.
  - `stop`: stale → "nada rodando" + limpa, exit 0; vivo → derruba.
  - `status`: stale → "parado", exit 3; vivo → mostra metadados, exit 0.
- Risco residual de PID reciclado pelo SO é aceito (fluxo de dev local).

### Semântica do `stop`
- Envia `SIGINT` (reaproveita o shutdown gracioso já existente:
  `process.on('SIGINT', () => server.stop())`).
- Faz poll de liveness por até **3 segundos**; se o processo persistir, envia
  `SIGKILL`.
- Após confirmar o término, remove o `daemon.json`.
- O processo destacado passa a registrar também um handler de `SIGTERM` espelhando o
  de `SIGINT`, por robustez.

### Logs
- O arquivo do `--detach` captura **apenas o stdout/stderr do processo** (boot, erros,
  e transações quando `--log-transaction`).
- Caminho **fixo**: `~/.mockoon-cli/logs/detach.log`. Sem flag de override.
- **Sempre truncado** a cada novo `start --detach`.
- O logger estruturado por env (`~/.mockoon-cli/logs/<env>.log`) permanece inalterado.
- O `status` ecoa ambos os caminhos (o `detach.log` e os `<env>.log` por env).

### Repair / migração
- Em `--detach`, migração/repair **não é aceito**: se algum env precisar, o pai
  **falha rápido** com mensagem clara e não forka (evita o prompt interativo travar um
  processo sem stdin).
- `--repair` combinado com `--detach` é **erro de flags incompatíveis** (oclif
  `exclusive`).

### Escopo de SO
- Linux/macOS no v1.
- No Windows, um guard explícito (`process.platform === 'win32'`) emite mensagem clara
  de "não suportado ainda" em `--detach`/`stop`/`status`, em vez de quebrar
  silenciosamente.

### Códigos de saída e formato
- `status`: rodando → 0; parado → 3.
- `stop`: sempre 0 (idempotente).
- `start --detach` quando já está rodando: 1.
- Saída humano-legível apenas no v1 (sem `--json`).

### Módulos
- **`daemon` (módulo profundo, novo)**: encapsula todo o ciclo de vida do daemon
  atrás de uma interface simples e estável. Responsabilidades:
  - ler/escrever/limpar o state file;
  - checar liveness e auto-limpar stale (`getRunningState()` retorna o estado vivo ou
    nulo);
  - spawnar o processo destacado a partir do argv filtrado e do fd de log;
  - parar o daemon (SIGINT → poll 3s → SIGKILL → limpa state);
  - guard de plataforma;
  - derivar o caminho do log estruturado por env.
- **`start` (modificado)**: adiciona a flag `--detach`/`-D` (`exclusive: ['repair']`)
  e um ramo que delega ao módulo `daemon` e retorna antes da lógica foreground; adiciona
  handler de `SIGTERM` espelhando o `SIGINT`.
- **`stop` (comando novo)**: fino, delega ao módulo `daemon`.
- **`status` (comando novo)**: fino, delega ao módulo `daemon`.
- **`config` (modificado)**: adiciona os caminhos `detachLogFile` e `stateFile`.

## Testing Decisions

- Um bom teste exercita o **comportamento externo** observável pelo usuário, não
  detalhes de implementação: subir/parar/consultar via CLI e verificar saída, código
  de saída, resposta HTTP e presença/ausência do daemon — não a estrutura interna do
  state file ou nomes de funções.
- **Prior art**: `test/specs/file-watch.test.ts` e os demais specs usam o helper
  `spawnCli` (`test/libs/helpers.ts`) para invocar o CLI via `./bin/dev.js`, baterem
  com `fetch` no servidor e matarem a instância no `finally`. Os novos testes seguem o
  mesmo padrão (spawn + asserts de saída/HTTP + cleanup), usando `node:test`.
- **Módulos testados**: o foco é o módulo `daemon` exercitado de ponta a ponta através
  dos comandos `start --detach`/`stop`/`status`. Cenários:
  - `start --detach` libera o terminal e o servidor responde HTTP;
  - `status` reporta metadados quando rodando e exit 3 quando parado;
  - `stop` derruba o daemon e remove o state file; `stop` sem nada rodando sai 0;
  - segundo `start --detach` reporta "já está rodando" com exit 1;
  - state file órfão é detectado e limpo;
  - env que precisa de migração é recusado em `--detach`;
  - `--repair --detach` é rejeitado;
  - `--watch` no modo destacado recarrega ao editar o arquivo de dados.
  - guard de Windows verificado com skip condicional por plataforma.

## Out of Scope

- Múltiplos daemons paralelos / granularidade de stop por porta (modelo é singleton).
- Verificação de readiness via IPC ou healthcheck antes de declarar sucesso
  (fire-and-forget no v1).
- Suporte a Windows (apenas guard com mensagem; implementação futura).
- Flag de override do caminho do log (`--log-file`) — caminho é fixo.
- Saída em JSON (`--json`) para `status`/`stop`.
- Unificar o logger estruturado por env no arquivo do detach.
- Atualização do state file em restarts disparados por `--watch` (drift aceito).
- Repair/migração automáticos no modo background.

## Further Notes

- O filho destacado é deliberadamente "burro": ele roda o `start` foreground padrão e
  registra seus próprios handlers de sinal, o que faz o `stop` funcionar puramente via
  sinal POSIX, sem canal de controle adicional.
- O reuso do mesmo entrypoint (`process.argv[1]`) garante funcionamento tanto em
  desenvolvimento (`bin/dev.js`) quanto instalado/produção (`bin/run.js`).
- É necessário garantir a existência de `~/.mockoon-cli/logs/` (mkdir recursivo) antes
  de abrir o fd do log.
