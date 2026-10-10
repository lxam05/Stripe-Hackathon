import { cancelLegacySeededStripeCards } from "../src/lib/cards";

cancelLegacySeededStripeCards()
  .then((count) => {
    console.log(`[stripe] cancelled ${count} legacy seeded card${count === 1 ? "" : "s"}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
