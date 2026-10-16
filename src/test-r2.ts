import "dotenv/config";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";

async function test() {
  console.log("Testing R2 connection...");
  const accountId = process.env.R2_ACCOUNT_ID || "7bc4918169a8d49565bd9774e68af836";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    console.error("Missing R2 credentials in environment variables");
    return;
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true,
  });

  try {
    const res = await client.send(new ListBucketsCommand({}));
    console.log(
      "Success! Buckets:",
      res.Buckets?.map((b) => b.Name)
    );
  } catch (err) {
    console.error("Error connecting:");
    console.error(err);
  }
}

test();
