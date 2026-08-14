import js
import json
import urllib.parse
import uuid

import asgi
from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from pyodide.ffi import to_js as _to_js
from workers import WorkerEntrypoint

from workflow import MspaintWorkflow

app = FastAPI()


def to_js(obj):
    return _to_js(obj, dict_converter=js.Object.fromEntries)


def get_event_prefix(request: Request) -> str:
    """Get the R2 key prefix for the current event slug."""
    event = request.query_params.get("event", "default")
    return f"{event}/"


@app.get("/api/config")
async def get_config(request: Request):
    env = request.scope["env"]
    event = request.query_params.get("event", "default")

    config_json = await env.CONFIG.get(event)
    if not config_json:
        return JSONResponse(
            {"error": f"No config found for event: {event}"}, status_code=404
        )

    config = json.loads(config_json)
    return {"event": event, **config}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/upload")
async def upload_photo(request: Request, file: UploadFile = File(...)):
    env = request.scope["env"]
    bucket = env.MY_BUCKET
    prefix = get_event_prefix(request)

    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    key = f"{prefix}photos/{uuid.uuid4()}.{ext}"

    content = await file.read()

    await bucket.put(
        key,
        to_js(content),
        httpMetadata={"contentType": file.content_type or "image/jpeg"},
        customMetadata={"filename": file.filename or "unknown"},
    )

    # Auto-trigger the MSPaintify workflow
    event = request.query_params.get("event", "default")
    options = to_js({"params": {"image_key": key, "event_slug": event}})
    workflow_instance = await env.MSPAINT_WORKFLOW.create(options)

    return JSONResponse(
        {
            "key": key,
            "workflow_id": workflow_instance.id,
            "status": "processing",
            "filename": file.filename,
            "content_type": file.content_type,
            "size": len(content),
        }
    )


@app.get("/api/photos")
async def list_photos(request: Request):
    env = request.scope["env"]
    bucket = env.MY_BUCKET
    prefix = get_event_prefix(request)
    list_type = request.query_params.get("type", "photos")

    if list_type == "mspaintified":
        list_prefix = f"{prefix}mspaintified/"
    else:
        list_prefix = f"{prefix}photos/"

    listed = await bucket.list(prefix=list_prefix)
    photos = []
    for obj in listed.objects:
        photos.append(
            {
                "key": obj.key,
                "size": obj.size,
                "uploaded": obj.uploaded.toISOString(),
                "etag": obj.httpEtag,
            }
        )

    return {"photos": photos, "truncated": listed.truncated, "type": list_type}


@app.get("/api/photos/{key:path}")
async def get_photo(request: Request, key: str):
    env = request.scope["env"]
    bucket = env.MY_BUCKET

    obj = await bucket.get(key)
    if not obj:
        return JSONResponse({"error": "Not found"}, status_code=404)

    # writeHttpMetadata requires a JS Headers object
    js_headers = js.Headers.new()
    obj.writeHttpMetadata(js_headers)
    js_headers.set("etag", obj.httpEtag)
    js_headers.set("Cache-Control", "public, max-age=31536000, immutable")

    # Read full body and convert JS ArrayBuffer to Python bytes
    body_buffer = await obj.arrayBuffer()
    body_bytes = body_buffer.to_bytes()

    # Convert JS Headers entries iterator to Python dict
    headers = dict(js_headers.entries())

    return Response(content=body_bytes, headers=headers)


@app.get("/api/workflow-status/{workflow_id}")
async def workflow_status(request: Request, workflow_id: str):
    env = request.scope["env"]
    instance = await env.MSPAINT_WORKFLOW.get(workflow_id)
    status = await instance.status()
    return {"status": status, "workflow_id": workflow_id}


@app.post("/api/mspaintify/{key:path}")
async def mspaintify(request: Request, key: str):
    env = request.scope["env"]
    image_key = urllib.parse.unquote(key)
    event = request.query_params.get("event", "default")

    options = to_js({"params": {"image_key": image_key, "event_slug": event}})
    instance = await env.MSPAINT_WORKFLOW.create(options)

    return JSONResponse(
        {
            "workflow_id": instance.id,
            "status": "started",
            "image_key": image_key,
        }
    )


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        url = urllib.parse.urlparse(request.url)

        if url.path.startswith("/api/"):
            return await asgi.fetch(app, request, self.env)

        return await self.env.ASSETS.fetch(request)
