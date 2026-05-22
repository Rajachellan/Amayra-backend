import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";

async function test() {
  console.log("Testing R2 connection...");
  const accountId = "0339b10e8a1c4aa8bf7d1af7c4446dff";
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: "f04d61c3f64de4166f05bdfcab809d87",
      secretAccessKey: "fd4417ab51d4ab8708d7fd4d4b89044f4b0dc56aa355419ca822948e345b80b4",
    },
    forcePathStyle: true,
  });

  try {
    const res = await client.send(new ListBucketsCommand({}));
    console.log("Success! Buckets:", res.Buckets?.map(b => b.Name));
  } catch (err) {
    console.error("Error connecting:");
    console.error(err);
  }
}

test();
