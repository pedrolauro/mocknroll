# Issue 02 — Comando `status`

**Type:** AFK

## Parent

PRD: `packages/cli/PRD-detach-background.md`

## What to build

Novo comando `mockoon-cli status` (sem argumentos) que reporta o estado do daemon
em background. Lê o `daemon.json`, confirma a liveness do processo e, se vivo,
imprime os metadados (PID, portas, arquivos de dados, horário de início, modo watch)
junto com os caminhos de log: o `~/.mockoon-cli/logs/detach.log` (stdout do processo)
e os `~/.mockoon-cli/logs/<env>.log` (estruturado, um por env). Se não houver daemon
rodando, informa "nenhuma instância em background rodando".

Reaproveita a leitura de estado e checagem de liveness do módulo `daemon`.

## Acceptance criteria

- [ ] Com um daemon rodando, `status` imprime PID, portas, dataFiles, startedAt e watch.
- [ ] Com um daemon rodando, `status` imprime o caminho do `detach.log` e os caminhos `<env>.log` por env.
- [ ] Com um daemon rodando, `status` sai com código 0.
- [ ] Sem daemon rodando, `status` informa "nenhuma instância em background" e sai com código 3.

## Blocked by

- Issue 01 — Esqueleto andante: `start --detach` + `stop`
