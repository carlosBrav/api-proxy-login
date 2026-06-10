terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region                      = "us-east-1"
  profile                     = "local"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    apigateway      = "http://localhost:4566"
    cognitoidp      = "http://localhost:4566"
    cognitoidentity = "http://localhost:4566"
    dynamodb        = "http://localhost:4566"
    events          = "http://localhost:4566"
    ecr             = "http://localhost:4566"
    ecs             = "http://localhost:4566"
    elasticache     = "http://localhost:4566"
    iam             = "http://localhost:4566"
    lambda          = "http://localhost:4566"
    s3              = "http://localhost:4566"
    secretsmanager  = "http://localhost:4566"
    sns             = "http://localhost:4566"
    wafv2           = "http://localhost:4566"
  }
}
