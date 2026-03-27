# Infrastructure Domain Audit

**Date**: 2026-03-27
**Scope**: Authentication, cron jobs, webhook, notifications, photo storage, DB pool, config
**Auditor**: Claude Code (automated)

---

## Findings

### FINDING-IF-1: Webhook Twilio Signature Validation Bypass
- **Severity**: Critical
- **File(s)**: `api/_handlers/webhook.js`
- **Line(s)**: 18-20
- **Description**: The Twilio signature validation has a silent fallback that skips verification entirely. If `twilio.validateRequest` is not a function (e.g., due to an import issue or library version mismatch), the code defaults to `true`, allowing any request through without signature validation.
- **Risk**: An attacker can forge webhook requests to impersonate workers, check in/out on their behalf, mark tasks as done, declare sick leave, or approve plans — all without any valid Twilio signature.
- **Recommendation**: Remove the fallback. If `twilio.validateRequest` is not available, reject the request with a 500 error rather than silently accepting it. Use `twilio.validateRequest(...)` directly and let it throw if unavailable.

### FINDING-IF-2: Webhook Signature Validation Skipped in Test Mode
- **Severity**: Medium
- **File(s)**: `api/_handlers/webhook.js`
- **Line(s)**: 11
- **Description**: When `NODE_ENV === 'test'`, the entire Twilio signature validation block is skipped. If `NODE_ENV` is accidentally set to `'test'` in production (e.g., via a misconfigured environment variable), all webhook authentication is disabled.
- **Risk**: Complete bypass of webhook authentication in production if the environment variable is misconfigured.
- **Recommendation**: Use a more explicit flag like `SKIP_WEBHOOK_VALIDATION=true` that is less likely to be accidentally set, or remove the bypass entirely and use proper test mocking.

### FINDING-IF-3: JWT Token Accepted via Query Parameter
- **Severity**: High
- **File(s)**: `src/middleware/auth.js`
- **Line(s)**: 10, 33
- **Description**: Both `requireAuth` and `checkAuth` accept JWT tokens via the `token` query parameter (`req.query.token`). Query parameters are logged in web server access logs, browser history, referrer headers, and proxy logs.
- **Risk**: JWT tokens are exposed in URLs, which can be cached, logged, or leaked via the `Referer` header. An attacker with access to logs or browser history gains full admin access for up to 7 days (the token expiry).
- **Recommendation**: Remove query parameter token support. Accept tokens only via the `Authorization` header. If URL-based auth is needed (e.g., for download links), use short-lived, single-use tokens.

### FINDING-IF-4: No JWT Secret Validation at Startup
- **Severity**: High
- **File(s)**: `src/config.js`
- **Line(s)**: 4
- **Description**: `config.jwtSecret` is read directly from `process.env.JWT_SECRET` with no default and no validation. If the environment variable is missing, `jwt.sign()` and `jwt.verify()` will receive `undefined` as the secret.
- **Risk**: With `jsonwebtoken`, passing `undefined` as a secret to `jwt.verify()` causes it to throw, which means auth will always fail (a denial of service). However, some JWT library versions may behave unpredictably with falsy secrets, potentially accepting any token.
- **Recommendation**: Add startup validation that throws an error if `JWT_SECRET` is not set. Also validate `ADMIN_PASSWORD_HASH`, `TWILIO_AUTH_TOKEN`, and other critical secrets.

### FINDING-IF-5: No Admin Password Hash Validation
- **Severity**: High
- **File(s)**: `api/_handlers/auth/login.js`, `src/config.js`
- **Line(s)**: login.js:15, config.js:14
- **Description**: `config.adminPasswordHash` has no default and no validation. If `ADMIN_PASSWORD_HASH` is unset, `bcrypt.compare(password, undefined)` will throw, but the error is caught by `withErrorHandler` and returned as a 500 — leaking no useful info but also providing no clear diagnostic.
- **Risk**: If the env var is missing, login is completely broken with no clear error message. More critically, if someone sets it to an empty string, `bcrypt.compare` behavior could be unpredictable.
- **Recommendation**: Validate at startup that `ADMIN_PASSWORD_HASH` is set and is a valid bcrypt hash (starts with `$2b$` or `$2a$`).

### FINDING-IF-6: DB Pool Has No Connection Limits or Timeout Configuration
- **Severity**: Medium
- **File(s)**: `src/db/pool.js`
- **Line(s)**: 4-9
- **Description**: The `pg.Pool` is created with only `connectionString` and `ssl` options. No `max`, `idleTimeoutMillis`, `connectionTimeoutMillis`, or `statement_timeout` are configured. The default `pg.Pool` max is 10 connections.
- **Risk**: Under load (e.g., many concurrent cron jobs, webhook requests, and dashboard queries), the pool can be exhausted. Long-running queries with no statement timeout can hold connections indefinitely, cascading into pool exhaustion and total service failure.
- **Recommendation**: Configure explicit pool limits: `max: 5` (appropriate for serverless), `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`, and set `statement_timeout` to prevent runaway queries. Consider adding a pool error handler (`pool.on('error', ...)`).

### FINDING-IF-7: SSL Configuration Uses rejectUnauthorized: false
- **Severity**: Medium
- **File(s)**: `src/db/pool.js`
- **Line(s)**: 6-8
- **Description**: When the database URL contains "supabase", SSL is configured with `rejectUnauthorized: false`, which disables certificate verification.
- **Risk**: The connection is vulnerable to man-in-the-middle attacks. An attacker on the network path between the serverless function and the database could intercept and modify all database traffic.
- **Recommendation**: Use `rejectUnauthorized: true` with the proper CA certificate, or use Supabase's connection pooler which supports verified SSL. At minimum, document why this is necessary and track removal.

### FINDING-IF-8: Photo Storage Has No Error Handling for Twilio Download Failure
- **Severity**: Medium
- **File(s)**: `src/services/photoStorage.js`
- **Line(s)**: 19-26
- **Description**: The `fetch()` call to download from Twilio does not check the HTTP response status. If Twilio returns a 401, 404, or 500, the code will attempt to upload the error response body (HTML/JSON) as an image to Supabase Storage.
- **Risk**: Corrupted or invalid files are stored as "photos" in Supabase. Downstream consumers (dashboard, reports) will display broken images. The task_assignments table will reference invalid photo URLs with no indication of failure.
- **Recommendation**: Add `if (!response.ok) throw new Error(...)` after the fetch call. Also validate the content type of the response matches an expected image type.

### FINDING-IF-9: Notification Failures Are Silently Swallowed
- **Severity**: Medium
- **File(s)**: `src/services/notifications.js`, `src/services/taskNotifications.js`, `src/services/planNotifications.js`
- **Line(s)**: All notification functions
- **Description**: None of the notification functions have try/catch blocks. If `sendWhatsAppMessage` or `sendWhatsAppButtons` throws (e.g., Twilio API error, invalid number), the error propagates up to the caller. In `bot.js`, some callers like `handleSickDayCount` (line 492) call `notifyHalilSickDeclaration` without try/catch, meaning a notification failure will cause the entire sick leave recording to fail.
- **Risk**: A Twilio outage or rate limit causes business-critical operations (sick leave recording, task completion, plan distribution) to fail entirely, even though the core database operations succeeded.
- **Recommendation**: Wrap notification calls in try/catch blocks with logging. The core business operation should succeed even if the notification fails. Consider a notification queue with retry logic.

### FINDING-IF-10: Cron Jobs Accept GET and POST Without Method Check
- **Severity**: Low
- **File(s)**: `api/_handlers/cron/nightly.js`, `api/_handlers/cron/morning.js`, `api/_handlers/cron/evening.js`
- **Line(s)**: All handler functions
- **Description**: The cron handlers check the `Authorization` header but do not verify the HTTP method. They accept GET, POST, PUT, DELETE, or any other method.
- **Risk**: Minor — the CRON_SECRET check is the primary defense. However, accepting all methods increases the attack surface and makes the API behavior less predictable.
- **Recommendation**: Add `if (req.method !== 'GET') return res.status(405)...` since Vercel cron jobs invoke endpoints via GET.

### FINDING-IF-11: Nightly Cron Does Duplicate Work with Evening Cron
- **Severity**: Low
- **File(s)**: `api/_handlers/cron/nightly.js`, `api/_handlers/cron/evening.js`
- **Line(s)**: nightly.js:39-41, evening.js:11-13
- **Description**: Both the nightly and evening cron handlers call `generateDraftPlan(tomorrow)` and `notifyHalilPlanReady(plan.id)`. If both run, the plan is generated twice.
- **Risk**: Duplicate plans could be created for the same date, or the second run could overwrite/conflict with edits Halil made after the first notification. Also wastes WhatsApp API quota.
- **Recommendation**: Either remove the duplicate plan generation from nightly, or add idempotency to `generateDraftPlan` so it returns the existing plan if one already exists for that date.

### FINDING-IF-12: Config Missing Halil WhatsApp Number Causes Silent Failures
- **Severity**: Medium
- **File(s)**: `src/config.js`, `src/services/notifications.js`
- **Line(s)**: config.js:12, notifications.js:6-9
- **Description**: `config.halilWhatsappNumber` has no default and no validation. If `HALIL_WHATSAPP_NUMBER` is unset, every notification to Halil will fail when Twilio rejects the empty/undefined recipient.
- **Risk**: All admin notifications (sick leave, missing checkouts, anomalies, plan approvals) silently fail. Halil receives no alerts and is unaware of operational issues.
- **Recommendation**: Validate at startup that `HALIL_WHATSAPP_NUMBER` is set and matches a valid phone number format.

### FINDING-IF-13: Health Endpoint Exposes No Useful Diagnostic Information
- **Severity**: Low
- **File(s)**: `api/_handlers/health.js`
- **Line(s)**: 1-3
- **Description**: The health endpoint returns `{ status: 'ok' }` without checking database connectivity, Twilio availability, or Supabase storage access.
- **Risk**: The health endpoint reports "ok" even when critical dependencies are down, making it useless for monitoring and alerting.
- **Recommendation**: Add a database ping (`SELECT 1`) at minimum. Optionally check Twilio and Supabase connectivity. Return degraded status if any dependency is unreachable.

### FINDING-IF-14: Router Dynamic Route Parameters Not Sanitized
- **Severity**: Medium
- **File(s)**: `api/index.js`
- **Line(s)**: 234-243
- **Description**: Dynamic route parameters (e.g., `:id` in `/workers/:id`) are extracted from the URL via regex and injected directly into `req.query` without any sanitization or type validation. The regex `([^/]+)` matches any non-slash string.
- **Risk**: While the parameterized SQL queries in handlers use `$1` placeholders (preventing direct SQL injection), non-integer IDs passed to handlers expecting integers could cause unexpected errors or, if any handler uses string concatenation for queries, enable SQL injection.
- **Recommendation**: Validate that dynamic route parameters match expected formats (e.g., integer IDs should match `/^\d+$/`) before passing to handlers.

### FINDING-IF-15: WhatsApp Template Cache Grows Unbounded
- **Severity**: Low
- **File(s)**: `src/services/whatsapp.js`
- **Line(s)**: 7, 60-62, 90
- **Description**: The `templateCache` Map grows indefinitely as new body+button combinations are used. In a long-running process, this is a memory leak. In serverless, instances are recycled, but warm instances can still accumulate significant cache entries.
- **Risk**: Memory consumption grows over time. In warm serverless instances that handle many different message types, this could lead to increased memory usage and eventual function timeout.
- **Recommendation**: Use an LRU cache with a max size (e.g., 100 entries), or add a TTL-based expiry mechanism.

### FINDING-IF-16: Bot Plan Approval Relies on Phone Number Comparison for Authorization
- **Severity**: High
- **File(s)**: `src/services/bot.js`
- **Line(s)**: 263, 273
- **Description**: Plan approval and edit commands (`plan_approve_X`, `plan_edit_X`) are authorized by comparing the sender's phone number to `config.halilWhatsappNumber`. Phone numbers in WhatsApp/Twilio can be spoofed at the webhook level if signature validation is bypassed (see FINDING-IF-1).
- **Risk**: Combined with FINDING-IF-1 (signature bypass), an attacker could approve or modify daily plans by sending a forged webhook request with Halil's phone number.
- **Recommendation**: This authorization is acceptable only if webhook signature validation is rock-solid. Fix FINDING-IF-1 first. Consider adding a confirmation step or PIN for critical admin actions.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 4     |
| Medium   | 6     |
| Low      | 5     |
| **Total** | **16** |

### Priority Actions
1. **Fix webhook signature validation bypass** (FINDING-IF-1) — this is the single most critical issue, as it undermines all bot-based authorization.
2. **Remove query parameter token support** (FINDING-IF-3) — prevents token leakage.
3. **Add startup config validation** (FINDING-IF-4, IF-5, IF-12) — fail fast on missing secrets.
4. **Add notification error isolation** (FINDING-IF-9) — prevent notification failures from breaking core operations.
5. **Configure DB pool limits** (FINDING-IF-6) — prevent pool exhaustion under load.
