# Issue 05 — Guard de plataforma (Windows)

**Type:** AFK

## Parent

PRD: `packages/cli/PRD-detach-background.md`

## What to build

Evitar comportamento quebrado e processos órfãos no Windows, onde o modelo de
detach/sinais POSIX não se aplica no v1. Um guard explícito
(`process.platform === 'win32'`) faz `start --detach`, `stop` e `status` emitirem uma
mensagem clara de que o modo background ainda não é suportado no Windows, em vez de
tentar e falhar de forma silenciosa.

## Acceptance criteria

- [ ] Em `win32`, `start --detach` emite mensagem clara de "não suportado ainda" e não spawna processo.
- [ ] Em `win32`, `stop` emite a mesma mensagem e não tenta enviar sinais.
- [ ] Em `win32`, `status` emite a mesma mensagem.
- [ ] Em Linux/macOS, os três comandos seguem funcionando normalmente (guard não interfere).

## Blocked by

- Issue 01 — Esqueleto andante: `start --detach` + `stop`
