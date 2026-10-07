// Site settings. After you deploy the Apps Script web app, paste its URL
// (it ends in /exec) into apiUrl. Leave it empty to run the site on demo data.
window.CH_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/AKfycbzYY_Fv4nRNWHtdtQWLudLYy_nRUny-n2DC4s8RkaJZVbYnNn8bg803jQEwqkXvhcsZ0Q/exec",
  timeZone: "America/Los_Angeles",
  ownerName: "Gregor",
  bcoursesUrl: "https://bcourses.berkeley.edu",
  // Fall 2026 at Berkeley: instruction begins Aug 26, the semester ends Dec 18 (registrar's academic calendar)
  semesterLabel: "Fall 2026",
  semesterStart: "2026-08-26",
  semesterEnd: "2026-12-18",
  lastInstruction: "2026-12-11",   // office hours run through this day
  // The PhD page. Your own courses, milestones, questions and contacts live in the Sheet, not here.
  phd: {
    program: "CEE PhD in Environmental Engineering, with the Development Engineering Designated Emphasis",
    firstYear: 2026,   // Year 1 starts in Fall of this year
    start: "2026-08-26",   // for the "time at Berkeley" bar
    end: "2031-05-15",     // about the end of Spring 2031; move it if your plan changes
    years: 5,
    expected: "Spring 2031",
    // Meetings with your advisor: events whose title matches, the notes doc (a row in the "PhD links" tab), and whose questions to show
    plannerUntil: "Spring 2028",   // the planner shows fall and spring terms up to here (your qualifying exam)
    fullTime: 12,                  // units a semester for full-time enrollment
    meetings: { title: "Meetings with Kara", match: "Kara 1:1", notesLink: "pl-kara-notes", who: "Kara", whoLabel: "Kara" },
    rules: {
      total: 30,
      fields: [
        { key: "major", label: "Major", min: 12, note: "From CE 200 to 219" },
        { key: "minor-a", label: "Minor 1", min: 6, note: "At least one minor outside CEE" },
        { key: "minor-b", label: "Minor 2", min: 6, note: "No environmental engineering courses" },
        { key: "flexible", label: "Flexible", min: 6, note: "Any graduate course" }
      ],
      core: [
        { key: "water", label: "Water quality" },
        { key: "air", label: "Air quality" },
        { key: "hydrology", label: "Hydrology" }
      ],
      de: {
        label: "Development Engineering DE",
        core: ["DEVENG C200", "DEVENG 210"],
        electives: 3, minModules: 2, maxHome: 1,
        separateFromMinors: true,   // your choice: DE courses stay out of the minor fields
        steps: [
          { label: "Admitted to the DE", note: "Apply at least one semester before the qualifying exam.", milestone: "pm-de" },
          { label: "DevEng C200 done before the qualifying exam", auto: "c200" },
          { label: "A DevEng Graduate Group member on your qualifying exam committee", ok: "doing", note: "Your advisor chairs the DevEng group, so she counts as a member. (The exam chair can't be your research advisor.) Both head graduate advisors sign the exam application, CEE first." },
          { label: "A DevEng Graduate Group member on your dissertation committee", ok: "doing", note: "Covered by your advisor, the DevEng chair." },
          { label: "Development engineering themes in the dissertation", note: "For example, technology for economic and social development." }
        ],
        modules: { m1: "Module 1, project design", m2: "Module 2, evaluation and social impact", m3: "Module 3, technology development" },
        // Courses the DE list puts in more than one module, and the module a petition is aiming for.
        moduleMap: { "DEVENG 203": ["m2", "m3"], "CIVENG 282": ["m1"] }
      }
    },
    sources: [
      { label: "CEE environmental engineering requirements", url: "https://ce.berkeley.edu/programs/env/graduate-requirements" },
      { label: "the DevEng DE required courses", url: "https://developmentengineering.berkeley.edu/programs/deveng-de-for-phd/required-courses/" }
    ]
  }
};
