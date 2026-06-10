output "catalog_table_name" {
  description = "Nombre de la tabla DynamoDB del catálogo"
  value       = module.catalog_dynamodb.table_name
}

output "dynamodb_endpoint" {
  description = "Endpoint DynamoDB local (Floci/LocalStack)"
  value       = "http://localhost:4566"
}

output "lambda_function_name" {
  description = "Nombre de la Lambda de ingesta del catálogo"
  value       = module.lambda_ingest.function_name
}

output "lambda_event_rule_name" {
  description = "Nombre de la regla EventBridge horaria"
  value       = module.lambda_ingest.event_rule_name
}
