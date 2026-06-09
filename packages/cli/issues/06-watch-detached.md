# Issue 06 — `--watch` no modo destacado

**Type:** AFK

## Parent

PRD: `packages/cli/PRD-detach-background.md`

## What to build

Garantir e verificar que `--watch` funciona no modo background. Como o processo
destacado roda o `start` foreground normal, o recarregamento ao editar o arquivo de
dados funciona naturalmente; esta fatia entrega a verificação end-to-end de que um
daemon iniciado com `start --detach --watch` recarrega o mock quando o data file muda.

Documenta também o drift aceito: se a edição mudar a porta, o campo `ports` do
`daemon.json` pode ficar desatualizado (o `pid` permanece correto e o `stop` funciona).

## Acceptance criteria

- [ ] `start --detach --watch` sobe o daemon e o campo `watch` do `daemon.json` é `true`.
- [ ] Editar o data file faz o daemon recarregar e servir o conteúdo atualizado, sem reiniciar o comando.
- [ ] `stop` derruba normalmente um daemon iniciado com `--watch`.

## Blocked by

- Issue 01 — Esqueleto andante: `start --detach` + `stop`
