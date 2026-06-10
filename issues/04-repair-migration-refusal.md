# Issue 04 — Recusa de repair/migração no `--detach`

**Type:** AFK

## Parent

PRD: `packages/cli/PRD-detach-background.md`

## What to build

Impedir que o prompt interativo de migração/repair trave um processo sem stdin.
No modo `--detach`, o pai parseia os data files **sem** repair; se algum env precisar
de migração ou repair, o comando **falha rápido** com mensagem clara (orientando a
rodar em foreground ou reparar antes) e **não forka** o processo destacado.

Adicionalmente, `--repair` combinado com `--detach` é um erro de flags incompatíveis
(declarado como `exclusive` no oclif), com mensagem explícita de que repair não roda
em background.

## Acceptance criteria

- [ ] `start --detach` sobre um arquivo que precisa de migração falha com mensagem clara e não cria daemon nem state file.
- [ ] `start --detach --repair` é rejeitado com erro de flags incompatíveis.
- [ ] Nenhum prompt interativo é exibido no fluxo `--detach`.
- [ ] `start --detach` sobre um arquivo já válido/migrado sobe normalmente.

## Blocked by

- Issue 01 — Esqueleto andante: `start --detach` + `stop`
