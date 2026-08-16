import { generateIntakeQuestions, summarizeIntake } from "../src/lib/ai/intake.server";

const cases: [string, string, string[]][] = [
  ["T1", "My engine makes a weird humming noise.", ["diagnostics"]],
  ["T2", "There's a clunk when I go over bumps.", ["diagnostics"]],
  ["T3", "My steering wheel shakes when I brake on the freeway.", ["brakes"]],
  ["T4", "There's some kind of fluid leaking under my car.", ["diagnostics"]],
  ["T5", "My check engine light is flashing.", ["diagnostics"]],
  ["T6", "Sometimes it won't start.", ["battery"]],
  ["T7", "I need my fluids changed but I don't know which ones have been done.", ["fluid_service"]],
  ["T8", "It hums when I accelerate and the check engine light came on yesterday.", ["diagnostics"]],
  ["T9-oil", "I need an oil change.", ["oil_filter"]],
];

for (const [name, notes, keys] of cases) {
  const r = await generateIntakeQuestions({
    language: "en",
    vehicle: { year: 2015, make: "Toyota", model: "Camry" },
    mileage: "95000",
    services: keys.map((k) => ({ label: k, answers: [] })),
    serviceKeys: keys,
    notes,
    round: 1,
  });
  console.log("=====", name, notes, "mayContinue:", r.mayContinue, "degraded:", r.degraded);
  for (const q of r.questions)
    console.log(` [${q.concern}/${q.category}] ${q.answerType}${q.allowOther ? " +other" : ""} :: ${q.question}\n    ${q.options.join(" | ")}`);
}

const sum = await summarizeIntake({
  language: "en",
  notes: "My engine makes a weird humming noise.",
  services: ["Diagnostics"],
  followups: [
    { questionId: "r1q1", question: "What does the noise sound like?", answer: "Humming / Hum", category: "sound_type", skipped: false, concern: "noise" },
    { questionId: "r1q2", question: "When do you notice it?", answer: "Accelerating", category: "when_it_occurs", skipped: false, concern: "noise" },
    { questionId: "r1q3", question: "Does it get louder as the engine revs?", answer: "Yes", category: "rpm_effect", skipped: false, concern: "noise" },
  ],
});
console.log("SUMMARY:", sum);
