# SiliconFlow API Debug Guide

**Date:** January 22, 2026

---

## Issue Identified and Fixed

After carefully reviewing the official SiliconFlow API documentation, I found the root cause of the silent failures:

### The Problem

I initially changed the `image_size` parameter to use **object format**:
```python
'image_size': {'width': 512, 'height': 512}  # WRONG - This format is NOT accepted
```

However, the official SiliconFlow API actually expects a **STRING format**:
```python
'image_size': '512x512'  # CORRECT - String format per official docs
```

This caused the API requests to fail with 400 errors, which is why the application was silently falling back to Pollinations AI.

---

## What Was Fixed

### Correct Format (Per Official SiliconFlow Docs)

**Image Generation API:**
```python
# Request format
payload = {
    'model': 'black-forest-labs/FLUX.1-schnell',
    'prompt': 'A beautiful sunset',
    'image_size': '1024x1024'  # STRING format, NOT object
}

# Response format
{
    "images": [{"url": "https://..."}],  # Uses 'images' array, NOT 'data'
    "timings": {"inference": 123},
    "seed": 123
}
```

**Video Generation API:**
```python
# Request format
payload = {
    'model': 'Wan-AI/Wan2.2-T2V-A14B',  # Text-to-Video
    'prompt': 'A dog running in the park',
    'image_size': '1280x720'  # STRING format
}

# Response format
{"requestId": "abc123"}
```

---

## All Fixes Applied

1. **Z-Image-Turbo Generation:** Changed `image_size` to string format, response parsing uses `images` array
2. **FLUX.2 Pro Generation:** Changed `image_size` to string format, response parsing uses `images` array
3. **Video Generation:** Changed resolution map to return strings, not objects
4. **Debug Endpoint:** Updated image test to use correct string format

---

## Deployment Instructions

### Step 1: Push Changes to GitHub

```bash
cd ~/Desktop/sparkie-studio
git add .
git commit -m "Fix SiliconFlow API format - image_size must be string not object"
git push origin master --force
```

### Step 2: Redeploy on DigitalOcean

1. Go to: https://cloud.digitalocean.com/apps
2. Click on your sparkie-studio app
3. Click "Deploy" to trigger redeployment
4. Wait 1-2 minutes for deployment to complete

### Step 3: Test the Fix

Visit the debug test page:
```
https://sparkie-studio-mhouq.ondigitalocean.app/debug-test.html
```

Click "Generate Test Image" and verify:
- Status should show SUCCESS
- Backend logs should show `Response status: 200`
- Image should be generated from SiliconFlow (not Pollinations)

---

## SiliconFlow API Specification (Official)

### Image Generation

**Endpoint:** `POST https://api.siliconflow.cn/v1/images/generations`

**Request Body:**
```json
{
    "model": "black-forest-labs/FLUX.1-schnell",
    "prompt": "an island near sea, with seagulls",
    "image_size": "1024x1024",
    "batch_size": 1,
    "num_inference_steps": 20,
    "guidance_scale": 7.5
}
```

**Response:**
```json
{
    "images": [{"url": "<string>"}],
    "timings": {"inference": 123},
    "seed": 123
}
```

### Video Generation

**Endpoint:** `POST https://api.siliconflow.cn/v1/video/submit`

**Request Body:**
```json
{
    "model": "Wan-AI/Wan2.2-I2V-A14B",
    "prompt": "<string>",
    "image_size": "1280x720"
}
```

**Response:**
```json
{
    "requestId": "<string>"
}
```

---

## Available Models

### Image Generation Models (per SiliconFlow docs)
- `Kwai-Kolors/Kolors`
- `Qwen/Qwen-Image`
- `black-forest-labs/FLUX.1-schnell`
- `black-forest-labs/FLUX.1-dev`
- `black-forest-labs/FLUX.1-pro`

### Video Generation Models
- `Wan-AI/Wan2.2-T2V-A14B` (Text-to-Video)
- `Wan-AI/Wan2.2-I2V-A14B` (Image-to-Video)

---

## Verification Checklist

- [ ] Deploy the updated code
- [ ] Visit debug test page
- [ ] Generate a test image
- [ ] Check backend logs for `Response status: 200`
- [ ] Verify image URL is from SiliconFlow (not Pollinations)
- [ ] Test video generation (should not return 401)

---

## Common Error Messages

### Error: 400 Bad Request (image_size format)
**Cause:** Using object format `{'width': 512, 'height': 512}` instead of string `"512x512"`

**Solution:** Change to string format in your API request

### Error: 401 Unauthorized
**Cause:** API key is missing or invalid

**Solution:** Verify `SILICONFLOW_API_KEY` is set in DigitalOcean environment variables

### Error: 404 Not Found (model not found)
**Cause:** Model name doesn't exist

**Solution:** Check available models at SiliconFlow model list and use exact name

---

## Backend Logs to Check

After deployment, check DigitalOcean deployment logs for:

**SUCCESS Pattern:**
```
=== IMAGE GENERATION (Z-Image-Turbo) ===
API Key configured: True
Request payload: {'model': 'ZhipuAI/GLM-4-plus', 'prompt': '...', 'image_size': '1024x1024'}
Response status: 200
Response body: {"images":[{"url":"https://..."}]}
Found image URL/b64 in 'images' array: True
```

**FAILURE Pattern (WRONG FORMAT):**
```
=== IMAGE GENERATION (Z-Image-Turbo) ===
Response status: 400
Response body: {"error":{"message":"image_size must be of type string"}}
Z-Image API failed: Status 400: {"error":{"message":"image_size must be of type string"}}
Falling back to Pollinations AI...
```

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/main.py` | Fixed image_size format in all SiliconFlow API calls |
| `DEBUG-GUIDE.md` | Updated documentation with correct API format |

---

## Still Not Working?

If image/video generation still fails after this fix:

1. **Visit the debug endpoint directly:**
   ```
   https://sparkie-studio-mhouq.ondigitalocean.app/api/debug/siliconflow-test
   ```

2. **Check the response** for specific error messages

3. **Check backend logs** for exact API request/response

4. **Verify your account** has access to the models at https://cloud.siliconflow.cn

5. **Share the results** and I'll help troubleshoot

**Built with by Sparkie Studio Team**
