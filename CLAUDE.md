# CLAUDE.md

This is the Claude Code project instruction file for Mitosis.

Mitosis is a self-bootstrapping AI app-building platform. The MVP core is page-driven iteration through `mitosis.zenheart.site`: anonymous users can use published apps; authenticated repository owners use the Mitosis page to iterate Mitosis itself and to create or iterate apps.

## Product Path Memory

Keep the user-facing model consistent everywhere:

1. Anonymous users can open Gallery and use deployed apps.
2. After GitHub OAuth, users are routed by repository ownership:
   - If they have a usable `mitosis` repository, they enter setup and then Workspace.
   - If not, they stay in public browsing and get fork/copy instructions for their own repository.
3. Repository owners use Workspace chat to self-iterate Mitosis and create or iterate apps.
4. After deployment, new visitors repeat step 1, and owners repeat steps 2-3.

Do not describe the product as "login first, then build" without the anonymous-use and repository-copy path.

## Repository Binding Strategy

Repository ownership is configurable, not hardcoded:

- `VITE_GITHUB_REPO_OWNER` and `VITE_GITHUB_REPO_NAME` define the running instance's default GitHub repository.
- `src/config/repo.ts` is the single source for frontend repository constants and helper functions.
- Fork/copy users should point those env values at their own repository.
- Components must not hardcode `zenHeart/mitosis` except as the default fallback in config.
- Logged-in owner workflows should operate on the authenticated user's own `${user}/mitosis` repository after setup.
- Anonymous Gallery should read from the configured public repository.

## Read First

1. `AGENT.md` for the agent entrypoint.
2. `goal.md` for the only active goal, scope, forbidden changes, acceptance criteria, and verification commands.
3. `agent/README.md` for the runtime checklist.
4. `docs/README.md` only when broader architecture or setup context is needed.

Project rules are in `.claude/rules/*.md`. Do not add arbitrary files under `.claude/`; use only official Claude Code locations such as `settings.json`, `rules/*.md`, `commands/*.md`, `agents/*.md`, and `skills/*/SKILL.md`.

## Commands

```bash
npm run dev
npm run build
npm run typecheck
```

Generated apps are verified from `apps/{name}/v{n}` with:

```bash
bash ../../../worker/verify-build.sh
```

## Non-Negotiables

- Do only the current `goal.md` scope.
- Never read, copy, or commit `.claude/settings.local.json`, `.env*`, real tokens, keys, or secrets.
- Do not claim completion without fresh command output and a verifier PASS in the transcript.
- Platform SPA uses Vite `base: '/'`; generated apps use Vite `base: './'`.
- CI uses `claude -p --bare`; it does not auto-load local `.claude` rules, hooks, MCP, plugins, skills, auto memory, or `CLAUDE.md`.

## Standard Local Goal

```text
/goal Read goal.md and follow CLAUDE.md plus .claude/rules/goal-loop.md, complete all acceptance criteria, include verifier PASS and command outputs in the transcript, stop after 20 turns if blocked.
```
