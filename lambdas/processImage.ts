// Import necessary modules
import { SQSHandler } from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  PutItemCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  PublishCommand,
  SNSClient,
} from "@aws-sdk/client-sns";

// Create instances of AWS clients
const s3 = new S3Client();
const dynamoDBClient = new DynamoDBClient();
const snsClient = new SNSClient();

export const handler: SQSHandler = async (event) => {
  console.log("Event ", event);

  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);
    console.log('Raw SNS message ', JSON.stringify(recordBody))
    const snsMessage = JSON.parse(recordBody.Message);
    if (snsMessage.Records) {
      for (const messageRecord of snsMessage.Records) {
        const s3e = messageRecord.s3;
        const srcBucket = s3e.bucket.name;

        // Object key may have spaces or unicode non-ASCII characters.
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
        console.log("Before determining image type.");
        // Infer the image type from the file suffix.
        const typeMatch = srcKey.match(/\.([^.]*)$/);

        if (!typeMatch) {
          console.log("Could not determine the image type.");
          throw new Error("Could not determine the image type.");
        }

        const imageType = typeMatch[1].toLowerCase();
        console.log(imageType)
        // Check that the image type is supported
        if (imageType !== "jpeg" && imageType !== "png") {
          console.log(`Unsupported image type: ${imageType}`);
          
          /* Send message to DLQ
          await snsClient.send(
            new PublishCommand({
              TopicArn: 'arn:aws:sns:eu-north-1:806671454251:DLQ-Topic',
              Message: JSON.stringify({
                error: 'Invalid file type',
                object_key: srcKey,
              }),
            }) as any
          );*/
          // Write item to DynamoDB
          await dynamoDBClient.send(new PutItemCommand({
            TableName: 'Images',
            Item: {
              'ImageName': { S: srcKey },
              'ErrorType': { S: 'Invalid file type' },
            },
          }));
          
          throw new Error(`Unsupported image type: ${imageType}`);
        }

        // Process image upload 
      }
    }
  }
};


