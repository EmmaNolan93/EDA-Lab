import { SQSHandler } from "aws-lambda";
import { SESClient, SendEmailCommand, SendEmailCommandInput } from "@aws-sdk/client-ses";
// import AWS from 'aws-sdk';
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
  throw new Error(
    "Please add the SES_EMAIL_TO, SES_EMAIL_FROM and SES_REGION environment variables in an env.js file located in the root directory"
  );
}

type ContactDetails = {
  name: string;
  email: string;
  message: string;
};

const sesClient = new SESClient({ region: "eu-north-1" });

type RejectionDetails = {
  error: string;
  object_key: string;
};

export const handler: SQSHandler = async (event: any) => {
  console.log("Event ", event);

  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);
    const rejectionDetails: RejectionDetails = recordBody;

    try {
      // Extract information from the DLQ message
      const { error, object_key } = rejectionDetails;

      // Construct email content
      const emailContent = `File with key ${object_key} was rejected: ${error}`;

      // Replace with your SES_EMAIL_TO and SES_EMAIL_FROM
      const params = sendEmailParams({
        email: SES_EMAIL_FROM,
        message: emailContent,
        name: "Image Rejection",
      });

      // Send email using SES
      await sesClient.send(new SendEmailCommand(params));
    } catch (error: unknown) {
      console.log("ERROR is: ", error);
      // Handle error as needed
    }
  }
};

function sendEmailParams({ name, email, message }: ContactDetails) {
  const parameters: SendEmailCommandInput = {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: getHtmlContent({ name, email, message }),
        },
        // Text: {
        //   Charset: "UTF-8",
        //   Data: getTextContent({ name, email, message }),
        // },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `New image Upload`,
      },
    },
    Source: SES_EMAIL_FROM,
  };
  return parameters;
}
function getHtmlContent({ name, email, message }: ContactDetails) {
    return `
      <html>
        <body>
          <h2>Sent from: </h2>
          <ul>
            <li style="font-size:18px">👤 <b>${name}</b></li>
            <li style="font-size:18px">✉️ <b>${email}</b></li>
          </ul>
          <p style="font-size:18px">${message}</p>
        </body>
      </html> 
    `;
  }
  
  function getTextContent({ name, email, message }: ContactDetails) {
    return `
      Received an Email. 📬
      Sent from:
          👤 ${name}
          ✉️ ${email}
      ${message}
    `;
  }

