# wt

Git worktrees CLI with GitHub integration.

## Installation

```bash
npm install -g @onmax/wt
```

## Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- Git repository with a GitHub remote

## Usage

Run `wt` in any git repository to start the interactive mode:

```bash
wt
```

The CLI guides you through creating worktrees from issues, PRs, or custom branches.

### Commands

| Command | Description |
|---------|-------------|
| `wt` | fzf picker → cd into worktree |
| `wt add [ref]` | Smart add (see examples below) |
| `wt add [ref] --pr` | Create worktree and open a draft PR |
| `wt ls` | List worktrees with PR/CI status |
| `wt rm [name]` | Remove worktree |
| `wt sync` | Rebase on base branch |
| `wt ci` | Show CI status for current PR |

### Add Examples

```bash
wt add                 # interactive: pick issue/PR/custom
wt add fix-bug         # new branch from default
wt add #123            # auto-detect: issue or PR
wt add @branch         # clone existing remote branch
wt add fix-bug --pr    # create draft PR
```

### Interactive Mode

When you run `wt add` without arguments, the CLI presents an autocomplete picker with three options:

1. **Create from Issue** - Select an open GitHub issue, auto-generates branch name
2. **Create from PR** - Clone an existing PR's branch as a worktree
3. **Create Custom** - Enter a custom branch name

The picker loads the 100 most recent open issues and PRs for fast initial display. You can search dynamically:

- **By number** - Type `#123` or `123` to find any issue or PR, even if it's not in the initial 100
- **By title** - Type keywords to filter the cached results

When you search by number, the CLI performs a live lookup if the item isn't already cached. This enables you to access any issue or PR while maintaining fast initial load times.

When creating from an issue, the CLI:
- Creates a worktree at `../{repo}-worktrees/{branch}`
- Copies `.env` from the main repo if present
- Pushes to your fork if you lack write access
- Installs dependencies with `ni`
- Spawns a shell in the new worktree

## Configuration

### Custom Worktree Paths

Configure per repository in `~/.config/wt/config.json`:

```json
{
  "nuxt-hub/core": "~/nuxt/hub-worktrees",
  "unjs/nitro": "~/nuxt/nitro-worktrees"
}
```

### File Propagation

Create `.wt.json` in repo root to auto-copy files to new worktrees:

```json
{
  "propagate": [".env", ".env.local", "config.local.json"]
}
```

## How It Works

The CLI uses [git worktrees](https://git-scm.com/docs/git-worktree) to maintain multiple working directories linked to a single repository. This approach:

- Eliminates the need to re-clone repositories
- Allows instant switching between branches via `cd`
- Shares fetched objects across all worktrees
- Enables working on multiple branches simultaneously

### Fork Workflow

When you lack push access to a repository, the CLI automatically:

1. Creates or uses your existing fork
2. Adds the fork as a `fork` remote
3. Pushes to the fork instead of origin
4. Creates PRs with the correct `user:branch` head reference

## License

MIT
