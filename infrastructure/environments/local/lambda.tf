data "archive_file" "lambda_ingest" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda-ingest-lobby/dist"
  output_path = "${path.module}/.build/lambda-ingest-lobby.zip"

  depends_on = [null_resource.lambda_build]
}

resource "null_resource" "lambda_build" {
  triggers = {
    sources = sha256(join("", [
      for f in fileset("${path.module}/../../../lambda-ingest-lobby/src", "**/*.ts") :
      filesha256("${path.module}/../../../lambda-ingest-lobby/src/${f}")
    ]))
    package_json = filesha256("${path.module}/../../../lambda-ingest-lobby/package.json")
  }

  provisioner "local-exec" {
    command     = "npm install && npm run build:lambda"
    working_dir = "${path.module}/../../../lambda-ingest-lobby"
  }
}

module "lambda_ingest" {
  source = "../../modules/lambda-ingest"

  function_name      = var.lambda_function_name
  event_rule_name    = var.lambda_event_rule_name
  catalog_table_arn  = module.catalog_dynamodb.table_arn
  lambda_zip_path    = data.archive_file.lambda_ingest.output_path
  lambda_source_hash = data.archive_file.lambda_ingest.output_base64sha256

  environment_variables = {
    INGEST_COMPANY     = var.ingest_company
    INGEST_LOBBY       = var.ingest_lobby
    CATALOG_TABLE_NAME = module.catalog_dynamodb.table_name
    GET_LOBBY_URL      = var.get_lobby_url
    DYNAMODB_ENDPOINT  = var.dynamodb_endpoint
    AWS_REGION         = "us-east-1"
  }

  tags = {
    Project     = "bff-mv-streaming-col"
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  depends_on = [module.catalog_dynamodb]
}
