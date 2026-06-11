output "layer_arn" {
  description = "ARN del Lambda Layer"
  value       = aws_lambda_layer_version.layer.arn
}

output "layer_version" {
  description = "Versión del Lambda Layer"
  value       = aws_lambda_layer_version.layer.version
}
