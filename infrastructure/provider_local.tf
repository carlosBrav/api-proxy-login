# provider_local.tf

provider "aws" {
  region                      = "us-east-1"
  access_key                  = "mock_key"
  secret_key                  = "mock_secret"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    cognitoidp  = "http://localhost:4566"
    elasticache = "http://localhost:4566"
    dynamodb    = "http://localhost:4566"
    apigateway  = "http://localhost:4566"
    iam         = "http://localhost:4566"
    cloudwatch  = "http://localhost:4566"
  }
}