// Runs JEV over the labelled evaluation set and prints rules vs JEV vs combined.
//   npm run eval                     (uses JEV_MODEL)
//   npm run eval -- ~typesafe/jev-latest  (compare another Jev release)
import { computeEval, runEval } from "../src/lib/evaluation";

const model = process.argv[2];
runEval({ model, log: (s) => process.stdout.write(`\r${s.padEnd(60)}`) })
  .then(() => {
    const e = computeEval();
    console.log("\n");
    console.table(
      [e.rules, e.jev, e.combined].filter(Boolean).map((m) => ({
        config: m!.config,
        precision: m!.precision?.toFixed(2),
        recall: m!.recall?.toFixed(2),
        f1: m!.f1?.toFixed(2),
        "false flags/soc/month": m!.falseFlagsPerSocietyMonth?.toFixed(2),
        "p95 ms": m!.p95LatencyMs?.toFixed(0),
        "cost/100 $": m!.costPer100Usd?.toFixed(3),
      })),
    );
    if (e.consistency) console.log("consistency:", e.consistency);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
