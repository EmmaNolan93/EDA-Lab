import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

import { Construct } from "constructs";

export class EDAAppStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    //create table for images
    const imagesTable = new dynamodb.Table(this, 'ImagesTable', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: 'ImageName', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: 'Images',
    });

    // Output
    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });

    // Integration infrastructure
    const rejectionQueue = new sqs.Queue(this, "bad-image-q", {
      retentionPeriod: cdk.Duration.minutes(30),
    });

    const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
      deadLetterQueue: {
        queue: rejectionQueue,
        maxReceiveCount: 1,
      },
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const mailerQ = new sqs.Queue(this, "mailer-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const newImageTopic = new sns.Topic(this, "NewImageTopic", {
      displayName: "New Image topic",
    });
    const deleteImageTopic = new sns.Topic(this, "DeleteImageTopic", {
      displayName: "Delete Image topic",
    });
    // Lambda functions
    const updateImageFn = new lambdanode.NodejsFunction(
      this,
      "UpdateImageFn",
      {
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambdas/updateImage.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: imagesTable.tableName,
        },
      }
    );

    const processImageFn = new lambdanode.NodejsFunction(
      this,
      "ProcessImageFn",
      {
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: `${__dirname}/../lambdas/processImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imagesTable.tableName,
          REGION: 'eu-north-1',
          QUEUE_URL: imageProcessQueue.queueUrl,
          MAILER_QUEUE_URL: mailerQ.queueUrl,
        },
      }
    );

    const deleteImageFn = new lambdanode.NodejsFunction(this, 'DeleteImageFn', {
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambdas/deleteImage.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: imagesTable.tableName,
        REGION: "eu-north-1",
      },
    });

    const mailerFn = new lambdanode.NodejsFunction(this, "mailer-function", {
      runtime: lambda.Runtime.NODEJS_16_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `${__dirname}/../lambdas/mailer.ts`,
    });

    const failedImagesFn = new lambdanode.NodejsFunction(this, "FailedImagesFn", {
      runtime: lambda.Runtime.NODEJS_16_X,
      entry: `${__dirname}/../lambdas/rejectMailer.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    mailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    failedImagesFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    // Event triggers
    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(newImageTopic),
    );
    // Event triggers
    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      new s3n.SnsDestination(deleteImageTopic),
    );

    newImageTopic.addSubscription(
      new subs.LambdaSubscription(processImageFn, {
        filterPolicyWithMessageBody: {
          Records: sns.FilterOrPolicy.policy({
            eventName: sns.FilterOrPolicy.filter(sns.SubscriptionFilter.stringFilter({
              matchPrefixes: ['ObjectCreated']
            }))
          })
        }
      })
    );

    deleteImageTopic.addSubscription(
      new subs.LambdaSubscription(deleteImageFn, {
        filterPolicyWithMessageBody: {
          Records: sns.FilterOrPolicy.policy({
            eventName: sns.FilterOrPolicy.filter(sns.SubscriptionFilter.stringFilter({
              matchPrefixes: ['ObjectRemoved']
            }))
          })
        }
      })
    );

    // Set up event sources
    const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(10),
      maxConcurrency: 2,
    });

    const newImageMailEventSource = new events.SqsEventSource(mailerQ, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(10),
    });

    failedImagesFn.addEventSource(
      new events.SqsEventSource(rejectionQueue, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
        maxConcurrency: 2,
      })
    );

    const updateTableEventSource = new events.SnsEventSource(newImageTopic);

    const deleteImageEventSource = new events.S3EventSource(imagesBucket, {
      events: [s3.EventType.OBJECT_REMOVED],
    });

    // Add event sources to Lambda functions
    deleteImageFn.addEventSource(deleteImageEventSource);
    processImageFn.addEventSource(newImageEventSource);
    mailerFn.addEventSource(newImageMailEventSource);
    updateImageFn.addEventSource(updateTableEventSource);

    // Permissions
    imageProcessQueue.grantSendMessages(processImageFn);
    mailerQ.grantSendMessages(processImageFn);
    imagesBucket.grantRead(processImageFn);
    imagesBucket.grantDelete(deleteImageFn);
  }
}

