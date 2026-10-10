import { prepareDemo } from "../src/lib/demo-prep";

prepareDemo((message) => console.log(`[demo] ${message}`))
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
