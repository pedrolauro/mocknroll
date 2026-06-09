# Issue 01 — Esqueleto andante: `start --detach` + `stop`

**Type:** AFK

## Parent

PRD: `packages/cli/PRD-detach-background.md`

## What to build

O caminho end-to-end mínimo do modo background. `mockoon-cli start --detach`
parseia e valida os data files, garante a existência de `~/.mockoon-cli/logs/`,
trunca/abre o arquivo fixo `~/.mockoon-cli/logs/detach.log`, e faz `spawn` de um
processo destacado (`detached: true`, `stdio: ['ignore', logFd, logFd]`,
`windowsHide: true`, seguido de `unref()`). O filho roda o `start` foreground normal
— seu argv é o do pai com o token `--detach`/`-D` removido, reaproveitando o mesmo
entrypoint. O pai grava `~/.mockoon-cli/daemon.json`
(`{ pid, ports, dataFiles, logFile, startedAt, watch }`), imprime "iniciado em
background (PID …) — logs em …" e sai, liberando o terminal.

`mockoon-cli stop` (sem args) lê o state file, envia `SIGINT` ao processo (shutdown
gracioso já existente), faz poll de liveness por até 3 segundos, envia `SIGKILL` se
persistir, e remove o `daemon.json`.

Inclui: novos caminhos em `config` (`detachLogFile`, `stateFile`); o núcleo do módulo
profundo `daemon` (`readState`/`writeState`/`clearState`, `isAlive` via
`process.kill(pid, 0)`, `spawnDetached`, `stopDaemon(timeout=3000)`); a flag
`--detach`/`-D` no `start` com o ramo de detach que retorna antes da lógica foreground;
e um handler de `SIGTERM` espelhando o `SIGINT` no processo destacado.

O `start` sem `--detach` permanece idêntico ao comportamento atual (foreground). O
logger estruturado por env (`~/.mockoon-cli/logs/<env>.log`) permanece inalterado.

Suporta múltiplos `-d`/`-p` numa única invocação `--detach` (multi-env interno),
preservando o comportamento do `start`.

## Acceptance criteria

- [ ] `start --detach -d <file> -p <port>` retorna o prompt imediatamente (terminal liberado).
- [ ] Após o `start --detach`, o servidor responde requisições HTTP na porta indicada.
- [ ] A saída do comando informa o PID e o caminho `~/.mockoon-cli/logs/detach.log`.
- [ ] `~/.mockoon-cli/daemon.json` é criado com `pid`, `ports`, `dataFiles`, `logFile`, `startedAt`, `watch`.
- [ ] `~/.mockoon-cli/logs/detach.log` contém o stdout/stderr do processo e é truncado a cada novo `start --detach`.
- [ ] `stop` derruba o daemon graciosamente (SIGINT) e remove o `daemon.json`.
- [ ] Se o processo não morrer em 3s após o SIGINT, `stop` envia SIGKILL.
- [ ] `stop` quando nada está rodando sai com código 0 (idempotente).
- [ ] `start --detach -d a.json b.json -p 3000 3001` sobe ambos os envs no mesmo daemon.
- [ ] `start` sem `--detach` continua funcionando em foreground exatamente como antes.
- [ ] O logger estruturado por env continua escrevendo em `~/.mockoon-cli/logs/<env>.log`.

## Blocked by

None - can start immediately.
