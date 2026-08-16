import { generateIntakeQuestions } from "../src/lib/ai/intake.server";
const r = await generateIntakeQuestions({
  language: "es",
  vehicle: { year: 2016, make: "Honda", model: "Civic" },
  mileage: "120000",
  services: [{ label: "diagnostics", answers: [] }],
  serviceKeys: ["diagnostics"],
  notes: "Mi carro hace un zumbido raro cuando acelero.",
  round: 1,
});
for (const q of r.questions) console.log(`[${q.concern}/${q.category}] ${q.answerType}${q.allowOther?" +other":""} :: ${q.question}\n   ${q.options.join(" | ")}`);
// "not sure" fatigue must stop the interview.
const stop = await generateIntakeQuestions({
  language: "en", vehicle: { make: "Ford" }, services: [{ label: "diagnostics", answers: [] }],
  serviceKeys: ["diagnostics"], notes: "There is a noise somewhere.", round: 2,
  previousAnswers: [
    { question: "What does it sound like?", answer: "I'm not sure" },
    { question: "Where does it come from?", answer: "Not sure" },
    { question: "When does it happen?", answer: "Not sure" },
  ],
});
console.log("unsure-fatigue questions:", stop.questions.length);
