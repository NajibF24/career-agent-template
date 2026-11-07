import { scan } from "./scan.js";
import { score } from "./score.js";
import { draft } from "./draft.js";
import { notify } from "./notify.js";

const step = process.argv[2] || "all";
const steps = { scan, score, draft, notify };

if (step === "all") {
  await scan();
  await score();
  await draft();
  await notify();
} else if (steps[step]) {
  await steps[step]();
} else {
  console.error(`usage: node src/run.js <scan|score|draft|notify|all>`);
  process.exit(1);
}
