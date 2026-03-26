# Bal Hausmeisterservice — Automated Management System

**Date:** 2026-03-26
**Client:** Halil Bal, Bal Hausmeisterservice, Pfaffenhofen an der Ilm, Bayern
**Primary User:** Halil Bal (administrator, sole system manager)

## Overview

A custom-built system to replace Mr. Bal's manual Excel-based workflow for managing his facility management company. The system covers three core modules: payroll & time tracking, task scheduling, and garbage bin management. Workers interact exclusively via WhatsApp; Halil manages everything through a web-based admin dashboard and receives WhatsApp notifications.

## Architecture

```
Workers (WhatsApp)  ──▶  Twilio WhatsApp API  ──▶  Node.js + Express API  ◀──  Admin Dashboard (React PWA)
                    ◀──                        ◀──        │                ──▶
                                                          │
                                                    PostgreSQL DB
                                                          │
                                                   Hosted on Hetzner VPS
                                                   (~5 EUR/month, Germany)
```

**Stack:**
- **Backend:** Node.js + Express REST API
- **Database:** PostgreSQL
- **WhatsApp Integration:** Twilio WhatsApp Business API
- **Admin Dashboard:** React PWA (only for Halil)
- **PDF Generation:** Puppeteer or pdfkit (branded reports for Steuerberater)
- **Hosting:** Hetzner VPS (Germany-based, GDPR compliant)

**Estimated monthly cost:** ~20-50 EUR (hosting + WhatsApp API messages)

---

## Module 1: Payroll & Time Tracking (Gehaltsliste)

### Purpose

Replace the manual paper check-in/check-out system and Excel payroll tracking. Auto-calculate working hours, overtime, sick leave, vacation, and generate monthly reports for the Steuerberater (financial advisor).

### Worker Types

| Type | Monthly Hours | Pay Structure |
|------|--------------|---------------|
| **Full-time** | 173.2 hrs (5 days x 4.33 weeks x 8 hrs) | Hourly rate (e.g., 14 EUR) x 173.2 hrs |
| **Minijob** | 35-40 hrs (varies by hourly wage) | Fixed ~600 EUR/month (603 EUR cap) |

### Worker Interaction (WhatsApp)

Workers message a WhatsApp Business number. All interactions are **button-based only** — no free-text commands are processed.

**Menu presented on any message:**
```
Hallo [Name]! Was moechtest du tun?

[Einchecken]  [Auschecken]  [Krank melden]
```

- **Einchecken:** Logs current time. Response: "Eingecheckt um 06:32. Guten Arbeitstag!"
- **Auschecken:** Logs current time. Response: "Ausgecheckt um 15:45. Bis morgen!"
- **Krank melden:** Follow-up button prompt "Wie viele Tage?" → [1] [2] [3] [4] [5] [Mehr] → Halil notified via WhatsApp

**Free text handling:** Any text message (stories, questions, attempts to change times) receives:
> "Ich kann nur diese Aktionen ausfuehren:"
> [Einchecken] [Auschecken] [Krank melden]
> "Fuer alles andere bitte direkt Halil kontaktieren."

**Built-in protections:**
- Cannot check in twice: "Du bist bereits eingecheckt seit 06:32"
- Cannot check out without checking in: "Du bist heute nicht eingecheckt"
- Cannot backdate or modify times — only Halil can edit via dashboard
- Check-in is always allowed (workers may pull next-day tasks or work extra) — the system simply logs the time

### Authentication

- Workers are identified by their **WhatsApp phone number** — no separate login needed
- Halil registers each worker's phone number in the system when onboarding them
- If a message comes from an unregistered number, the bot responds: "Diese Nummer ist nicht registriert. Bitte kontaktiere Halil."
- For the **admin dashboard**, Halil logs in with username + password (single admin account)

### Automatic Calculations

**Official hours (sent to Steuerberater):**
- Capped at the monthly maximum (173.2 hrs for full-time, individual cap for Minijob)
- If actual check-in/out hours are less than the cap, actual hours are reported

**Unofficial overtime (internal only):**
- Any hours worked beyond the monthly official cap
- Tracked in a separate internal report, never included in the Steuerberater PDF
- Visible to Halil in the dashboard

**Harcirah (Verpflegungspauschale):**
- If a worker's daily hours exceed 8.5 hours (including lunch break), the system auto-flags 14 EUR for that day
- Tax-free, added to the monthly report as a separate line item

**Sick leave cascade:**
1. Worker declares sick via WhatsApp → Halil notified
2. Halil approves/overrides the number of sick days
3. If AOK later approves fewer days than the worker was absent, Halil adjusts:
   - AOK-approved days → logged as sick (Krank)
   - Remaining days → deducted from paid vacation (Urlaub)
   - If no vacation days left → logged as unpaid leave
4. Halil can override any of these assignments at any time

**Vacation entitlement:**
- New workers: 2 days per full month worked, 1 day if started mid-month
- Existing workers: custom entitlement set by Halil (e.g., 27 days for senior employees)
- System tracks remaining balance, warns when low

### Missing Checkout Handling

1. After X hours without checkout (configurable, e.g., 10 hrs), worker receives WhatsApp reminder: "Hast du vergessen auszuchecken?"
2. If still no checkout by midnight, entry is flagged as "Vergessen" (forgotten)
3. No valid work entry until Halil resolves it in the dashboard
4. Halil can set the correct check-out time manually

### Anomaly Detection

The admin dashboard flags:
- Missing checkouts
- Unusually long shifts (configurable threshold)
- Workers consistently above peer average hours

### WhatsApp Notifications to Halil

- Sick declarations (immediate)
- Missing checkouts (end of day)
- Anomalies requiring attention
- End-of-month: "Monatsbericht fuer [Month] ist bereit zur Pruefung"
- Quick-reply buttons in WhatsApp: "OK" / "Bearbeiten" (opens admin dashboard)

### Monthly Steuerberater Report (PDF)

- Auto-generated at month end
- **Professional design** with Bal Hausmeisterservice logo, clean layout, excellent visuals
- Contains per employee: name, worked hours, sick days, vacation days, overtime, harcirah days
- Format improved from current Excel but contains all the same data
- Halil reviews in dashboard → downloads PDF → sends to Steuerberater

### Data Model (Key Entities)

- **Worker:** name, phone_number (WhatsApp, unique identifier), type (full-time/minijob), hourly rate, monthly salary, registration date, vacation entitlement
- **TimeEntry:** worker_id, date, check_in, check_out, is_flagged, flag_reason, is_official
- **SickLeave:** worker_id, start_date, declared_days, aok_approved_days, vacation_deducted_days, unpaid_days, status (pending/approved/overridden)
- **VacationBalance:** worker_id, year, entitlement_days, used_days, remaining_days
- **MonthlyReport:** month, year, generated_at, pdf_url, status (draft/reviewed/sent)

---

## Module 2: Task Scheduling (Hausmeisterliste)

### Purpose

Replace the weekly Excel task sheet. Manage contracted property tasks, ad-hoc extra jobs, worker/team assignments, and real-time job tracking with photo documentation.

### Properties

- ~36 contracted properties across Pfaffenhofen, Scheyern, and Hettenshausen
- Each property has a fixed address and a set of standard tasks (e.g., "alles", "TH reinigen", "Aussenanlagen und Muell")
- Properties are assigned to specific weekdays (mostly stable, configurable by Halil)
- New properties can be added; existing ones can be deactivated

### Teams & Assignment

- **Flexible teams:** Halil creates ad-hoc teams daily — solo workers or groups (e.g., "Erdi + Marwa")
- No fixed team structure — composition changes based on availability, sick workers, new trainees
- Halil assigns properties to teams via the admin dashboard
- All team members receive WhatsApp notifications for their assignments

### Daily Worker Flow (WhatsApp)

1. **Morning:** Worker receives task list via WhatsApp:
   ```
   Deine Aufgaben fuer Montag 24.03:
   1. Scherrerweg 5, Scheyern — alles + braun Tonnen raus bio
   2. Marienstr. 13, Scheyern — alles, Aschebox
   3. Guckenbuehl 1b, Scheyern — alles
   ```
2. **At each property:** Worker taps [Erledigt] → prompted to take a photo → photo uploaded → next task
3. **Cannot do / postpone:** Worker taps [Nicht moeglich] → selects reason (e.g., "Zugang nicht moeglich", "Verantwortlicher nicht da") → Halil notified, job flagged for rescheduling

### Live Dashboard (Halil)

Real-time overview of the day:
```
Monday 24.03 — Live

Team Erdi + Marwa:  done Scherrerweg 5  |  in progress Marienstr. 13  |  pending Guckenbuehl 1b
Team Dorde:         done Niederscheyererstr. 96  |  pending Marienstr. 5
Unassigned:         pending Tedi + Hermann
Postponed:          Hochstr. 1 (Zugang nicht moeglich)
```

- **Reassign jobs mid-day:** Drag & drop or tap to move unfinished jobs between workers/teams
- Worker gets WhatsApp update: "Neue Aufgabe: [address]" or "Aufgabe [address] entfernt"

### Carryover & Postponement Rules

- **Unfinished jobs carry over:** If Monday's list isn't completed, remaining jobs automatically appear on Tuesday's list (added to Tuesday's regular jobs)
- **Postponed jobs:** Halil reschedules to a specific date/time via dashboard
- **Early finish:** If workers complete their day early, they can pull jobs from the next day

### Extra Jobs (Non-Contracted)

- Created by Halil in the dashboard: description, address, assigned worker/team
- Worker receives via WhatsApp, reports completion with:
  - Photo(s) of completed work
  - Time in / time out (separate from regular check-in/out, specific to this job)
- Tracked separately from contracted property tasks

### Data Model (Key Entities)

- **Property:** address, city, standard_tasks, assigned_weekday, is_active
- **Team:** date, members (worker_ids), created_by Halil
- **TaskAssignment:** property_id, team_id, date, status (pending/in_progress/done/postponed/carried_over), photo_url, completed_at, postpone_reason
- **ExtraJob:** description, address, assigned_team_id, date, time_in, time_out, photo_urls, status

---

## Module 3: Garbage Bin Management (Muellliste)

### Purpose

Replace the weekly Excel garbage schedule. Auto-generate bin tasks from AWP collection schedules and merge them into the daily task list from Module 2.

### Source Data

- **28 PDF files** from AWP (Abfallwirtschaft Pfaffenhofen), one per property address
- Located in a designated upload folder
- Each PDF contains the yearly collection schedule with exact dates for 4 trash types:

| Trash Type | Color | Typical Frequency |
|------------|-------|-------------------|
| Restmuell (residual) | Grey | ~26 dates/year |
| Biomuell (organic) | Brown | ~26 dates/year |
| Papier (paper/cardboard) | Green | ~13 dates/year |
| Gelber Sack (recycling) | Yellow | ~26 dates/year |

- **No frequency assumptions** — the system reads exact dates from the PDFs. Holidays and schedule shifts are already reflected in the AWP documents.

### PDF Parsing & Import

1. Halil uploads new AWP PDFs (yearly, when the new schedule is published)
2. System parses each PDF: extracts property address, trash type columns (identified by column color), and all collection dates
3. Dates are stored in the database, mapped to the corresponding property from Module 2
4. If a PDF address doesn't match an existing property, Halil is prompted to map it manually

### Auto-Generated Tasks

For each collection date in the AWP schedule, the system creates two tasks:

| Task | When | Example |
|------|------|---------|
| **Tonnen raus** (bins out) | 1 day before collection date | "gelb Tonnen raus — Ziegelstr. 94" on Wednesday |
| **Tonnen rein** (bins back) | Collection date, afternoon | "gelb Tonnen rein — Ziegelstr. 94" on Thursday |

### Integration with Module 2

- Garbage tasks are **merged into the regular property task list** — not separate entries
- If a worker is already assigned to a property that day, the garbage task appears as part of their entry:
  ```
  Marienstr. 13, Scheyern — alles, Aschebox + braun Tonnen raus bio
  ```
- If no worker is assigned to that property on a garbage day, the task appears as **unassigned** in Halil's dashboard for him to assign
- Garbage tasks follow the same completion flow: worker marks done (no photo required for garbage tasks — bins are routine)

### Yearly Update Flow

1. AWP publishes new yearly schedule (typically late in the prior year)
2. Halil downloads the PDFs from AWP website (one per address)
3. Uploads them to the system via the admin dashboard
4. System parses and replaces the schedule for the new year
5. All auto-generated tasks update accordingly

### Data Model (Key Entities)

- **GarbageSchedule:** property_id, trash_type (restmuell/bio/papier/gelb), collection_date, source_pdf
- **GarbageTask:** garbage_schedule_id, task_type (raus/rein), due_date, assigned_task_id (links to Module 2 TaskAssignment), status

---

## Cross-Module Integration

### Unified Daily View

Halil's dashboard shows a single daily view combining:
- Regular property tasks (Module 2)
- Garbage tasks merged into property entries (Module 3)
- Worker check-in/out status (Module 1)
- Sick/absent workers highlighted

### Shared Data

- **Workers** are shared across all modules — same worker entity for time tracking and task assignment
- **Properties** are shared between Module 2 (task scheduling) and Module 3 (garbage management)
- Teams assigned in Module 2 automatically receive garbage tasks for their properties

### WhatsApp as Single Channel

Workers use one WhatsApp number for everything:
- Check in / check out / sick (Module 1)
- Receive task lists, mark done, send photos (Module 2 + 3)
- All through button-based menus — no free text processing

---

## Non-Functional Requirements

- **Language:** German UI for workers (WhatsApp messages) and admin dashboard
- **Data privacy:** GDPR compliant, hosted in Germany (Hetzner), no data shared with third parties
- **Availability:** System should be available during working hours (5:00-20:00). Brief maintenance windows acceptable overnight.
- **Backup:** Daily automated PostgreSQL backups
- **Mobile-friendly:** Admin dashboard must work well on tablet and phone (Halil may use it on the go)
