# Development Runbook

## Local Service

Install test dependencies:

```bash
cd apps/local-service
python -m pip install -e ".[test]"
```

Run tests:

```bash
python -m pytest -q
```

Start service:

```bash
python -m uvicorn job_apply_assistant.main:app --host 127.0.0.1 --port 8765
```

Health check:

```bash
curl http://127.0.0.1:8765/health
```

Expected response:

```json
{"status":"ok","service":"job-apply-assistant-local-service"}
```

## Extension

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm --workspace apps/extension test
```

Build:

```bash
npm --workspace apps/extension run build
```

Load the built extension from `apps/extension/dist` in Chrome or Edge developer mode.

## Manual Safety Check

Before testing on Boss 直聘:

- Confirm the local service is running on `127.0.0.1:8765`.
- Confirm service health with the `/health` curl check above. If using a build with wired health UI, confirm the extension shows service health; the current MVP UI may still show static status text.
- Confirm daily limit and interval settings are conservative before enabling automated actions.
- Confirm pause works from the floating panel and Popup before any live run.
- Stop immediately if a captcha, login prompt, account warning, or unknown dialog appears.
