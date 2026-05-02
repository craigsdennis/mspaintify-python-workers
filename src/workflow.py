import base64
import js
import uuid

from pyodide.ffi import to_js as _to_js
from workers import WorkflowEntrypoint

PROMPT = (
    "Redraw the attached image in the most clumsy, scribbly, and utterly pathetic way possible. "
    "Use a white background, and make it look like it was drawn in MS Paint with a mouse. "
    "It should be vaguely similar but also not really, kind of matching but also off in a confusing, "
    "awkward way, with that low-quality pixel-by-pixel feel that really emphasizes how ridiculously bad it is. "
    "Actually, you know what, whatever, just draw it however you want."
)


def to_js(obj):
    return _to_js(obj, dict_converter=js.Object.fromEntries)


class MspaintWorkflow(WorkflowEntrypoint):
    async def run(self, event, step):
        payload = event["payload"]
        image_key = payload["image_key"]
        env = self.env

        @step.do("read_image")
        async def read_image():
            obj = await env.MY_BUCKET.get(image_key)
            if not obj:
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
                    "images": [data_uri],
                },
                {
                    "gateway": {"id": "mspaintify"},
                },
            )

            # Convert JsProxy response to plain Python dict for RPC serialization
            response_py = response.to_py()
            plain_response = {
                "state": response_py["state"],
                "result": {
                    "image": response_py["result"]["image"]
                },
            }
            if "gatewayMetadata" in response_py:
                plain_response["gatewayMetadata"] = dict(response_py["gatewayMetadata"])

            return {
                "response": plain_response,
                "ext": image_data["ext"],
                "content_type": image_data["content_type"],
            }

        @step.do("save_result")
        async def save_result(generate_mspaint):
            result = generate_mspaint
            response = result["response"]

            # AI Gateway returns a presigned URL to the generated image
            image_url = response["result"]["image"]

            # Fetch the image from the presigned URL
            fetch_response = await js.fetch(image_url)
            if not fetch_response.ok:
                err_text = str(await fetch_response.text())
                raise ValueError(f"Failed to fetch generated image: {fetch_response.status} {err_text}")

            buffer = await fetch_response.arrayBuffer()
            # Convert using the same Uint8Array pattern as get_photo
            image_bytes = bytes(js.Uint8Array.new(buffer))

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
