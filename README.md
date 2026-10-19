# Cook menu planner

A small web app for rotating breakfast, lunch, and dinner menus and sending the next day's menu to a cook on WhatsApp at 10:30 PM India time.

## Current behavior

- Each meal has an independent menu rotation.
- Sunday is skipped, so no Saturday-night message is sent.
- Morning leave suppresses breakfast and lunch; evening leave suppresses dinner; all-day leave suppresses everything.
- The app keeps menu positions unchanged until a provider acceptance is verified.
- Provider credentials are read from environment variables, never from the browser UI.

## Run locally

Requires Node.js 22.5+ because the app uses the built-in `node:sqlite` module.

```bash
cd cook-menu
copy .env.example .env
npm test
npm start
```

Open http://127.0.0.1:3000.

## WhatsApp provider

The app is wired to Green API's HTTPS API rather than the paid official WhatsApp Business API. Green API availability, free-plan limits, WhatsApp account state, and delivery are external dependencies. Keep `ENABLE_SENDING=false` until the instance is connected and a test message is confirmed.

## Deployment notes

Use a cloud host that supports a persistent disk and a continuously running Node process. The SQLite database must be stored on persistent storage, and the process must remain online at 10:30 PM Asia/Kolkata. Set `APP_PASSWORD` whenever the app is exposed beyond localhost.
