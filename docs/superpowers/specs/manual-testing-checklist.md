# Manual Testing Checklist

Items that cannot be automated due to external service dependencies.
Complete these after all automated tests pass.

## WhatsApp Flows (requires Twilio + real phone)

- [ ] Send "Arbeit" from test phone → verify check-in time entry created in DB
- [ ] Send "Feierabend" → verify check-out recorded, hours calculated
- [ ] Send "Krank" → verify sick leave record created, Halil notified
- [ ] Send random text → verify bot responds with help/menu
- [ ] Send "Arbeit" twice without "Feierabend" → verify duplicate check-in handled

**Verification:** Check time_entries table after each test.

## Cron Jobs (trigger manually via curl)

- [ ] `curl -X GET https://YOUR-APP.vercel.app/api/cron/morning -H "Authorization: Bearer CRON_SECRET"` → verify daily plan generation
- [ ] `curl -X GET https://YOUR-APP.vercel.app/api/cron/evening -H "Authorization: Bearer CRON_SECRET"` → verify anomaly detection runs (check for missing checkouts)
- [ ] `curl -X GET https://YOUR-APP.vercel.app/api/cron/nightly -H "Authorization: Bearer CRON_SECRET"` → verify nightly cleanup/maintenance

**Verification:** Check daily_plans and time_entries tables.

## Photo Upload (requires Supabase storage)

- [ ] Create an extra job → upload a photo → verify photo URL stored and accessible
- [ ] Try uploading a non-image file → verify rejection
- [ ] Try uploading a very large file (>10MB) → verify proper error message

## PDF/Excel Generation (requires Supabase storage)

- [ ] Generate monthly report for a month with data → verify PDF downloads and has correct content
- [ ] Generate timesheet for a worker → verify hours match time entries
- [ ] Export analytics → verify Excel opens with correct data
- [ ] Generate report for empty month → verify it handles gracefully (no crash)

## Browser Compatibility

- [ ] Test on Chrome desktop
- [ ] Test on mobile browser (responsive layout)
- [ ] Verify German date formats throughout (DD.MM.YYYY)
- [ ] Verify language toggle works (DE ↔ EN)
- [ ] Verify dark/light theme toggle
