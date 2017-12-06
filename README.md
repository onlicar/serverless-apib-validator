# serverless-apib-validator

> 📘 Validate that an API Blueprint has full coverage over a Serverless config

Before deploying, this Serverless plugin will parse an API blueprint from the config and validate that every lambda function with an HTTP event is documented.

### Installation

```
npm i serverless-apib-validator --save-dev
```

### Usage

```yml
server: your-service

plugins:
  - serverless-apib-validator

functions:
  # Your functions here

custom:
  apibValidator:
    blueprintFile: '../my-docs.apib' # Defaults to apiary.apib
    basePath: '/your-service' # If you have many microservices in directories, you can define a prefix such as /your-service
```
