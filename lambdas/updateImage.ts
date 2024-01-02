import { SQSHandler } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";

const dynamoDBClient = new DynamoDBClient();
const client = new SQSClient({ region: "eu-north-1" });

interface S3EventRecord {
  s3: {
    object: {
      key: string;
    };
  };
}

interface SNSMessage {
  Records: S3EventRecord[];
  description?: string; // Update this based on the actual structure
}

export const handler: SQSHandler = async (event) => {
  console.log("SQS Event ", JSON.stringify(event));

  for (const record of event.Records) {
    try {
      console.log(record);
      const snsMessageAttribute = record.Sns;
      console.log(snsMessageAttribute);
      const commentType = snsMessageAttribute.MessageAttributes;
      console.log(commentType);
      const snsMessageContent = JSON.parse(snsMessageAttribute.Message);

      const imageName = snsMessageContent.name;
      const description = snsMessageContent.description;

      console.log("Image Name:", imageName);
      console.log("Description:", description);
      console.log("Comment Type:", commentType);

      console.log('Parsed SNS Message:', JSON.stringify(snsMessageContent));

      // Update the item in DynamoDB with the description
      const updateParams = {
        TableName: 'Images',
        Key: {
          'ImageName': { S: imageName },
        },
        UpdateExpression: 'SET Description = :description',
        ExpressionAttributeValues: {
          ':description': { S: description },
        },
      };
      console.log('Update Params:', JSON.stringify(updateParams));


      await dynamoDBClient.send(new UpdateItemCommand(updateParams));

      console.log(`Item updated successfully for key: ${imageName}`);
    } catch (error) {
      console.error('Error:', error);
      throw error;
    }
  }

  return Promise.resolve(); // Move the return statement outside the for loop
};

  
  



