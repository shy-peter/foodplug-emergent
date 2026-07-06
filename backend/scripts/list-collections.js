const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { Client, Databases, Query } = require("node-appwrite");

async function main() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const db = new Databases(client);
  const res = await db.listCollections({
    databaseId: process.env.APPWRITE_DATABASE_ID,
    queries: [Query.limit(100)],
  });

  if (!res.collections.length) {
    console.log("(none)");
    return;
  }

  for (const collection of res.collections) {
    console.log(collection.$id);
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
