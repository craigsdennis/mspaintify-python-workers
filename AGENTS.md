# AGENTS.md — MSPaintify

## What this is

Cloudflare **Python Worker** (Pyodide/WASM) that mspaintifies photos using OpenAI GPT-Image-2 via AI Gateway. Multi-event support via KV config.

## Architecture

- **Entrypoint**: `src/worker.py` — FastAPI app mounted via ASGI on `/api/*`; static assets served for everything else
- **Workflow**: `src/workflow.py` — `MspaintWorkflow` handles durable image processing (read → generate → save to R2)
- **Frontend**: `assets/` — presenter screen (`index.html`), mobile capture (`capture.html`), admin gallery (`app.js`)
- **Event scoping**: everything keyed by `?event=<slug>` query param; R2 keys are `<slug>/photos/` and `<slug>/mspaintified/`

## Key Bindings (wrangler.jsonc)

| Binding | Resource | Purpose |
|---------|----------|---------|
| `MY_BUCKET` | R2 `mspaint-photos` | Original + mspaintified images |
| `CONFIG` | KV namespace | Per-event JSON config: `title`, `additionalInstructions` |
| `AI` | AI Gateway | `openai/gpt-image-2` image generation |
| `MSPAINT_WORKFLOW` | Workflow | Durable execution for image processing |
| `ASSETS` | Static assets | `assets/` directory |

## Developer Commands

```bash
# Deploy (required after any code change; KV changes are live immediately)
npx wrangler deploy

# Set event config in KV (remote)
npx wrangler kv key put <event-slug> '{"title":"...","additionalInstructions":"..."}' --binding=CONFIG --remote

# Local dev (if needed)
npx wrangler dev
```

## Event Config Schema

KV key = event slug (e.g. `pycon2026`, `aspire`). Value is JSON:

```json
{
  "title": "PyCon US 2026",
  "additionalInstructions": "Add 🧡 PyCon US 2026 in the lower right"
}
```

- `title` — used as page title and in QR label
- `additionalInstructions` — appended to the base AI prompt for image generation

## Important Conventions

- **Query strings for event routing**: `/?event=pycon2026`, `/capture.html?event=pycon2026`, `/api/upload?event=pycon2026`
- **R2 key structure**: `<event>/photos/<uuid>.jpg` and `<event>/mspaintified/<uuid>.jpg`
- **Workflow params**: must include `event_slug` alongside `image_key`
- **Static assets**: do not use path-based routing; the Worker serves `assets/` as-is via `ASSETS.fetch()`

## Python Worker Quirks

- Runs on Pyodide (WASM), not CPython. Some stdlib modules behave differently.
- `js` module is available for JS interop (Headers, fetch, Uint8Array, etc.)
- `to_js()` helper in both `worker.py` and `workflow.py` converts Python dicts to JS Objects for R2/API calls
- Workflow steps are DAG-based; dependencies resolved by parameter names in `@step.do` decorated functions

## Testing / Verification

- No unit tests in repo. Verify by uploading a photo via `/capture.html?event=<slug>` and checking the presenter at `/?event=<slug>`
- Check R2 bucket for generated files if workflow seems stuck
