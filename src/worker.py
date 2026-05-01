import base64
import js
import urllib.parse
import uuid

import asgi
from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import JSONResponse, Response
from pyodide.ffi import to_js as _to_js
from workers import WorkerEntrypoint, WorkflowEntrypoint

app = FastAPI()

PROMPT = (
    "Redraw the attached image in the most clumsy, scribbly, and utterly pathetic way possible. "
    "Use a white background, and make it look like it was drawn in MS Paint with a mouse. "
    "It should be vaguely similar but also not really, kind of matching but also off in a confusing, "
    "awkward way, with that low-quality pixel-by-pixel feel that really emphasizes how ridiculously bad it is. "
    "Actually, you know what, whatever, just draw it however you want."
)


def to_js(obj):
    return _to_js(obj, dict_converter=js.Object.fromEntries)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/upload")
async def upload_photo(request: Request, file: UploadFile = File(...)):
    env = request.scope["env"]
    bucket = env.MY_BUCKET

    ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    key = f"photos/{uuid.uuid4()}.{ext}"

    content = await file.read()

    await bucket.put(
        key,
        to_js(content),
        httpMetadata={"contentType": file.content_type or "image/jpeg"},
        customMetadata={"filename": file.filename or "unknown"},
    )

    return JSONResponse(
        {
            "key": key,
            "filename": file.filename,
            "content_type": file.content_type,
            "size": len(content),
        }
    )


@app.get("/api/photos")
async def list_photos(request: Request):
    env = request.scope["env"]
    bucket = env.MY_BUCKET

    prefix = request.query_params.get("prefix", "photos/")
    listed = await bucket.list(prefix=prefix)
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

    return {"photos": photos, "truncated": listed.truncated}


@app.get("/api/photos/{key:path}")
async def get_photo(request: Request, key: str):
    env = request.scope["env"]
    bucket = env.MY_BUCKET

    obj = await bucket.get(key)
    if obj is None:
        return JSONResponse({"error": "Not found"}, status_code=404)

    # writeHttpMetadata requires a JS Headers object
    js_headers = js.Headers.new()
    obj.writeHttpMetadata(js_headers)
    js_headers.set("etag", obj.httpEtag)

    # Read full body and convert JS ArrayBuffer to Python bytes
    body_buffer = await obj.arrayBuffer()
    body_bytes = body_buffer.to_bytes()

    # Convert JS Headers entries iterator to Python dict
    headers = dict(js_headers.entries())

    return Response(content=body_bytes, headers=headers)


@app.post("/api/mspaintify/{key:path}")
async def mspaintify(request: Request, key: str):
    env = request.scope["env"]

    options = to_js({"params": {"image_key": key}})
    instance = await env.MSPAINT_WORKFLOW.create(options)

    return JSONResponse(
        {
            "workflow_id": instance.id,
            "status": "started",
            "image_key": key,
        }
    )


class MspaintWorkflow(WorkflowEntrypoint):
    async def run(self, event, step):
        payload = event["payload"]
        image_key = payload["image_key"]
        env = self.env

        @step.do("read_image")
        async def read_image():
            obj = await env.MY_BUCKET.get(image_key)
            if obj is None:
                raise ValueError(f"Image not found: {image_key}")

            buffer = await obj.arrayBuffer()
            content_type = obj.httpMetadata.contentType or "image/jpeg"
            ext = content_type.split("/")[-1] if "/" in content_type else "jpeg"
            return {
                "bytes": buffer.to_bytes(),
                "content_type": content_type,
                "ext": ext,
            }

        @step.do("generate_mspaint")
        async def generate_mspaint(read_image):
            image_data = read_image
            b64_string = base64.b64encode(image_data["bytes"]).decode("ascii")
            data_uri = f"data:{image_data['content_type']};base64,{b64_string}"

            response = await env.AI.run(
                "openai/gpt-image-2",
                {
                    "prompt": PROMPT,
                    "image": data_uri,
                },
                {
                    "gateway": {"id": "default"},
                },
            )

            return {
                "response": response,
                "ext": image_data["ext"],
                "content_type": image_data["content_type"],
            }

        @step.do("save_result")
        async def save_result(generate_mspaint):
            result = generate_mspaint
            response = result["response"]

            # OpenAI image response: { data: [{ b64_json: "..." }] }
            image_b64 = response["data"][0]["b64_json"]
            image_bytes = base64.b64decode(image_b64)

            output_key = image_key.replace("photos/", "mspaintified/")
            if output_key == image_key:
                output_key = f"mspaintified/{image_key}"

            await env.MY_BUCKET.put(
                output_key,
                to_js(image_bytes),
                httpMetadata={"contentType": result["content_type"]},
                customMetadata={"original": image_key},
            )

            return {"output_key": output_key, "size": len(image_bytes)}

        # Execute the DAG by awaiting the final step.
        # The framework resolves dependencies via parameter names.
        return await save_result()


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        url = urllib.parse.urlparse(request.url)

        if url.path.startswith("/api/"):
            return await asgi.fetch(app, request, self.env)

        return await self.env.ASSETS.fetch(request)
