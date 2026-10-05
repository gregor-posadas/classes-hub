# Classes Hub

All of Gregor's classes for the semester in one place, read from bCourses: what's due this week across every course, what's overdue or missing, what's already turned in, and announcements. Same design and code base as the [Microbe Busters Hub](https://github.com/gregor-posadas/microbe-busters-hub), trimmed down for one person instead of a team.

- **Website:** plain HTML, CSS and JavaScript, served by GitHub Pages. No build step.
- **Data:** the Google Sheet "Classes Hub data" in your Drive. Nothing about your courses is stored in this repository.
- **Backend:** a Google Apps Script web app attached to that Sheet. Every 2 hours it reads your courses, assignments (with your submission status) and announcements from bCourses through the Canvas API, keeps them in the Sheet, puts every due date on a "Fall 2026 classes" Google Calendar, and emails you at 8 AM on days with something to say.
- **Read only:** the hub never submits, posts or changes anything on bCourses.
- **Google Calendar, both ways:** events from the calendars you pick show on This week, the month calendar and each day's page (read only), and every due date goes onto a "<term> classes" calendar.
- **Microbe Busters Hub:** with the team code added, your assignments there show up under DevEng C200, and marking one done here marks it done there too.
- **Font:** Atkinson Hyperlegible Next, under the SIL Open Font License (`fonts/OFL.txt`).

Until the backend is connected, the site runs on sample courses from `data/demo.json`, with the dates moved to the current week so it always looks like a real week.

## What's in the hub

| Page | What it's for |
| --- | --- |
| **This week** | Semester clock and how much of the work due so far is done, anything overdue, and the next 7 days grouped by day with your calendar events. A side column has a clock, a month calendar (dots for what's due, in course colors, and a dash for events), what's next on your calendar, and this week's announcements. A card for each course sits below. Point at any assignment, event or announcement for a preview. |
| **Day page** | Everything due on one day plus that day's events. Open it from the month calendar or a day heading. |
| **Course page** | Everything for one course by due date, its announcements, an **Open on bCourses** button, and a button to a team hub if it has one (DevEng C200 links to the Microbe Busters Hub). **Course settings** lets you rename or hide a course. |
| **Assignment page** | Due date, what bCourses says (submitted, missing, graded), the instructions from bCourses, **Open on bCourses**, **Add to Google Calendar**, and your own progress (To do, In progress, Done). |
| **All work** | Every assignment and to-do by week, filtered by course and by still to do, done or everything. |
| **Announcements** | The last 30 days from every course, newest first. |
| **About and settings** | Morning email setting, **Check bCourses now**, what the symbols mean, and common questions. |

**Done means done.** Anything you submit on bCourses is marked done on its own at the next check. Work turned in on paper, in class or on another site (Gradescope, say) won't show as submitted on bCourses, so set it to Done yourself.

**Your own to-dos.** **Add a to-do** puts anything that isn't a bCourses assignment (a reading, a lab slot, a personal deadline) in the same lists, emails and calendar.

**Course colors.** Courses get the figure palette in order: blue `#385F96`, orange `#CF5921`, light blue `#9EB8DB`, gold `#E7B800`, maroon `#800000`. Every course badge also shows the course number as text, so color is never the only clue, and it reads the same in grayscale. A sixth course would reuse blue, still with its own number.

## Set up the backend (about 15 minutes, once)

1. **Turn on the site.** On GitHub, open this repo's **Settings > Pages**. Under Build and deployment, set Source to **Deploy from a branch**, pick **main** and **/(root)**, and save. The site appears at `https://gregor-posadas.github.io/classes-hub/` within a few minutes, on sample data for now.
2. **Retire the old token.** In bCourses, go to **Account > Settings**, find the "Personal project management tool" token under Approved Integrations, and delete it. It was pasted into a chat, so it shouldn't be used. Don't make the new one yet.
3. In Google Drive, create a blank Google Sheet named **Classes Hub data**, with the same Google account as the Microbe Busters Hub (if **Anyone** isn't offered in step 7, see below).
4. In the Sheet, go to **Extensions > Apps Script**. Delete whatever is in `Code.gs` and paste in the contents of `apps-script/Code.gs` from this repository.
5. Click the gear icon (**Project Settings**) and tick **Show "appsscript.json" manifest file in editor**. Back in the editor, open `appsscript.json` and replace it with `apps-script/appsscript.json`. Save.
6. In the function menu at the top, pick `setup` and click **Run**. Approve the permissions when Google asks (Sheets, Calendar, connecting to an external service, send email). Open **Execution log** and copy your **access code**. Lost it? It's under **Project Settings > Script properties** as `ACCESS_CODE`.
7. Click **Deploy > New deployment**, choose type **Web app**, set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**. Copy the URL that ends in `/exec`.
8. Put that URL in `assets/config.js` as `apiUrl`, run `sh scripts/stamp-version.sh`, then commit and push. (Or hand the URL to Claude to do it.)
9. Open the site, enter the access code, and go to **About and settings**. Under **bCourses**, follow the three steps there to make a new token in bCourses (Purpose "Classes Hub", expiry after Dec 18), paste it in, and click **Connect bCourses**. The hub checks it with bCourses, saves it, and reads your classes right away.
10. Look over your courses. Hide any that aren't classes (a department or orientation site) from **Course settings** on their course page.

The token goes only through the box in step 9 (or, if you prefer, straight into Script properties as `CANVAS_TOKEN`). Never put it in this repository or the Sheet. The site can replace the token but never show it.

When you change `Code.gs` later, use **Deploy > Manage deployments > Edit > New version** so the `/exec` URL stays the same.

### If "Anyone" is not offered

Some university Google accounts only allow web apps for people signed in to that university, and the GitHub Pages site can't use such a backend. Use a personal Google account for the Sheet and the script instead (the hub only needs your bCourses token, not your Berkeley Google account). If you want it under your Berkeley account anyway, ask for the small change that serves the site from Apps Script itself.

## Updating the backend after a change to `Code.gs`

1. In the Apps Script editor, replace `Code.gs` with the new one from this repo, and `appsscript.json` too.
2. If Google asks, approve the new permissions (Run `setup` once to trigger the prompt; it changes nothing that's already set up).
3. **Deploy > Manage deployments**, pencil icon, Version: **New version**, **Deploy**. The `/exec` URL stays the same.

The Google Calendar events need the Google Calendar API service, which the new `appsscript.json` turns on. If the site says to turn it on, open **Services** (the + next to it) in the editor, add **Google Calendar API**, and deploy a new version.

## Settings you can change without editing code

All in **Project Settings > Script properties**:

| Property | What it does | Default |
| --- | --- | --- |
| `CANVAS_TOKEN` | Your bCourses token. Usually set from the site under About and settings > bCourses. | |
| `ACCESS_CODE` | The code the site asks for. Change it to lock out old devices. | made by `setup` |
| `OWNER_EMAIL` | Where the morning email goes. | the account that ran `setup` |
| `APP_URL` | The site's address, for links in emails and calendar events. | `https://gregor-posadas.github.io/classes-hub/` |
| `TERM` | Which bCourses term counts as this semester. | `Fall 2026` |
| `EMAIL_PREF` | `daily`, `weekly` (Mondays) or `off`. Also set on the About page. | `daily` |
| `CALENDAR_SYNC` | `off` keeps due dates off Google Calendar. Run `clearCalendar` once to remove the ones already there. | `on` |
| `TEAM_HUB_CODE` | The Microbe Busters team code. Set from the site under About and settings. | |
| `TEAM_HUB_MEMBER` | Your id in the team hub. | `gregor` |
| `CAL_EXCLUDE` | Google calendars left out of the hub. Set from the site under About and settings. | the team hub's deadlines calendar |
| `LINKED_HUBS` | JSON list of `{match, url, label}`: courses whose code matches get a button to that hub. | DevEng C200 → Microbe Busters, DevEng 203 → Lagmay Visit |

## A new semester

The same repo, site address and Sheet carry over. Each new semester:

1. In Script properties, change `TERM` (for example to `Spring 2027`) and `SEMESTER_START` and `SEMESTER_END`.
2. In `assets/config.js`, change `semesterLabel`, `semesterStart` and `semesterEnd`. Run `sh scripts/stamp-version.sh`, commit and push.
3. If the token expired, make a new one in bCourses and paste it under **About and settings > bCourses** (works from a phone).
4. Run `syncCanvas`. Last semester's courses are hidden on their own, and their history stays in the Sheet.
5. Optional: rename the calendar in Google Calendar (for example to "Spring 2027 classes"). The hub keeps using the same one.

## The morning email

- 8 AM Pacific, at most once a day, and only on days with something to say.
- What's **overdue** (the day after, then every third day, for up to 3 weeks), what's **due in the next 2 days**, assignments **new on bCourses** since the last email, and **announcements**. Every item links to its page in the hub, with a second link to bCourses.
- **Mondays only** sends one email with the whole week. The first bCourses read doesn't count as "new", so you won't get one giant email on day one.

## Checking the backend logic

`node tests/backend.test.js` runs the bCourses parsing and merge logic in `Code.gs` against Canvas-shaped sample data: paging, picking the term's courses, submission states, turning bCourses HTML into the hub's text, and keeping your own status across syncs.
