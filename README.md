# MSPaintify

A Cloudflare Python Worker that turns photos into delightfully terrible MS Paint-style drawings using OpenAI's GPT-Image-2 via AI Gateway.

Built for events! Multiple events can be configured via Workers KV without code changes.

## How it works

1. **Upload** — Take a photo on your phone via the capture page
2. **Process** — A durable Python Workflow sends your photo to GPT-Image-2 with a delightfully unhinged prompt
3. **Display** — The presenter screen shows a live slideshow of before/after pairs

## Architecture

- **Python Worker** ([`src/worker.py`](src/worker.py)) — FastAPI app on Pyodide/WASM handling uploads and serving static assets
- **Workflow** ([`src/workflow.py`](src/workflow.py)) — Durable DAG-based execution for image generation
- **Frontend** (`assets/`) — Presenter screen, mobile capture, admin gallery
- **Storage** — R2 for images, KV for per-event config, AI Gateway for image generation

## Event Configuration

Set up a new event without deploying:

```bash
npx wrangler kv key put <event-slug> '{"title":"My Event","additionalInstructions":"Add a logo in the corner"}' --binding=CONFIG --remote
```

Then visit:
- Presenter: `https://mspaintify.<user>.workers.dev/?event=<event-slug>`
- Capture: `https://mspaintify.<user>.workers.dev/capture.html?event=<event-slug>`

## Resources

- [Python Workers Documentation](https://developers.cloudflare.com/workers/languages/python/)
- [Cloudflare Python Workers Examples](https://github.com/cloudflare/python-workers-examples)
- [Pyodide](https://pyodide.org/) — Python in the browser (and in Workers!)
- [Workflows Python](https://developers.cloudflare.com/workflows/python/)
- [AI Gateway — GPT-Image-2](https://developers.cloudflare.com/ai/models/openai/gpt-image-2/)
