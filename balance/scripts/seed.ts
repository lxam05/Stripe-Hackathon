import { seed } from "../src/lib/seed";

seed({ log: (s) => console.log(`[seed] ${s}`) })
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
