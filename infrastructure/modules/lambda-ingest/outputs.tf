output "function_name" {
  description = "Nombre de la función Lambda de ingesta"
  value       = aws_lambda_function.ingest.function_name
}

output "function_arn" {
  description = "ARN de la función Lambda de ingesta"
  value       = aws_lambda_function.ingest.arn
}

output "event_rule_name" {
  description = "Nombre de la regla EventBridge horaria"
  value       = aws_cloudwatch_event_rule.hourly.name
}

output "event_rule_arn" {
  description = "ARN de la regla EventBridge horaria"
  value       = aws_cloudwatch_event_rule.hourly.arn
}

output "iam_role_arn" {
  description = "ARN del rol IAM de la Lambda"
  value       = aws_iam_role.lambda.arn
}
