import { S3Handler, S3Event } from "aws-lambda";
import { DynamoDBClient, DeleteItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";

const dynamoDBClient = new DynamoDBClient();

export const handler: S3Handler = async (event: S3Event) => {
  console.log("Event ", JSON.stringify(event));

  try {
    for (const record of event.Records) {
      const s3e = record.s3;
      const key = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));

      // Check if key is present and not null
      if (key) {
        try {
          // Check if the item exists in DynamoDB
          /*await dynamoDBClient.send(new GetItemCommand({
            TableName: 'Images',
            Key: {
              'ImageName': { S: key },
            },
          }));*/

          // If the item exists, delete it
          await dynamoDBClient.send(new DeleteItemCommand({
            TableName: 'Images',
            Key: {
              'ImageName': { S: key },
            },
          }));
        } catch (getItemError) {
          console.error(`Item with key ${key} not found in DynamoDB. Skipping deletion.`);
        }
      } else {
        console.error('Key is null or undefined. Skipping DynamoDB deletion.');
      }
    }

    return Promise.resolve();
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};



