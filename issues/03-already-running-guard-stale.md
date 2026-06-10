# Issue 03 — Guard de "já está rodando" + resiliência a stale

**Type:** AFK

## Parent

PRD: `packages/cli/PRD-detach-background.md`

## What to build

Tornar o singleton confiável. Quando já existe um daemon **vivo**, um segundo
`start --detach` não sobe instância concorrente: reporta "já está rodando (PID …) —
logs em …" e sai com código 1.

Além disso, um `daemon.json` apontando para um processo **morto** (crash, `kill -9`,
reboot) é tratado como stale e auto-limpo, sem travar o usuário:
- `start --detach`: stale → limpa o state file e sobe normalmente.
- `stop`: stale → "nada rodando" + limpa o state file, sai 0.
- `status`: stale → reporta "parado", sai 3.

A checagem de liveness usa `process.kill(pid, 0)` (do módulo `daemon`).

## Acceptance criteria

- [ ] Com um daemon vivo, um segundo `start --detach` reporta "já está rodando" com o caminho do log e sai com código 1.
- [ ] Um state file apontando para PID morto não impede um novo `start --detach` (é limpo e o start prossegue).
- [ ] `stop` com state file stale informa "nada rodando", remove o arquivo e sai 0.
- [ ] `status` com state file stale reporta "parado" e sai 3.

## Blocked by

- Issue 01 — Esqueleto andante: `start --detach` + `stop`
