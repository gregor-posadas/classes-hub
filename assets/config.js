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
    years: 5,
    expected: "Spring 2031",
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
        modules: { m1: "Module 1, project design", m2: "Module 2, evaluation and social impact", m3: "Module 3, technology development" }
      }
    },
    sources: [
      { label: "CEE environmental engineering requirements", url: "https://ce.berkeley.edu/programs/env/graduate-requirements" },
      { label: "the DevEng DE required courses", url: "https://developmentengineering.berkeley.edu/programs/deveng-de-for-phd/required-courses/" }
    ]
  }
};
