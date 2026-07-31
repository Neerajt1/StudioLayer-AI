---
name: OpenRouter image response shape
description: How OpenRouter image-generation models (Gemini image, GPT-5 image) return generated images — non-standard message.images field, not message.content.
---

# OpenRouter Image Generation — Response Shape

## The non-standard field

OpenRouter image models (e.g. `google/gemini-3.1-flash-image`) return generated images in a **non-standard field**: `choices[0].message.images`, NOT in `choices[0].message.content` (which is null for pure image responses).

Confirmed shape from live API:
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": null,
      "images": [
        {
          "type": "image_url",
          "image_url": { "url": "data:image/png;base64,..." }
        }
      ]
    }
  }]
}
```

## Key facts

- Images come back as base64 data-URIs (PNG), not as hosted URLs.
- Each request returns exactly 1 image. Fan-out N parallel requests to get N shots.
- The Replit AI Integration for OpenRouter does NOT support image generation. Use the user-supplied `OPENROUTER_API_KEY` directly against `https://openrouter.ai/api/v1`.
- `message.content` is null for image-only responses — do not use it as the primary extraction target.
- Model confirmed working: `google/gemini-3.1-flash-image`. Also available: `google/gemini-3-pro-image`, `openai/gpt-5-image`.

**Why:** The standard OpenAI API returns image data in `content` parts. OpenRouter adds `message.images` as its own field for image-gen model outputs — this is undocumented and discovered only from live response inspection.

**How to apply:** In any code that parses OpenRouter responses from image models, check `message.images` first before falling back to `message.content`. See `artifacts/api-server/src/services/rendering/providers/OpenRouterProvider.ts` → `extractImageUrls()`.
